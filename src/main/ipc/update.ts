/**
 * IPC handlers for auto-update
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import { AppError, ERROR_CODES } from '../errors';
import UpdateService from '../services/UpdateService';
import logger from '../utils/logger';

export function setupUpdateIPC(updateService: UpdateService): void {
  // Check for updates
  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    try {
      logger.debug('IPC: update:check');

      // Validate service
      if (!updateService) {
        throw new AppError('Update service not initialized', ERROR_CODES.IPC_HANDLER_FAILED);
      }

      const updateInfo = await updateService.checkForUpdates();

      // updateInfo can be null if no updates available, which is valid
      return updateInfo;
    } catch (error) {
      logger.error('Failed to check for updates', { error });
      throw new AppError(`Failed to check for updates: ${error instanceof Error ? error.message : String(error)}`, 'UPDATE_CHECK_FAILED', error);
    }
  });

  // Download update
  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    try {
      logger.debug('IPC: update:download');

      // Validate service
      if (!updateService) {
        throw new AppError('Update service not initialized', ERROR_CODES.IPC_HANDLER_FAILED);
      }

      await updateService.downloadUpdate();
    } catch (error) {
      logger.error('Failed to download update', { error });
      throw new AppError(`Failed to download update: ${error instanceof Error ? error.message : String(error)}`, 'UPDATE_DOWNLOAD_FAILED', error);
    }
  });

  // Install update and restart
  ipcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    try {
      logger.debug('IPC: update:install');

      // Validate service
      if (!updateService) {
        throw new AppError('Update service not initialized', ERROR_CODES.IPC_HANDLER_FAILED);
      }

      updateService.installUpdate();
    } catch (error) {
      logger.error('Failed to install update', { error });
      throw new AppError(`Failed to install update: ${error instanceof Error ? error.message : String(error)}`, 'UPDATE_INSTALL_FAILED', error);
    }
  });

  logger.info('Update IPC handlers registered');
}
