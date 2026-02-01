/**
 * Main process entry point for Cline GUI
 *
 * CRITICAL: JavaScript hoists ALL static imports - they execute before any code.
 * We MUST use dynamic imports to truly defer loading after Squirrel check.
 * Only electron-squirrel-startup is safe to import statically (uses only Node built-ins).
 */

// This is safe - electron-squirrel-startup only uses Node built-ins
import started from 'electron-squirrel-startup';

if (started) {
  // Squirrel event handled (install/update/uninstall), exit immediately
  process.exit(0);
}

// Only NOW dynamically import everything else - this runs at runtime, not module load time
async function main(): Promise<void> {
  // Dynamic imports - these happen AFTER the Squirrel check above
  const { app, BrowserWindow, dialog } = await import('electron');
  const { setupIPC } = await import('./ipc');
  const { default: AuthService } = await import('./services/AuthService');
  const { default: ClaudeCodeService } = await import('./services/ClaudeCodeService');
  const { default: ConfigService } = await import('./services/ConfigService');
  const { default: ConversationService } = await import('./services/ConversationService');
  const { default: FileWatcherService } = await import('./services/FileWatcherService');
  const { default: UpdateService } = await import('./services/UpdateService');
  const { default: logger } = await import('./utils/logger');
  const { createWindow, getMainWindow } = await import('./window');

  // Service instances
  let authService: InstanceType<typeof AuthService>;
  let configService: InstanceType<typeof ConfigService>;
  let claudeService: InstanceType<typeof ClaudeCodeService>;
  let fileWatcher: InstanceType<typeof FileWatcherService>;
  let conversationService: InstanceType<typeof ConversationService>;
  let updateService: InstanceType<typeof UpdateService>;

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
        updateService.checkForUpdates().catch((error: unknown) => {
          logger.warn('Failed to check for updates on startup', error);
        });
      }, 5000);
    } catch (error) {
      logger.error('Critical error during app startup:', error);
      dialog.showErrorBox(
        'Startup Error',
        `Cline GUI failed to start: ${error instanceof Error ? error.message : String(error)}`
      );
      app.quit();
    }
  }

  // Set up app event handlers
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
    fileWatcher?.stop();
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
main().catch((error) => {
  console.error('Fatal error starting application:', error);
  process.exit(1);
});
