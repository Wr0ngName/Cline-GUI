/**
 * IPC helper utilities for main process.
 */

import type { BrowserWindow } from 'electron';

import { ValidationError, ERROR_CODES } from '../errors';

import logger from './logger';

/**
 * Safely send a message to the renderer process.
 * Handles window existence and destruction checks.
 *
 * @param getMainWindow - Function to get the main window reference
 * @param channel - IPC channel name
 * @param data - Data to send
 * @returns true if message was sent, false otherwise
 */
export function sendToRenderer(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): boolean {
  const window = getMainWindow();

  if (!window) {
    logger.debug('Cannot send to renderer: no main window', { channel });
    return false;
  }

  if (window.isDestroyed()) {
    logger.debug('Cannot send to renderer: window is destroyed', { channel });
    return false;
  }

  try {
    window.webContents.send(channel, ...args);
    return true;
  } catch (error) {
    logger.error('Failed to send to renderer', { channel, error });
    return false;
  }
}

/**
 * Create a bound sendToRenderer function for a specific window getter.
 *
 * @param getMainWindow - Function to get the main window reference
 * @returns Bound send function
 */
export function createSender(
  getMainWindow: () => BrowserWindow | null
): (channel: string, ...args: unknown[]) => boolean {
  return (channel: string, ...args: unknown[]) =>
    sendToRenderer(getMainWindow, channel, ...args);
}

/**
 * Validate that a value is a non-empty string.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if validation fails
 */
export function validateString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
  if (value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must not be empty`, fieldName, ERROR_CODES.VALIDATION_REQUIRED);
  }
}

/**
 * Validate that a value is an object.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if validation fails
 */
export function validateObject(
  value: unknown,
  fieldName: string
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(`${fieldName} must be an object`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
}

/**
 * Validate that a path is safe (no path traversal).
 *
 * @param filePath - Path to validate
 * @throws Error if path contains traversal patterns
 */
export function validatePath(filePath: string): void {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.includes('../') || normalized.includes('..\\')) {
    throw new ValidationError('Invalid path: path traversal not allowed', 'filePath', ERROR_CODES.FS_PATH_TRAVERSAL);
  }

  // Check for null bytes (path injection)
  if (filePath.includes('\0')) {
    throw new ValidationError('Invalid path: null bytes not allowed', 'filePath', ERROR_CODES.VALIDATION_INVALID_PATH);
  }
}
