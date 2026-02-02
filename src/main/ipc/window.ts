/**
 * IPC handlers for window operations
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import logger from '../utils/logger';
import { closeWindow, maximizeWindow, minimizeWindow } from '../window';

export function setupWindowIPC(): void {
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    try {
      logger.debug('IPC: window:minimize');
      minimizeWindow();
    } catch (error) {
      logger.error('Failed to minimize window', { error });
      // Don't throw for window operations as they use ipcMain.on (not handle)
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    try {
      logger.debug('IPC: window:maximize');
      maximizeWindow();
    } catch (error) {
      logger.error('Failed to maximize window', { error });
      // Don't throw for window operations as they use ipcMain.on (not handle)
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    try {
      logger.debug('IPC: window:close');
      closeWindow();
    } catch (error) {
      logger.error('Failed to close window', { error });
      // Don't throw for window operations as they use ipcMain.on (not handle)
    }
  });

  logger.info('Window IPC handlers registered');
}
