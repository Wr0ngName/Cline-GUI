/**
 * Configuration service for storing and retrieving app settings
 * Uses electron-store with safeStorage for secure API key storage
 */

import { safeStorage } from 'electron';

import { AppConfig, AuthMethod, DEFAULT_CONFIG } from '../../shared/types';
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

// Type for the dynamically imported Store
type ElectronStore<T> = {
  store: T;
  get<K extends keyof T>(key: K, defaultValue?: T[K]): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  delete<K extends keyof T>(key: K): void;
  clear(): void;
};

export class ConfigService {
  private store: ElectronStore<StoredConfig> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
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
      }) as ElectronStore<StoredConfig>;
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
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Get the full app configuration
   */
  async getConfig(): Promise<AppConfig> {
    await this.ensureInitialized();
    if (!this.store) throw new Error('Store not initialized');

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
    if (!this.store) throw new Error('Store not initialized');

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
   * Get API key (decrypted)
   */
  async getApiKey(): Promise<string> {
    await this.ensureInitialized();
    if (!this.store) throw new Error('Store not initialized');

    const encryptedKey = this.store.get('encryptedApiKey');
    if (!encryptedKey) {
      return '';
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(encryptedKey, 'base64'));
        return decrypted;
      }
      // Fallback for systems without encryption (should be rare)
      logger.warn('SafeStorage encryption not available');
      return encryptedKey;
    } catch (error) {
      logger.error('Failed to decrypt API key', error);
      return '';
    }
  }

  /**
   * Set API key (encrypted)
   */
  async setApiKey(apiKey: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) throw new Error('Store not initialized');

    if (!apiKey) {
      this.store.delete('encryptedApiKey');
      return;
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(apiKey);
        this.store.set('encryptedApiKey', encrypted.toString('base64'));
        logger.info('API key stored securely');
      } else {
        // Fallback - store as-is (not recommended, but better than failing)
        logger.warn('SafeStorage not available, storing API key without encryption');
        this.store.set('encryptedApiKey', apiKey);
      }
    } catch (error) {
      logger.error('Failed to encrypt API key', error);
    }
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
    await this.ensureInitialized();
    if (!this.store) throw new Error('Store not initialized');

    const encryptedToken = this.store.get('encryptedOAuthToken');
    if (!encryptedToken) {
      return '';
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const decrypted = safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'));
        return decrypted;
      }
      // Fallback for systems without encryption
      logger.warn('SafeStorage encryption not available for OAuth token');
      return encryptedToken;
    } catch (error) {
      logger.error('Failed to decrypt OAuth token', error);
      return '';
    }
  }

  /**
   * Set OAuth token (encrypted)
   */
  async setOAuthToken(token: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.store) throw new Error('Store not initialized');

    if (!token) {
      this.store.delete('encryptedOAuthToken');
      return;
    }

    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token);
        this.store.set('encryptedOAuthToken', encrypted.toString('base64'));
        logger.info('OAuth token stored securely');
      } else {
        // Fallback - store as-is (not recommended, but better than failing)
        logger.warn('SafeStorage not available, storing OAuth token without encryption');
        this.store.set('encryptedOAuthToken', token);
      }
    } catch (error) {
      logger.error('Failed to encrypt OAuth token', error);
    }
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
    if (!this.store) throw new Error('Store not initialized');

    this.store.set('workingDirectory', directory);

    // Update recent projects
    const recent = this.store.get('recentProjects', []);
    const filtered = recent.filter((p) => p !== directory);
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
