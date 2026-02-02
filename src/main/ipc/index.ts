/**
 * IPC setup - registers all IPC handlers
 */

import { BrowserWindow, ipcMain } from 'electron';

import AuthService from '../services/AuthService';
import ClaudeCodeService from '../services/ClaudeCodeService';
import ConfigService from '../services/ConfigService';
import ConversationService from '../services/ConversationService';
import FileWatcherService from '../services/FileWatcherService';
import UpdateService from '../services/UpdateService';
import logger from '../utils/logger';

import { setupAuthHandlers } from './auth';
import { setupClaudeIPC } from './claude';
import { setupConfigIPC } from './config';
import { setupConversationIPC } from './conversations';
import { setupFilesIPC } from './files';
import { setupUpdateIPC } from './update';
import { setupWindowIPC } from './window';

interface Services {
  authService: AuthService;
  configService: ConfigService;
  claudeService: ClaudeCodeService;
  fileWatcher: FileWatcherService;
  conversationService: ConversationService;
  updateService: UpdateService;
}

/**
 * Setup all IPC handlers
 * @returns Cleanup function to remove all IPC handlers
 */
export function setupIPC(
  services: Services,
  getMainWindow: () => BrowserWindow | null
): () => void {
  try {
    // Validate services
    if (!services) {
      throw new Error('Services object is required');
    }

    const {
      authService,
      configService,
      claudeService,
      fileWatcher,
      conversationService,
      updateService,
    } = services;

    if (!authService) {
      throw new Error('AuthService is required');
    }
    if (!configService) {
      throw new Error('ConfigService is required');
    }
    if (!claudeService) {
      throw new Error('ClaudeCodeService is required');
    }
    if (!fileWatcher) {
      throw new Error('FileWatcherService is required');
    }
    if (!conversationService) {
      throw new Error('ConversationService is required');
    }
    if (!updateService) {
      throw new Error('UpdateService is required');
    }
    if (typeof getMainWindow !== 'function') {
      throw new Error('getMainWindow must be a function');
    }

    setupAuthHandlers(authService, configService, getMainWindow);
    setupClaudeIPC(claudeService);
    setupFilesIPC(fileWatcher, configService, getMainWindow);
    setupConfigIPC(configService, getMainWindow);
    setupConversationIPC(conversationService);
    setupUpdateIPC(updateService);
    setupWindowIPC();

    logger.info('All IPC handlers registered');

    // Return cleanup function
    return () => {
      try {
        logger.info('Cleaning up IPC handlers');
        ipcMain.removeAllListeners();
        logger.info('IPC handlers cleaned up');
      } catch (error) {
        logger.error('Failed to cleanup IPC handlers', { error });
      }
    };
  } catch (error) {
    logger.error('Failed to setup IPC handlers', { error });
    throw new Error(`Failed to setup IPC handlers: ${error instanceof Error ? error.message : String(error)}`);
  }
}
