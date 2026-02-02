/**
 * Configuration service for storing and retrieving app settings
 * Uses electron-store with safeStorage for secure API key storage
 */

import { safeStorage } from 'electron';

import { AppConfig, AuthMethod, DEFAULT_CONFIG } from '../../shared/types';
import { ConfigurationError, ERROR_CODES } from '../errors';
import logger from '../utils/logger';

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

// Use any for the dynamically imported Store to avoid type conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StoreInstance = any;

export class ConfigService {
  private store: StoreInstance = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Dynamic import for ESM-only electron-store v10
      const { default: Store } = await import('electron-store');
      this.store = new Store<StoredConfig>({
        name: 'config',
        defaults: {
          authMethod: 'none',
          workingDirectory: '',
          recentProjects: [],
          theme: 'system',
          fontSize: 14,
          autoApproveReads: true,
        },
      });
      this.isInitialized = true;
      this.initPromise = null; // Clear promise after initialization
      logger.info('ConfigService initialized');
    } catch (error) {
      logger.error('Failed to initialize ConfigService', error);
      throw error;
    }
  }

  /**
   * Ensure store is initialized before use
   */
  async ensureInitialized(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    if (this.initPromise) {
      await this.initPromise;
    }
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
   * @throws Error if encryption is not available
   */
  private async setEncryptedValue(key: keyof StoredConfig, value: string): Promise<void> {
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
      logger.info(`${key} stored securely`);
    } catch (error) {
      logger.error(`Failed to encrypt ${key}`, error);
      throw new ConfigurationError(`Failed to encrypt ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`, ERROR_CODES.CONFIG_SAVE_FAILED, error);
    }
  }

  /**
   * Get an encrypted value from the store
   * @returns Decrypted value or empty string if not found
   */
  private async getEncryptedValue(key: keyof StoredConfig): Promise<string> {
    await this.ensureInitialized();
    if (!this.store) throw new ConfigurationError('Store not initialized', ERROR_CODES.CONFIG_LOAD_FAILED);

    const encryptedValue = this.store.get(key);
    if (!encryptedValue) {
      return '';
    }

    if (!safeStorage.isEncryptionAvailable()) {
      logger.error(`SafeStorage encryption not available, cannot decrypt ${key}`);
      throw new ConfigurationError('SafeStorage encryption is not available. Cannot decrypt credentials.', ERROR_CODES.AUTH_ENCRYPTION_UNAVAILABLE);
    }

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encryptedValue, 'base64'));
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
   * Set API key (encrypted)
   */
  async setApiKey(apiKey: string): Promise<void> {
    return this.setEncryptedValue('encryptedApiKey', apiKey);
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
   * Set OAuth token (encrypted)
   */
  async setOAuthToken(token: string): Promise<void> {
    return this.setEncryptedValue('encryptedOAuthToken', token);
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
