/**
 * Auto-update service using electron-updater
 * Configured for GitLab using Job Artifacts API
 *
 * Industry standard approach for GitLab:
 * 1. Query GitLab Releases API to find latest release tag
 * 2. Use Job Artifacts API to fetch latest.yml from that tag
 * 3. Configure electron-updater dynamically
 */

import { BrowserWindow, app, net } from 'electron';
import { autoUpdater, UpdateInfo as ElectronUpdateInfo } from 'electron-updater';

import { IPC_CHANNELS, UpdateInfo, UpdateProgress } from '../../shared/types';
import logger from '../utils/logger';

// GitLab server configuration
const GITLAB_HOST = 'https://dev.web.wr0ng.name';
const GITLAB_PROJECT_ID = 'wrongname%2Fcline-gui'; // URL-encoded project path
// Note: Numeric project ID for some API calls is 200

// API endpoints
const RELEASES_API = `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/releases`;
const PACKAGES_API = `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/releases`;

export class UpdateService {
  private mainWindow: BrowserWindow | null = null;
  private isCheckingForUpdates = false;

  constructor() {
    this.configureUpdater();
    logger.info('UpdateService initialized');
  }

  /**
   * Configure the auto-updater base settings
   */
  private configureUpdater(): void {
    const currentVersion = app.getVersion();

    // Initial configuration - will be updated dynamically when checking for updates
    // Start with current version's package directory as fallback
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${PACKAGES_API}/${currentVersion}`,
    });

    // Configure authentication for private package registry (if needed)
    const updateToken = process.env.GITLAB_UPDATE_TOKEN;
    if (updateToken) {
      autoUpdater.requestHeaders = {
        'Private-Token': updateToken,
      };
      logger.info('Auto-updater configured with authentication');
    } else {
      logger.info('Auto-updater configured without authentication (public access only)');
    }

    logger.info('Auto-updater configured', {
      currentVersion,
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
      const errorMessage = error?.message || '';
      if (errorMessage.includes('404') || errorMessage.includes('Cannot find channel')) {
        // This is expected when no releases have been published yet
        logger.info('No updates available (404 - no releases published yet)');
      } else {
        logger.error('Update error', error);
      }
    });
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Fetch the latest release tag from GitLab Releases API
   */
  private async fetchLatestReleaseTag(): Promise<string | null> {
    return new Promise((resolve) => {
      const request = net.request({
        method: 'GET',
        url: RELEASES_API,
      });

      const updateToken = process.env.GITLAB_UPDATE_TOKEN;
      if (updateToken) {
        request.setHeader('Private-Token', updateToken);
      }

      let responseData = '';

      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          logger.warn('Failed to fetch releases', { statusCode: response.statusCode });
          resolve(null);
          return;
        }

        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          try {
            const releases = JSON.parse(responseData);
            if (Array.isArray(releases) && releases.length > 0) {
              // Releases are sorted by released_at descending by default
              const latestRelease = releases[0];
              const tagName = latestRelease.tag_name;
              logger.info('Found latest release', { tagName, name: latestRelease.name });
              resolve(tagName);
            } else {
              logger.info('No releases found');
              resolve(null);
            }
          } catch (error) {
            logger.error('Failed to parse releases response', error);
            resolve(null);
          }
        });
      });

      request.on('error', (error) => {
        logger.error('Failed to fetch releases', error);
        resolve(null);
      });

      request.end();
    });
  }

  /**
   * Check for updates
   * First queries GitLab for the latest release, then checks via electron-updater
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    if (this.isCheckingForUpdates) {
      logger.warn('Already checking for updates');
      return null;
    }

    this.isCheckingForUpdates = true;

    try {
      // Step 1: Fetch the latest release tag from GitLab
      const latestTag = await this.fetchLatestReleaseTag();

      if (!latestTag) {
        logger.info('No releases found on GitLab');
        return null;
      }

      // Extract version from tag (remove 'v' prefix if present)
      const latestVersion = latestTag.startsWith('v') ? latestTag.slice(1) : latestTag;
      const currentVersion = app.getVersion();

      // Quick version comparison before making more API calls
      if (this.compareVersions(currentVersion, latestVersion) >= 0) {
        logger.info('Already on latest version', { currentVersion, latestVersion });
        return null;
      }

      // Step 2: Update the feed URL to point to the latest version's packages
      const feedUrl = `${PACKAGES_API}/${latestVersion}`;
      logger.info('Setting feed URL for update check', { feedUrl, latestTag });

      autoUpdater.setFeedURL({
        provider: 'generic',
        url: feedUrl,
      });

      // Step 3: Check for updates using electron-updater
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
      const errorMessage = (error as Error)?.message || '';
      if (errorMessage.includes('404') || errorMessage.includes('Cannot find channel')) {
        logger.info('No releases published to package registry yet');
        return null;
      }
      logger.error('Failed to check for updates', error);
      return null;
    } finally {
      this.isCheckingForUpdates = false;
    }
  }

  /**
   * Compare two semantic versions
   * Returns: -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }
    return 0;
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
