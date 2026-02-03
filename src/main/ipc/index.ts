/**
 * IPC (Inter-Process Communication) setup module.
 *
 * This module is the central registration point for all IPC handlers
 * that enable communication between the main process and renderer process.
 *
 * @module ipc
 *
 * IPC channels are organized by domain:
 * - auth: Authentication (OAuth, API keys)
 * - claude: Claude Code SDK integration
 * - config: Application configuration
 * - conversations: Chat history persistence
 * - files: File system operations and watching
 * - update: Auto-update functionality
 * - window: Window management (minimize, maximize, close)
 */

import { BrowserWindow, ipcMain } from 'electron';

import { ValidationError, ERROR_CODES } from '../errors';
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

/**
 * Service instances required for IPC handlers.
 * All services must be initialized before calling setupIPC.
 */
interface Services {
  /** OAuth and API key authentication */
  authService: AuthService;
  /** Application configuration persistence */
  configService: ConfigService;
  /** Claude Code SDK integration */
  claudeService: ClaudeCodeService;
  /** File system watching for the working directory */
  fileWatcher: FileWatcherService;
  /** Conversation history storage */
  conversationService: ConversationService;
  /** Auto-update functionality */
  updateService: UpdateService;
}

/**
 * Register all IPC handlers for main-renderer communication.
 *
 * This function must be called once during app initialization, after all
 * services are created but before the renderer process starts sending messages.
 *
 * @param services - All service instances required by the IPC handlers
 * @param getMainWindow - Function to get the current main BrowserWindow instance
 * @returns Cleanup function that removes all IPC handlers (call on app quit)
 * @throws {ValidationError} If any required service is missing
 *
 * @example
 * ```typescript
 * const cleanup = setupIPC(services, getMainWindow);
 * app.on('before-quit', cleanup);
 * ```
 */
export function setupIPC(
  services: Services,
  getMainWindow: () => BrowserWindow | null
): () => void {
  try {
    // Validate services
    if (!services) {
      throw new ValidationError('Services object is required', 'services', ERROR_CODES.VALIDATION_REQUIRED);
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
      throw new ValidationError('AuthService is required', 'authService', ERROR_CODES.VALIDATION_REQUIRED);
    }
    if (!configService) {
      throw new ValidationError('ConfigService is required', 'configService', ERROR_CODES.VALIDATION_REQUIRED);
    }
    if (!claudeService) {
      throw new ValidationError('ClaudeCodeService is required', 'claudeService', ERROR_CODES.VALIDATION_REQUIRED);
    }
    if (!fileWatcher) {
      throw new ValidationError('FileWatcherService is required', 'fileWatcher', ERROR_CODES.VALIDATION_REQUIRED);
    }
    if (!conversationService) {
      throw new ValidationError('ConversationService is required', 'conversationService', ERROR_CODES.VALIDATION_REQUIRED);
    }
    if (!updateService) {
      throw new ValidationError('UpdateService is required', 'updateService', ERROR_CODES.VALIDATION_REQUIRED);
    }
    if (typeof getMainWindow !== 'function') {
      throw new ValidationError('getMainWindow must be a function', 'getMainWindow', ERROR_CODES.VALIDATION_TYPE_MISMATCH);
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
    throw new ValidationError(`Failed to setup IPC handlers: ${error instanceof Error ? error.message : String(error)}`, undefined, ERROR_CODES.IPC_HANDLER_FAILED, error);
  }
}
