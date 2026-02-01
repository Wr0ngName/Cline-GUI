/**
 * Main process entry point for Cline GUI
 *
 * IMPORTANT: Squirrel events must be handled before importing dependencies
 * that may not be available during install/update (e.g., electron-log).
 */

import { app, BrowserWindow } from 'electron';
// electron-squirrel-startup only uses Node built-ins, safe to import
import started from 'electron-squirrel-startup';

import handleSquirrelEvents from './utils/squirrel';

// Handle Squirrel.Windows install/update events via electron-squirrel-startup
// This is the most reliable way to handle shortcuts creation
if (started) {
  app.quit();
} else {
  // Check for uninstall event (we handle this specially for cleanup prompt)
  handleSquirrelEvents().then((handled) => {
    if (handled) {
      // Uninstall event was handled, app will quit
      return;
    }
    // Continue with normal app startup - now safe to import dependencies
    startApp();
  });
}

// Lazy imports - only loaded after Squirrel check passes
let setupIPC: typeof import('./ipc').setupIPC;
let AuthService: typeof import('./services/AuthService').default;
let ClaudeCodeService: typeof import('./services/ClaudeCodeService').default;
let ConfigService: typeof import('./services/ConfigService').default;
let ConversationService: typeof import('./services/ConversationService').default;
let FileWatcherService: typeof import('./services/FileWatcherService').default;
let UpdateService: typeof import('./services/UpdateService').default;
let logger: typeof import('./utils/logger').default;
let createWindow: typeof import('./window').createWindow;
let getMainWindow: typeof import('./window').getMainWindow;

let appStarted = false;

// Service instances (typed as any since classes are dynamically imported)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let authService: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let configService: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let claudeService: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fileWatcher: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let conversationService: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let updateService: any;

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
    updateService.checkForUpdates().catch((error: unknown) => {
      logger.warn('Failed to check for updates on startup', error);
    });
  }, 5000);
}

/**
 * Start the application (called after Squirrel events are handled)
 */
async function startApp(): Promise<void> {
  // Now safe to import dependencies that may use npm packages
  const ipcModule = await import('./ipc');
  const authModule = await import('./services/AuthService');
  const claudeModule = await import('./services/ClaudeCodeService');
  const configModule = await import('./services/ConfigService');
  const conversationModule = await import('./services/ConversationService');
  const fileWatcherModule = await import('./services/FileWatcherService');
  const updateModule = await import('./services/UpdateService');
  const loggerModule = await import('./utils/logger');
  const windowModule = await import('./window');

  setupIPC = ipcModule.setupIPC;
  AuthService = authModule.default;
  ClaudeCodeService = claudeModule.default;
  ConfigService = configModule.default;
  ConversationService = conversationModule.default;
  FileWatcherService = fileWatcherModule.default;
  UpdateService = updateModule.default;
  logger = loggerModule.default;
  createWindow = windowModule.createWindow;
  getMainWindow = windowModule.getMainWindow;

  appStarted = true;

  // This method will be called when Electron has finished initialization
  if (app.isReady()) {
    onReady();
  } else {
    app.on('ready', onReady);
  }

  // Set up event handlers that need logger
  setupEventHandlers();
}

/**
 * Set up event handlers (called after imports are loaded)
 */
function setupEventHandlers(): void {
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
}
