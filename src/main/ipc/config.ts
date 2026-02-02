/**
 * IPC handlers for configuration
 */

import { ipcMain, BrowserWindow } from 'electron';

import { AppConfig, IPC_CHANNELS } from '../../shared/types';
import ConfigService from '../services/ConfigService';
import logger from '../utils/logger';

export function setupConfigIPC(
  configService: ConfigService,
  getMainWindow: () => BrowserWindow | null
): void {
  // Get full configuration
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    try {
      logger.debug('IPC: config:get');

      // Validate service
      if (!configService) {
        throw new Error('Config service not initialized');
      }

      const config = await configService.getConfig();

      if (!config) {
        throw new Error('Failed to load configuration');
      }

      return config;
    } catch (error) {
      logger.error('Failed to get config', { error });
      throw new Error(`Failed to get configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Set configuration (partial update)
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, config: Partial<AppConfig>) => {
    try {
      logger.debug('IPC: config:set', { keys: config ? Object.keys(config) : [] });

      // Validate service
      if (!configService) {
        throw new Error('Config service not initialized');
      }

      // Validate input
      if (!config || typeof config !== 'object' || Array.isArray(config)) {
        throw new Error('Invalid config: must be an object');
      }

      if (Object.keys(config).length === 0) {
        throw new Error('Config object cannot be empty');
      }

      await configService.setConfig(config);

      // Notify renderer of config change
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, config);
      }
    } catch (error) {
      logger.error('Failed to set config', { error, configKeys: config ? Object.keys(config) : [] });
      throw new Error(`Failed to set configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  logger.info('Config IPC handlers registered');
}
