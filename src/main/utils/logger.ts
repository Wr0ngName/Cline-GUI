/**
 * Logger utility using electron-log
 * Provides consistent logging across the main process
 */

import path from 'node:path';

import { app } from 'electron';
import log from 'electron-log';

import type { LogLevel } from '../../shared/types';
import { MAIN_CONSTANTS } from '../constants/app';

// Configure log file location
const logPath = path.join(app.getPath('userData'), 'logs');
log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');

// Configure log format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

// Set log level based on environment (will be updated from config)
log.transports.file.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

// Maximum log file size
log.transports.file.maxSize = MAIN_CONSTANTS.LOGGING.MAX_FILE_SIZE_BYTES;

/**
 * Set the log level dynamically (called when config changes)
 */
export function setLogLevel(level: LogLevel): void {
  log.transports.file.level = level;
  log.transports.console.level = level;
  log.info(`Log level set to: ${level}`);
}

// Export configured logger
export const logger = {
  debug: (message: string, ...args: unknown[]) => log.debug(message, ...args),
  info: (message: string, ...args: unknown[]) => log.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => log.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => log.error(message, ...args),
  verbose: (message: string, ...args: unknown[]) => log.verbose(message, ...args),
  setLogLevel,
};

export default logger;
