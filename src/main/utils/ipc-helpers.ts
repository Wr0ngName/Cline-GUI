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

/**
 * Validate that a value is a boolean.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if validation fails
 */
export function validateBoolean(value: unknown, fieldName: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${fieldName} must be a boolean`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
}

/**
 * Validate that a value is a number within optional bounds.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Optional min/max constraints
 * @throws Error if validation fails
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  options?: { min?: number; max?: number }
): asserts value is number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
  if (options?.min !== undefined && value < options.min) {
    throw new ValidationError(`${fieldName} must be >= ${options.min}`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
  if (options?.max !== undefined && value > options.max) {
    throw new ValidationError(`${fieldName} must be <= ${options.max}`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
}

/**
 * Validate that a value is an array.
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @throws Error if validation fails
 */
export function validateArray(value: unknown, fieldName: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`, fieldName, ERROR_CODES.VALIDATION_TYPE_MISMATCH);
  }
}

/**
 * Get a human-readable error message from an unknown error.
 *
 * @param error - The error to extract message from
 * @returns Human-readable error message
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Format an error message with a prefix.
 *
 * @param prefix - Prefix for the error message (e.g., "Failed to load config")
 * @param error - The original error
 * @returns Formatted error message
 */
export function formatErrorMessage(prefix: string, error: unknown): string {
  return `${prefix}: ${getErrorMessage(error)}`;
}
