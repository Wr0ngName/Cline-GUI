/**
 * Simple logger for renderer process.
 * In development, logs to console. In production, could be extended
 * to send logs to main process via IPC.
 */

const isDev = import.meta.env.DEV;

interface LogData {
  [key: string]: unknown;
}

function formatMessage(level: string, message: string, data?: LogData): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level}] ${message}${dataStr}`;
}

export const logger = {
  debug(message: string, data?: LogData): void {
    if (isDev) {
      console.debug(formatMessage('debug', message, data));
    }
  },

  info(message: string, data?: LogData): void {
    if (isDev) {
      console.info(formatMessage('info', message, data));
    }
  },

  warn(message: string, data?: LogData): void {
    console.warn(formatMessage('warn', message, data));
  },

  error(message: string, error?: unknown): void {
    const errorData = error instanceof Error
      ? { error: error.message, stack: error.stack }
      : error
        ? { error: String(error) }
        : undefined;
    console.error(formatMessage('error', message, errorData));
  },
};

export default logger;
