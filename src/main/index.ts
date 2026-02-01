/**
 * Main process entry point for Cline GUI
 */

import { app, BrowserWindow } from 'electron';

import { setupIPC } from './ipc';
import AuthService from './services/AuthService';
import ClaudeCodeService from './services/ClaudeCodeService';
import ConfigService from './services/ConfigService';
import ConversationService from './services/ConversationService';
import FileWatcherService from './services/FileWatcherService';
import UpdateService from './services/UpdateService';
import logger from './utils/logger';
import handleSquirrelEvents from './utils/squirrel';
import { createWindow, getMainWindow } from './window';

// Handle Squirrel.Windows install/update/uninstall events
// This includes prompting user about data cleanup on uninstall
handleSquirrelEvents().then((handled) => {
  if (handled) {
    // Squirrel event was handled, app will quit
    return;
  }
  // Continue with normal app startup
  startApp();
});

let appStarted = false;

// Initialize services
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
  // Wait for ConfigService to finish async initialization
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
  if (!appStarted) return; // Don't run if handling Squirrel event

  logger.info('Application ready');

  // Initialize services
  await initializeServices();

  // Set up IPC handlers
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

/**
 * Start the application (called after Squirrel events are handled)
 */
function startApp(): void {
  appStarted = true;

  // This method will be called when Electron has finished initialization
  if (app.isReady()) {
    onReady();
  } else {
    app.on('ready', onReady);
  }
}

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
