/**
 * Main process entry point for Cline GUI
 */

import { app, BrowserWindow } from 'electron';
import started from 'electron-squirrel-startup';

import { setupIPC } from './ipc';
import ClaudeCodeService from './services/ClaudeCodeService';
import ConfigService from './services/ConfigService';
import ConversationService from './services/ConversationService';
import FileWatcherService from './services/FileWatcherService';
import UpdateService from './services/UpdateService';
import logger from './utils/logger';
import { createWindow, getMainWindow } from './window';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Initialize services
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
  // Wait for ConfigService to finish async initialization
  await configService.ensureInitialized();

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
  logger.info('Application ready');

  // Initialize services
  await initializeServices();

  // Set up IPC handlers
  setupIPC(
    {
      configService,
      claudeService,
      fileWatcher,
      conversationService,
      updateService,
    },
    getMainWindow
  );

  // Create the main window
  const mainWindow = await createWindow();

  // Connect services to main window for IPC events
  claudeService.setMainWindow(mainWindow);
  updateService.setMainWindow(mainWindow);

  // Restore last working directory if available
  const lastWorkingDir = await configService.getWorkingDirectory();
  if (lastWorkingDir) {
    fileWatcher.watch(lastWorkingDir);
    logger.info('Restored working directory', { directory: lastWorkingDir });
  }

  // Check for updates on startup (after a delay)
  setTimeout(() => {
    updateService.checkForUpdates().catch((error) => {
      logger.warn('Failed to check for updates on startup', error);
    });
  }, 5000);
}

// This method will be called when Electron has finished initialization
app.on('ready', onReady);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, re-create window when dock icon is clicked
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().then((mainWindow) => {
      claudeService.setMainWindow(mainWindow);
      updateService.setMainWindow(mainWindow);
    });
  }
});

// Handle app before quit
app.on('before-quit', () => {
  logger.info('Application quitting');
  fileWatcher.stop();
});

// Handle uncaught exceptions
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
