/**
 * Auto-update service using electron-updater
 * Configured for GitLab releases
 */

import { autoUpdater, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';

import { IPC_CHANNELS, UpdateInfo, UpdateProgress } from '../../shared/types';
import logger from '../utils/logger';

// GitLab server configuration
const GITLAB_HOST = 'https://dev.web.wr0ng.name';
const GITLAB_PROJECT = 'wrongname/cline-gui';

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private isCheckingForUpdates = false;

  constructor() {
    this.configureUpdater();
    logger.info('UpdateService initialized');
  }

  /**
   * Configure the auto-updater for GitLab
   */
  private configureUpdater(): void {
    // Configure for GitLab Generic Server
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${GITLAB_HOST}/api/v4/projects/${encodeURIComponent(GITLAB_PROJECT)}/packages/generic/releases`,
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
