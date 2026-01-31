/**
 * IPC handlers for auto-update
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import UpdateService from '../services/UpdateService';
import logger from '../utils/logger';

export function setupUpdateIPC(updateService: UpdateService): void {
  // Check for updates
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    logger.debug('IPC: update:check');
    return await updateService.checkForUpdates();
  });

  // Download update
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    logger.debug('IPC: update:download');
    await updateService.downloadUpdate();
  });

  // Install update and restart
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    logger.debug('IPC: update:install');
    updateService.installUpdate();
  });

  logger.info('Update IPC handlers registered');
}
