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
    try {
      // Validate services
      if (!fileWatcher || !configService) {
        throw new Error('File watcher or Config service not initialized');
      }

      const mainWindow = getMainWindow();
      if (!mainWindow) {
        logger.warn('No main window available for directory selection');
        return null;
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Working Directory',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Select',
      });

      if (result.canceled || result.filePaths.length === 0) {
        logger.debug('Directory selection cancelled');
        return null;
      }

      const selectedDir = result.filePaths[0];

      if (!selectedDir || !selectedDir.trim()) {
        throw new Error('Selected directory path is empty');
      }

      // Save to config and start watching
      await configService.setWorkingDirectory(selectedDir);
      fileWatcher.watch(selectedDir);

      logger.info('Working directory selected', { directory: selectedDir });
      return selectedDir;
    } catch (error) {
      logger.error('Failed to select directory', { error });
      throw new Error(`Failed to select directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Get file tree for a directory
  ipcMain.handle(IPC_CHANNELS.FILES_GET_TREE, async (_event, directory: string) => {
    try {
      logger.debug('IPC: files:get-tree', { directory });

      // Validate service
      if (!fileWatcher) {
        throw new Error('File watcher service not initialized');
      }

      // Validate input
      if (typeof directory !== 'string') {
        throw new Error('Invalid directory type: must be a string');
      }

      if (!directory || !directory.trim()) {
        throw new Error('Directory path cannot be empty');
      }

      const fileTree = await fileWatcher.getFileTree(directory);

      if (!fileTree) {
        throw new Error('Failed to get file tree');
      }

      return fileTree;
    } catch (error) {
      logger.error('Failed to get file tree', { error, directory });
      throw new Error(`Failed to get file tree: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Read file content
  ipcMain.handle(IPC_CHANNELS.FILES_READ, async (_event, filePath: string) => {
    try {
      logger.debug('IPC: files:read', { filePath });

      // Validate services
      if (!fileWatcher || !configService) {
        throw new Error('File watcher or Config service not initialized');
      }

      // Validate input
      if (typeof filePath !== 'string') {
        throw new Error('Invalid file path type: must be a string');
      }

      if (!filePath || !filePath.trim()) {
        throw new Error('File path cannot be empty');
      }

      const workingDir = await configService.getWorkingDirectory();
      if (!workingDir) {
        throw new Error('No working directory set');
      }

      const content = await fileWatcher.readFile(filePath, workingDir);

      if (content === undefined || content === null) {
        throw new Error('Failed to read file content');
      }

      return content;
    } catch (error) {
      logger.error('Failed to read file', { error, filePath });
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Set up file change notifications
  try {
    if (!fileWatcher) {
      throw new Error('File watcher service not initialized');
    }

    fileWatcher.onChange((changes) => {
      try {
        if (!changes || !Array.isArray(changes)) {
          logger.warn('Invalid file changes received', { changes });
          return;
        }

        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.FILES_CHANGED, changes);
        }
      } catch (error) {
        logger.error('Failed to send file change notification', { error });
      }
    });
  } catch (error) {
    logger.error('Failed to setup file change notifications', { error });
  }

  logger.info('Files IPC handlers registered');
}
