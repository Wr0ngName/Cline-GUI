/**
 * Configuration service for storing and retrieving app settings
 * Uses electron-store with safeStorage for secure API key storage
 */

import { safeStorage } from 'electron';

import { AppConfig, AuthMethod, DEFAULT_CONFIG } from '../../shared/types';
import { ConfigurationError, ERROR_CODES } from '../errors';
import logger from '../utils/logger';

/**
 * Configuration values stored by electron-store.
 * Sensitive values (API keys, tokens) are stored encrypted.
 */
interface StoredConfig {
  encryptedApiKey?: string;
  encryptedOAuthToken?: string;
  authMethod: AuthMethod;
  workingDirectory: string;
  recentProjects: string[];
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  autoApproveReads: boolean;
}

/**
 * Interface matching electron-store API for type safety.
 * electron-store extends Conf which provides these methods.
 * We use [key: string]: unknown to satisfy Record<string, unknown> constraint.
 */
interface TypedStore {
  get<K extends keyof StoredConfig>(key: K): StoredConfig[K] | undefined;
  get<K extends keyof StoredConfig>(key: K, defaultValue: StoredConfig[K]): StoredConfig[K];
  set<K extends keyof StoredConfig>(key: K, value: StoredConfig[K]): void;
  delete<K extends keyof StoredConfig>(key: K): void;
  clear(): void;
  readonly store: StoredConfig;
}

type StoreInstance = TypedStore | null;

export class ConfigService {
  private store: StoreInstance = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;

  constructor() {
    // Don't start initialization in constructor - let ensureInitialized handle it
    // This avoids race conditions when multiple callers try to initialize
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Dynamic import for ESM-only electron-store v10
      const { default: Store } = await import('electron-store');
      // Cast to our TypedStore interface for type safety while maintaining
      // compatibility with electron-store's complex generic types
      this.store = new Store({
        name: 'config',
        defaults: {
          authMethod: 'none',
          workingDirectory: '',
          recentProjects: [],
          theme: 'system',
          fontSize: 14,
          autoApproveReads: true,
        },
      }) as unknown as TypedStore;
      this.isInitialized = true;
      // Note: Don't clear initPromise here - keep it so concurrent callers can await it
      logger.info('ConfigService initialized');
    } catch (error) {
      // Clear promise on failure so retry is possible
      this.initPromise = null;
      logger.error('Failed to initialize ConfigService', error);
      throw error;
    }
  }

  /**
   * Ensure store is initialized before use.
   * Thread-safe: multiple concurrent calls will all await the same initialization.
   */
  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    // Create promise only if not already initializing
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    await this.initPromise;
  }

  /**
   * Get the full app configuration
   */
  async getConfig(): Promise<AppConfig> {
    await this.ensureInitialized();
    if (!this.store) throw new ConfigurationError('Store not initialized', ERROR_CODES.CONFIG_LOAD_FAILED);

    const storedConfig = this.store.store;
    const apiKey = await this.getApiKey();
    const oauthToken = await this.getOAuthToken();

    return {
      ...DEFAULT_CONFIG,
      ...storedConfig,
      apiKey,
      oauthToken,
    };
  }

  /**
   * Update configuration (partial update)
   */
  async setConfig(config: Partial<AppConfig>): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) throw new ConfigurationError('Store not initialized', ERROR_CODES.CONFIG_SAVE_FAILED);

    const { apiKey, oauthToken, ...rest } = config;

    // Store API key securely if provided
    if (apiKey !== undefined) {
      await this.setApiKey(apiKey);
    }

    // Store OAuth token securely if provided
    if (oauthToken !== undefined) {
      await this.setOAuthToken(oauthToken);
    }

    // Store other config values
    Object.entries(rest).forEach(([key, value]) => {
      if (value !== undefined) {
        this.store!.set(key as keyof StoredConfig, value as StoredConfig[keyof StoredConfig]);
      }
    });

    logger.info('Config updated', { keys: Object.keys(config) });
  }

  /**
   * Set an encrypted value in the store
   * @param key - Must be 'encryptedApiKey' or 'encryptedOAuthToken'
   * @param value - The value to encrypt and store
   * @throws Error if encryption is not available
   */
  private async setEncryptedValue(key: 'encryptedApiKey' | 'encryptedOAuthToken', value: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) throw new ConfigurationError('Store not initialized', ERROR_CODES.CONFIG_SAVE_FAILED);

    if (!value) {
      this.store.delete(key);
      return;
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new ConfigurationError('SafeStorage encryption is not available. Cannot store credentials securely.', ERROR_CODES.AUTH_ENCRYPTION_UNAVAILABLE);
    }

    try {
      const encrypted = safeStorage.encryptString(value);
      this.store.set(key, encrypted.toString('base64'));
      // Log token details for debugging (prefix + length only, never full token)
      logger.info(`${key} stored securely`, {
        prefix: value.slice(0, 15) + '...',
        length: value.length,
        encryptedLength: encrypted.length,
      });
    } catch (error) {
      logger.error(`Failed to encrypt ${key}`, error);
      throw new ConfigurationError(`Failed to encrypt ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`, ERROR_CODES.CONFIG_SAVE_FAILED, error);
    }
  }

  /**
   * Get an encrypted value from the store
   * @param key - Must be 'encryptedApiKey' or 'encryptedOAuthToken'
   * @returns Decrypted value or empty string if not found
   */
  private async getEncryptedValue(key: 'encryptedApiKey' | 'encryptedOAuthToken'): Promise<string> {
    await this.ensureInitialized();
    if (!this.store) throw new ConfigurationError('Store not initialized', ERROR_CODES.CONFIG_LOAD_FAILED);

    const encryptedValue = this.store.get(key) as string | undefined;
    if (!encryptedValue) {
      return '';
    }

    if (!safeStorage.isEncryptionAvailable()) {
      logger.error(`SafeStorage encryption not available, cannot decrypt ${key}`);
      throw new ConfigurationError('SafeStorage encryption is not available. Cannot decrypt credentials.', ERROR_CODES.AUTH_ENCRYPTION_UNAVAILABLE);
    }

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'));
      // Log token details for debugging (prefix + suffix + length)
      logger.info(`${key} retrieved from secure storage`, {
        prefix: decrypted.slice(0, 20) + '...',
        suffix: '...' + decrypted.slice(-15),
        length: decrypted.length,
      });
      return decrypted;
    } catch (error) {
      logger.error(`Failed to decrypt ${key}`, error);
      // Clear the corrupted value to prevent repeated failures
      this.store.delete(key);
      throw new ConfigurationError(
        `Failed to decrypt ${key}. Your credentials may have been corrupted. Please log in again.`,
        ERROR_CODES.AUTH_ENCRYPTION_UNAVAILABLE,
        error
      );
    }
  }

  /**
   * Get API key (decrypted)
   */
  async getApiKey(): Promise<string> {
    return this.getEncryptedValue('encryptedApiKey');
  }

  /**
   * Set API key (encrypted) and update authMethod accordingly
   */
  async setApiKey(apiKey: string): Promise<void> {
    await this.setEncryptedValue('encryptedApiKey', apiKey);
    await this.updateAuthMethod();
  }

  /**
   * Check if API key is configured
   */
  async hasApiKey(): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.store) return false;
    return !!this.store.get('encryptedApiKey');
  }

  /**
   * Get OAuth token (decrypted)
   */
  async getOAuthToken(): Promise<string> {
    return this.getEncryptedValue('encryptedOAuthToken');
  }

  /**
   * Set OAuth token (encrypted) and update authMethod accordingly
   */
  async setOAuthToken(token: string): Promise<void> {
    await this.setEncryptedValue('encryptedOAuthToken', token);
    await this.updateAuthMethod();
  }

  /**
   * Check if OAuth token is configured
   */
  async hasOAuthToken(): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.store) return false;
    return !!this.store.get('encryptedOAuthToken');
  }

  /**
   * Check if any authentication is configured
   */
  async hasAuth(): Promise<boolean> {
    return (await this.hasApiKey()) || (await this.hasOAuthToken());
  }

  /**
   * Update authMethod based on current credentials.
   * OAuth takes priority over API key.
   */
  private async updateAuthMethod(): Promise<void> {
    if (!this.store) return;

    const hasOAuth = await this.hasOAuthToken();
    const hasApiKey = await this.hasApiKey();

    let authMethod: AuthMethod;
    if (hasOAuth) {
      authMethod = 'oauth';
    } else if (hasApiKey) {
      authMethod = 'api-key';
    } else {
      authMethod = 'none';
    }

    this.store.set('authMethod', authMethod);
    logger.debug('authMethod updated', { authMethod });
  }

  /**
   * Clear all authentication credentials and reset authMethod
   */
  async logout(): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) return;

    this.store.delete('encryptedApiKey');
    this.store.delete('encryptedOAuthToken');
    this.store.set('authMethod', 'none');

    logger.info('User logged out, credentials cleared');
  }

  /**
   * Get working directory
   */
  async getWorkingDirectory(): Promise<string> {
    await this.ensureInitialized();
    if (!this.store) return '';
    return this.store.get('workingDirectory', '');
  }

  /**
   * Set working directory and add to recent projects
   */
  async setWorkingDirectory(directory: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) throw new ConfigurationError('Store not initialized', ERROR_CODES.CONFIG_SAVE_FAILED);

    this.store.set('workingDirectory', directory);

    // Update recent projects
    const recent = this.store.get('recentProjects', []) as string[];
    const filtered = recent.filter((p: string) => p !== directory);
    const updated = [directory, ...filtered].slice(0, 10);
    this.store.set('recentProjects', updated);

    logger.info('Working directory updated', { directory });
  }

  /**
   * Get recent projects
   */
  async getRecentProjects(): Promise<string[]> {
    await this.ensureInitialized();
    if (!this.store) return [];
    return this.store.get('recentProjects', []);
  }

  /**
   * Get theme preference
   */
  async getTheme(): Promise<'light' | 'dark' | 'system'> {
    await this.ensureInitialized();
    if (!this.store) return 'system';
    return this.store.get('theme', 'system');
  }

  /**
   * Clear all stored data
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) return;
    this.store.clear();
    logger.info('Config cleared');
  }
}

export default ConfigService;
