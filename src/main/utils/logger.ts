/**
 * Logger utility using electron-log
 * Provides consistent logging across the main process
 */

import path from 'node:path';

import { app } from 'electron';
import log from 'electron-log';

// Configure log file location
const logPath = path.join(app.getPath('userData'), 'logs');
log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');

// Configure log format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

// Set log level based on environment
log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

// Maximum log file size (5MB)
log.transports.file.maxSize = 5 * 1024 * 1024;

// Export configured logger
export const logger = {
  debug: (message: string, ...args: unknown[]) => log.debug(message, ...args),
  info: (message: string, ...args: unknown[]) => log.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => log.warn(message, ...args),
  error: (message: string, ...args: unknown[]) => log.error(message, ...args),
  verbose: (message: string, ...args: unknown[]) => log.verbose(message, ...args),
};

export default logger;
