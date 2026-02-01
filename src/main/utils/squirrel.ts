/**
 * Squirrel.Windows event handler with user data cleanup prompt
 *
 * Uses electron-squirrel-startup for install/update events (reliable),
 * but intercepts uninstall to show a cleanup prompt.
 *
 * Note: This file must NOT import npm dependencies that may not be
 * available during Squirrel events when the app runs from a temp location.
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
 * Get the path to app data directories
 */
function getAppDataPaths(): string[] {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = app.getPath('appData');

    return [
      userDataPath,
      path.join(configPath, 'cline-gui'),
      path.join(configPath, 'Cline GUI'),
    ].filter(p => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
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

  log.info('Running Squirrel command:', updateExe, args, appName);

  try {
    spawn(updateExe, args.concat([appName]), { detached: true });
  } catch (error) {
    log.error('Failed to run Squirrel command:', args, error);
  }
}

/**
 * Handle uninstall event - prompt user about data cleanup
 */
async function handleUninstall(): Promise<void> {
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

/**
 * Handle Squirrel.Windows events
 * Returns true if a Squirrel event was handled (app should quit)
 *
 * Only handles uninstall specially (for cleanup prompt).
 * Install/update use electron-squirrel-startup (more reliable).
 */
export async function handleSquirrelEvents(): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  const squirrelEvent = process.argv[1];

  // Only intercept uninstall for our custom cleanup prompt
  // Let electron-squirrel-startup handle install/update (it's more reliable)
  if (squirrelEvent === '--squirrel-uninstall') {
    log.info('Handling uninstall event');

    await handleUninstall();

    // Remove shortcuts
    runSquirrelCommand(['--removeShortcut']);

    // Give time for shortcut removal
    setTimeout(() => app.quit(), 1000);
    return true;
  }

  return false;
}

export default handleSquirrelEvents;
