/**
 * Configuration service for storing and retrieving app settings
 * Uses electron-store with safeStorage for secure API key storage
 */

import Store from 'electron-store';
import { safeStorage } from 'electron';

import { AppConfig, DEFAULT_CONFIG } from '../../shared/types';
import logger from '../utils/logger';

interface StoredConfig {
  encryptedApiKey?: string;
  workingDirectory: string;
  recentProjects: string[];
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  autoApproveReads: boolean;
}

export class ConfigService {
  private store: Store<StoredConfig>;

  constructor() {
    this.store = new Store<StoredConfig>({
      name: 'config',
      defaults: {
        workingDirectory: '',
        recentProjects: [],
        theme: 'system',
        fontSize: 14,
        autoApproveReads: true,
      },
    });
    logger.info('ConfigService initialized');
  }

  /**
   * Get the full app configuration
   */
  getConfig(): AppConfig {
    const storedConfig = this.store.store;
    const apiKey = this.getApiKey();

    return {
      ...DEFAULT_CONFIG,
      ...storedConfig,
      apiKey,
    };
  }

  /**
   * Update configuration (partial update)
   */
  setConfig(config: Partial<AppConfig>): void {
    const { apiKey, ...rest } = config;

    // Store API key securely if provided
    if (apiKey !== undefined) {
      this.setApiKey(apiKey);
    }

    // Store other config values
    Object.entries(rest).forEach(([key, value]) => {
      if (value !== undefined) {
        this.store.set(key as keyof StoredConfig, value);
      }
    });

    logger.info('Config updated', { keys: Object.keys(config) });
  }

  /**
   * Get API key (decrypted)
   */
  getApiKey(): string {
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
  setApiKey(apiKey: string): void {
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
  hasApiKey(): boolean {
    return !!this.store.get('encryptedApiKey');
  }

  /**
   * Get working directory
   */
  getWorkingDirectory(): string {
    return this.store.get('workingDirectory', '');
  }

  /**
   * Set working directory and add to recent projects
   */
  setWorkingDirectory(directory: string): void {
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
  getRecentProjects(): string[] {
    return this.store.get('recentProjects', []);
  }

  /**
   * Get theme preference
   */
  getTheme(): 'light' | 'dark' | 'system' {
    return this.store.get('theme', 'system');
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    this.store.clear();
    logger.info('Config cleared');
  }
}

export default ConfigService;
