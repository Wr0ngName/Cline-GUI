/**
 * IPC handlers for file system operations
 */

import { dialog, ipcMain, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import { FileSystemError, ERROR_CODES } from '../errors';
import ConfigService from '../services/ConfigService';
import FileWatcherService from '../services/FileWatcherService';
import { validateString, validatePath, sendToRenderer, ensureService, formatErrorMessage } from '../utils/ipc-helpers';
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
      ensureService(fileWatcher, 'FileWatcherService');
      ensureService(configService, 'ConfigService');

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

      validateString(selectedDir, 'Selected directory path');

      // Save to config and start watching
      await configService.setWorkingDirectory(selectedDir);
      fileWatcher.watch(selectedDir);

      logger.info('Working directory selected', { directory: selectedDir });
      return selectedDir;
    } catch (error) {
      logger.error('Failed to select directory', { error });
      throw new FileSystemError(formatErrorMessage('Failed to select directory', error), undefined, ERROR_CODES.FS_READ_FAILED, error);
    }
  });

  // Get file tree for a directory
  ipcMain.handle(IPC_CHANNELS.FILES_GET_TREE, async (_event, directory: string) => {
    try {
      logger.debug('IPC: files:get-tree', { directory });

      // Validate service
      ensureService(fileWatcher, 'FileWatcherService');

      // Validate input
      validateString(directory, 'Directory path');
      validatePath(directory);

      const fileTree = await fileWatcher.getFileTree(directory);

      if (!fileTree) {
        throw new FileSystemError('Failed to get file tree', directory, ERROR_CODES.FS_READ_FAILED);
      }

      return fileTree;
    } catch (error) {
      logger.error('Failed to get file tree', { error, directory });
      throw new FileSystemError(formatErrorMessage('Failed to get file tree', error), directory, ERROR_CODES.FS_READ_FAILED, error);
    }
  });

  // Read file content
  ipcMain.handle(IPC_CHANNELS.FILES_READ, async (_event, filePath: string) => {
    try {
      logger.debug('IPC: files:read', { filePath });

      // Validate services
      ensureService(fileWatcher, 'FileWatcherService');
      ensureService(configService, 'ConfigService');

      // Validate input
      validateString(filePath, 'File path');
      validatePath(filePath);

      const workingDir = await configService.getWorkingDirectory();
      if (!workingDir) {
        throw new FileSystemError('No working directory set', undefined, ERROR_CODES.FS_PATH_TRAVERSAL);
      }

      const content = await fileWatcher.readFile(filePath, workingDir);

      if (content === undefined || content === null) {
        throw new FileSystemError('Failed to read file content', filePath, ERROR_CODES.FS_READ_FAILED);
      }

      return content;
    } catch (error) {
      logger.error('Failed to read file', { error, filePath });
      throw new FileSystemError(formatErrorMessage('Failed to read file', error), filePath, ERROR_CODES.FS_READ_FAILED, error);
    }
  });

  // Set up file change notifications
  try {
    ensureService(fileWatcher, 'FileWatcherService');

    fileWatcher.onChange((changes) => {
      try {
        if (!changes || !Array.isArray(changes)) {
          logger.warn('Invalid file changes received', { changes });
          return;
        }

        sendToRenderer(getMainWindow, IPC_CHANNELS.FILES_CHANGED, changes);
      } catch (error) {
        logger.error('Failed to send file change notification', { error });
      }
    });
  } catch (error) {
    logger.error('Failed to setup file change notifications', { error });
  }

  logger.info('Files IPC handlers registered');
}
