/**
 * Squirrel.Windows event handler with user data cleanup prompt
 *
 * Note: This file must NOT import electron-log or other dependencies
 * that may not be available during Squirrel install/update events
 * when the app runs from a temporary location.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { app, dialog } from 'electron';

// Simple console logging for Squirrel events (no dependencies)
const log = {
  info: (...args: unknown[]) => console.log('[Squirrel]', ...args),
  error: (...args: unknown[]) => console.error('[Squirrel]', ...args),
};

/**
 * Get the path to user data directory
 */
function getUserDataPath(): string {
  return app.getPath('userData');
}

/**
 * Get the path to app data (electron-store config)
 */
function getAppDataPaths(): string[] {
  const userDataPath = getUserDataPath();
  const configPath = app.getPath('appData');

  return [
    userDataPath,
    path.join(configPath, 'cline-gui'),
    path.join(configPath, 'Cline GUI'),
  ].filter(p => fs.existsSync(p));
}

/**
 * Remove user data directories
 */
function removeUserData(): void {
  const paths = getAppDataPaths();

  for (const dataPath of paths) {
    try {
      if (fs.existsSync(dataPath)) {
        fs.rmSync(dataPath, { recursive: true, force: true });
        log.info('Removed user data directory:', dataPath);
      }
    } catch (error) {
      log.error('Failed to remove user data directory:', dataPath, error);
    }
  }
}

/**
 * Run Squirrel update command
 */
function runSquirrelCommand(args: string[]): void {
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const appName = path.basename(process.execPath, '.exe');

  try {
    spawn(updateExe, args.concat([appName]), { detached: true });
  } catch (error) {
    log.error('Failed to run Squirrel command:', args, error);
  }
}

/**
 * Handle Squirrel.Windows events
 * Returns true if a Squirrel event was handled (app should quit)
 */
export async function handleSquirrelEvents(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  const squirrelEvent = process.argv[1];

  if (!squirrelEvent?.startsWith('--squirrel-')) {
    return false;
  }

  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Create desktop and start menu shortcuts
      runSquirrelCommand(['--createShortcut']);
      app.quit();
      return true;

    case '--squirrel-uninstall':
      // Show dialog asking about user data cleanup
      // Note: We need to handle this before app is fully ready
      await handleUninstall();

      // Remove shortcuts
      runSquirrelCommand(['--removeShortcut']);
      app.quit();
      return true;

    case '--squirrel-obsolete':
      // Called on older version being updated
      app.quit();
      return true;

    case '--squirrel-firstrun':
      // First run after install - could show welcome screen
      return false;

    default:
      return false;
  }
}

/**
 * Handle uninstall event - prompt user about data cleanup
 */
async function handleUninstall(): Promise<void> {
  // We need to show a dialog, but app might not be ready yet
  // Use a simple approach with app.whenReady()

  try {
    await app.whenReady();

    const result = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Keep My Data', 'Remove Everything'],
      defaultId: 0,
      cancelId: 0,
      title: 'Uninstall Cline GUI',
      message: 'Do you want to keep your settings and conversation history?',
      detail: 'Choose "Keep My Data" to preserve your configuration and conversations for future reinstalls.\n\nChoose "Remove Everything" to completely remove all Cline GUI data from your computer.',
    });

    if (result.response === 1) {
      // User chose "Remove Everything"
      removeUserData();
      log.info('User chose to remove all data during uninstall');
    } else {
      log.info('User chose to keep data during uninstall');
    }
  } catch (error) {
    // If dialog fails, default to keeping data (safer option)
    log.error('Failed to show uninstall dialog, keeping user data:', error);
  }
}

export default handleSquirrelEvents;
