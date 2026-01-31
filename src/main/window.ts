/**
 * Window management for the main application window
 */

import { BrowserWindow, shell } from 'electron';
import path from 'node:path';

import logger from './utils/logger';

let mainWindow: BrowserWindow | null = null;

// Declare the Vite dev server URL (provided by Electron Forge)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

/**
 * Create the main application window
 */
export async function createWindow(): Promise<BrowserWindow> {
  logger.info('Creating main window');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Cline GUI',
    backgroundColor: '#fafafa',
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for some Electron features
    },
  });

  // Load the app
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window ready and shown');
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development' || MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed');
  });

  return mainWindow;
}

/**
 * Get the main window instance
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Minimize the window
 */
export function minimizeWindow(): void {
  mainWindow?.minimize();
}

/**
 * Maximize or restore the window
 */
export function maximizeWindow(): void {
  if (mainWindow?.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow?.maximize();
  }
}

/**
 * Close the window
 */
export function closeWindow(): void {
  mainWindow?.close();
}
