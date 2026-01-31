/**
 * IPC handlers for file system operations
 */

import { dialog, ipcMain, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import ConfigService from '../services/ConfigService';
import FileWatcherService from '../services/FileWatcherService';
import logger from '../utils/logger';

export function setupFilesIPC(
  fileWatcher: FileWatcherService,
  configService: ConfigService,
  getMainWindow: () => BrowserWindow | null
): void {
  // Select working directory
  ipcMain.handle(IPC_CHANNELS.FILES_SELECT_DIR, async () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Working Directory',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Select',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedDir = result.filePaths[0];

    // Save to config and start watching
    configService.setWorkingDirectory(selectedDir);
    fileWatcher.watch(selectedDir);

    logger.info('Working directory selected', { directory: selectedDir });
    return selectedDir;
  });

  // Get file tree for a directory
  ipcMain.handle(IPC_CHANNELS.FILES_GET_TREE, async (_event, directory: string) => {
    logger.debug('IPC: files:get-tree', { directory });
    return await fileWatcher.getFileTree(directory);
  });

  // Read file content
  ipcMain.handle(IPC_CHANNELS.FILES_READ, async (_event, filePath: string) => {
    const workingDir = configService.getWorkingDirectory();
    if (!workingDir) {
      throw new Error('No working directory set');
    }

    logger.debug('IPC: files:read', { filePath });
    return await fileWatcher.readFile(filePath, workingDir);
  });

  // Set up file change notifications
  fileWatcher.onChange((changes) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.FILES_CHANGED, changes);
    }
  });

  logger.info('Files IPC handlers registered');
}
