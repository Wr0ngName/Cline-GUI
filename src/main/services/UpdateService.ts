/**
 * Auto-update service using electron-updater
 * Configured for GitLab Package Registry
 */

import { BrowserWindow, app } from 'electron';
import { autoUpdater, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';

import { IPC_CHANNELS, UpdateInfo, UpdateProgress } from '../../shared/types';
import logger from '../utils/logger';

// GitLab server configuration
const GITLAB_HOST = 'https://dev.web.wr0ng.name';
const GITLAB_PROJECT_ID = 'wrongname%2Fcline-gui'; // URL-encoded project path

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private isCheckingForUpdates = false;

  constructor() {
    this.configureUpdater();
    logger.info('UpdateService initialized');
  }

  /**
   * Configure the auto-updater for GitLab Package Registry
   */
  private configureUpdater(): void {
    // Get current version for update feed URL
    const currentVersion = app.getVersion();

    // Configure for GitLab Generic Package Registry
    // The CI/CD pipeline uploads packages to:
    // ${GITLAB_HOST}/api/v4/projects/${PROJECT_ID}/packages/generic/releases/${VERSION}/
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/releases`,
    });

    // Configure authentication for private package registry (if needed)
    // For public registries, this is optional but doesn't hurt
    // GitLab accepts both Personal Access Tokens and Deploy Tokens
    // Format: 'Private-Token: <token>' or 'Deploy-Token: <token>'
    //
    // For development: Set GITLAB_UPDATE_TOKEN environment variable
    // For production: This should be configured during app distribution
    // or the package registry should be made public
    const updateToken = process.env.GITLAB_UPDATE_TOKEN;
    if (updateToken) {
      autoUpdater.requestHeaders = {
        'Private-Token': updateToken,
      };
      logger.info('Auto-updater configured with authentication');
    } else {
      // No token - will only work with public package registry
      logger.info('Auto-updater configured without authentication (public access only)');
    }

    // Log the configured URL for debugging
    logger.info('Auto-updater configured', {
      currentVersion,
      feedUrl: `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/releases`,
      hasAuth: !!updateToken,
    });

    // Auto download updates
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Set up event handlers
    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      logger.info('Update available', { version: info.version });
      this.emitUpdateAvailable({
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', () => {
      logger.info('No updates available');
    });

    autoUpdater.on('download-progress', (progress) => {
      logger.debug('Download progress', { percent: progress.percent });
      this.emitProgress({
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        total: progress.total,
        transferred: progress.transferred,
      });
    });

    autoUpdater.on('update-downloaded', () => {
      logger.info('Update downloaded');
      this.emitDownloaded();
    });

    autoUpdater.on('error', (error) => {
      logger.error('Update error', error);
    });
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Check for updates
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.isCheckingForUpdates) {
      logger.warn('Already checking for updates');
      return null;
    }

    this.isCheckingForUpdates = true;

    try {
      const result = await autoUpdater.checkForUpdates();

      if (result && result.updateInfo) {
        return {
          version: result.updateInfo.version,
          releaseNotes:
            typeof result.updateInfo.releaseNotes === 'string'
              ? result.updateInfo.releaseNotes
              : undefined,
          releaseDate: result.updateInfo.releaseDate,
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to check for updates', error);
      return null;
    } finally {
      this.isCheckingForUpdates = false;
    }
  }

  /**
   * Download the available update
   */
  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      logger.error('Failed to download update', error);
      throw error;
    }
  }

  /**
   * Install the downloaded update and restart
   */
  installUpdate(): void {
    logger.info('Installing update and restarting');
    autoUpdater.quitAndInstall();
  }

  /**
   * Emit update available event
   */
  private emitUpdateAvailable(info: UpdateInfo): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_AVAILABLE, info);
    }
  }

  /**
   * Emit download progress event
   */
  private emitProgress(progress: UpdateProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_PROGRESS, progress);
    }
  }

  /**
   * Emit update downloaded event
   */
  private emitDownloaded(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_DOWNLOADED);
    }
  }
}

export default UpdateService;
