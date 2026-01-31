/**
 * IPC handlers for window operations
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import { closeWindow, maximizeWindow, minimizeWindow } from '../window';
import logger from '../utils/logger';

export function setupWindowIPC(): void {
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    logger.debug('IPC: window:minimize');
    minimizeWindow();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    logger.debug('IPC: window:maximize');
    maximizeWindow();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    logger.debug('IPC: window:close');
    closeWindow();
  });

  logger.info('Window IPC handlers registered');
}
