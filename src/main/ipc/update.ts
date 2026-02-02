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
    try {
      logger.debug('IPC: update:check');

      // Validate service
      if (!updateService) {
        throw new Error('Update service not initialized');
      }

      const updateInfo = await updateService.checkForUpdates();

      // updateInfo can be null if no updates available, which is valid
      return updateInfo;
    } catch (error) {
      logger.error('Failed to check for updates', { error });
      throw new Error(`Failed to check for updates: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Download update
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    try {
      logger.debug('IPC: update:download');

      // Validate service
      if (!updateService) {
        throw new Error('Update service not initialized');
      }

      await updateService.downloadUpdate();
    } catch (error) {
      logger.error('Failed to download update', { error });
      throw new Error(`Failed to download update: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Install update and restart
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    try {
      logger.debug('IPC: update:install');

      // Validate service
      if (!updateService) {
        throw new Error('Update service not initialized');
      }

      updateService.installUpdate();
    } catch (error) {
      logger.error('Failed to install update', { error });
      throw new Error(`Failed to install update: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  logger.info('Update IPC handlers registered');
}
