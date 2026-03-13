/**
 * Custom error classes for the main process.
 * Provides structured error handling with error codes for better debugging.
 */

/**
 * Base error class for all application errors.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      stack: this.stack,
    };
  }
}

/**
 * Authentication-related errors.
 */
export class AuthenticationError extends AppError {
  constructor(message: string, code?: string, originalError?: unknown) {
    super(message, code || 'AUTH_ERROR', originalError);
    this.name = 'AuthenticationError';
  }
}

/**
 * Configuration-related errors.
 */
export class ConfigurationError extends AppError {
  constructor(message: string, code?: string, originalError?: unknown) {
    super(message, code || 'CONFIG_ERROR', originalError);
    this.name = 'ConfigurationError';
  }
}

/**
 * File system operation errors.
 */
export class FileSystemError extends AppError {
  constructor(
    message: string,
    public readonly path?: string,
    code?: string,
    originalError?: unknown
  ) {
    super(message, code || 'FS_ERROR', originalError);
    this.name = 'FileSystemError';
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      path: this.path,
    };
  }
}

/**
 * Input validation errors.
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly field?: string,
    code?: string,
    originalError?: unknown
  ) {
    super(message, code || 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      field: this.field,
    };
  }
}

/**
 * IPC communication errors.
 */
export class IpcError extends AppError {
  constructor(
    message: string,
    public readonly channel?: string,
    code?: string,
    originalError?: unknown
  ) {
    super(message, code || 'IPC_ERROR', originalError);
    this.name = 'IpcError';
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      channel: this.channel,
    };
  }
}

/**
 * Error codes for categorizing errors.
 */
export const ERROR_CODES = {
  // Authentication
  AUTH_NOT_CONFIGURED: 'AUTH_NOT_CONFIGURED',
  AUTH_OAUTH_FAILED: 'AUTH_OAUTH_FAILED',
  AUTH_OAUTH_TIMEOUT: 'AUTH_OAUTH_TIMEOUT',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_ENCRYPTION_UNAVAILABLE: 'AUTH_ENCRYPTION_UNAVAILABLE',

  // Configuration
  CONFIG_LOAD_FAILED: 'CONFIG_LOAD_FAILED',
  CONFIG_SAVE_FAILED: 'CONFIG_SAVE_FAILED',
  CONFIG_INVALID: 'CONFIG_INVALID',

  // File system
  FS_PATH_TRAVERSAL: 'FS_PATH_TRAVERSAL',
  FS_FILE_NOT_FOUND: 'FS_FILE_NOT_FOUND',
  FS_PERMISSION_DENIED: 'FS_PERMISSION_DENIED',
  FS_FILE_TOO_LARGE: 'FS_FILE_TOO_LARGE',
  FS_READ_FAILED: 'FS_READ_FAILED',
  FS_WRITE_FAILED: 'FS_WRITE_FAILED',

  // Validation
  VALIDATION_REQUIRED: 'VALIDATION_REQUIRED',
  VALIDATION_TYPE_MISMATCH: 'VALIDATION_TYPE_MISMATCH',
  VALIDATION_INVALID_PATH: 'VALIDATION_INVALID_PATH',
  VALIDATION_MESSAGE_TOO_LONG: 'VALIDATION_MESSAGE_TOO_LONG',

  // IPC
  IPC_HANDLER_FAILED: 'IPC_HANDLER_FAILED',
  IPC_INVALID_PARAMS: 'IPC_INVALID_PARAMS',

  // Conversation
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  CONVERSATION_SAVE_FAILED: 'CONVERSATION_SAVE_FAILED',
  CONVERSATION_LOAD_FAILED: 'CONVERSATION_LOAD_FAILED',

  // Claude
  CLAUDE_SEND_FAILED: 'CLAUDE_SEND_FAILED',
  CLAUDE_ABORT_FAILED: 'CLAUDE_ABORT_FAILED',
  CLAUDE_PERMISSION_FAILED: 'CLAUDE_PERMISSION_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
