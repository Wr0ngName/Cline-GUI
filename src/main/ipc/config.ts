/**
 * IPC handlers for configuration
 */

import { ipcMain, BrowserWindow } from 'electron';

import { AppConfig, IPC_CHANNELS } from '../../shared/types';
import { ConfigurationError, ERROR_CODES } from '../errors';
import ConfigService from '../services/ConfigService';
import { validateObject, sendToRenderer, ensureService, formatErrorMessage } from '../utils/ipc-helpers';
import logger from '../utils/logger';

export function setupConfigIPC(
  configService: ConfigService,
  getMainWindow: () => BrowserWindow | null
): void {
  // Get full configuration
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    try {
      logger.debug('IPC: config:get');
      ensureService(configService, 'ConfigService');

      const config = await configService.getConfig();
      if (!config) {
        throw new ConfigurationError('Failed to load configuration', ERROR_CODES.CONFIG_LOAD_FAILED);
      }

      return config;
    } catch (error) {
      logger.error('Failed to get config', { error });
      throw new ConfigurationError(formatErrorMessage('Failed to get configuration', error), ERROR_CODES.CONFIG_LOAD_FAILED, error);
    }
  });

  // Set configuration (partial update)
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, config: Partial<AppConfig>) => {
    try {
      logger.debug('IPC: config:set', { keys: config ? Object.keys(config) : [] });
      ensureService(configService, 'ConfigService');
      validateObject(config, 'Config');

      if (Object.keys(config).length === 0) {
        throw new ConfigurationError('Config object cannot be empty', ERROR_CODES.CONFIG_INVALID);
      }

      await configService.setConfig(config);

      // Notify renderer of config change
      sendToRenderer(getMainWindow, IPC_CHANNELS.CONFIG_CHANGED, config);
    } catch (error) {
      logger.error('Failed to set config', { error, configKeys: config ? Object.keys(config) : [] });
      throw new ConfigurationError(formatErrorMessage('Failed to set configuration', error), ERROR_CODES.CONFIG_SAVE_FAILED, error);
    }
  });

  logger.info('Config IPC handlers registered');
}
