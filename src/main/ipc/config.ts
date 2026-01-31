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
    logger.debug('IPC: config:get');
    return await configService.getConfig();
  });

  // Set configuration (partial update)
  ipcMain.handle(IPC_CHANNELS.CONFIG_SET, async (_event, config: Partial<AppConfig>) => {
    logger.debug('IPC: config:set', { keys: Object.keys(config) });
    await configService.setConfig(config);

    // Notify renderer of config change
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, config);
    }
  });

  logger.info('Config IPC handlers registered');
}
