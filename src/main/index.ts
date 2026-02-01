/**
 * Main process entry point for Cline GUI
 *
 * CRITICAL: The Squirrel check MUST be the absolute first thing.
 * Any import that fails will crash the installer silently.
 */

// eslint-disable-next-line import/order -- MUST be first for Windows installer
import started from 'electron-squirrel-startup';
if (started) {
  // Do not import anything else, just exit immediately
  process.exit(0);
}

// Now safe to import other modules
// eslint-disable-next-line import/order
import { app, BrowserWindow } from 'electron';

import { setupIPC } from './ipc';
import AuthService from './services/AuthService';
import ClaudeCodeService from './services/ClaudeCodeService';
import ConfigService from './services/ConfigService';
import ConversationService from './services/ConversationService';
import FileWatcherService from './services/FileWatcherService';
import UpdateService from './services/UpdateService';
import logger from './utils/logger';
import { createWindow, getMainWindow } from './window';

// Service instances
let authService: AuthService;
let configService: ConfigService;
let claudeService: ClaudeCodeService;
let fileWatcher: FileWatcherService;
let conversationService: ConversationService;
let updateService: UpdateService;

/**
 * Initialize all services
 */
async function initializeServices(): Promise<void> {
  logger.info('Initializing services...');

  configService = new ConfigService();
  await configService.ensureInitialized();

  authService = new AuthService();
  claudeService = new ClaudeCodeService(configService);
  fileWatcher = new FileWatcherService();
  conversationService = new ConversationService();
  updateService = new UpdateService();

  logger.info('All services initialized');
}

/**
 * Application ready handler
 */
async function onReady(): Promise<void> {
  try {
    logger.info('Application ready');

    await initializeServices();

    setupIPC(
      {
        authService,
        configService,
        claudeService,
        fileWatcher,
        conversationService,
        updateService,
      },
      getMainWindow
    );

    const mainWindow = await createWindow();

    claudeService.setMainWindow(mainWindow);
    updateService.setMainWindow(mainWindow);

    const lastWorkingDir = await configService.getWorkingDirectory();
    if (lastWorkingDir) {
      fileWatcher.watch(lastWorkingDir);
      logger.info('Restored working directory', { directory: lastWorkingDir });
    }

    setTimeout(() => {
      updateService.checkForUpdates().catch((error) => {
        logger.warn('Failed to check for updates on startup', error);
      });
    }, 5000);
  } catch (error) {
    logger.error('Critical error during app startup:', error);
    // Try to show an error dialog
    const { dialog } = await import('electron');
    dialog.showErrorBox(
      'Startup Error',
      `Cline GUI failed to start: ${error instanceof Error ? error.message : String(error)}`
    );
    app.quit();
  }
}

/**
 * Start the application
 */
function startApp(): void {
  app.on('ready', onReady);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().then((mainWindow) => {
        claudeService.setMainWindow(mainWindow);
        updateService.setMainWindow(mainWindow);
      });
    }
  });

  app.on('before-quit', () => {
    logger.info('Application quitting');
    fileWatcher.stop();
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
  });

  logger.info('Main process started', {
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  });
}

// Start the application
startApp();
