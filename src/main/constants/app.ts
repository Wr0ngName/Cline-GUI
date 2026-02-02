/**
 * Main process constants
 * Centralized magic numbers for configuration and timeouts
 */

export const MAIN_CONSTANTS = {
  AUTH: {
    OAUTH_TIMEOUT_MS: 600000, // 10 minutes
    OAUTH_URL_DETECTION_TIMEOUT_MS: 30000, // 30 seconds
    OAUTH_URL_DETECTION_DELAY_MS: 3000, // 3 seconds
    OAUTH_COMPLETION_TIMEOUT_MS: 45000, // 45 seconds (90 attempts * 500ms)
    OAUTH_POLL_INTERVAL_MS: 500,
    OAUTH_POLL_MAX_ATTEMPTS: 90,
    OAUTH_PROCESS_EXIT_DELAY_MS: 500,
    OAUTH_CREDENTIALS_CHECK_DELAY_MS: 500,
    OAUTH_TERMINAL_COLS: 500, // Wide terminal to prevent URL wrapping
    OAUTH_TERMINAL_ROWS: 30,
    OAUTH_CODE_MIN_LENGTH: 10,
    OAUTH_CODE_MAX_LENGTH: 500,
    PTY_CLEANUP_DELAY_MS: 1000,
  },
  CLAUDE: {
    PERMISSION_TIMEOUT_MS: 60000, // 60 seconds - SDK requirement
    INTERRUPT_DELAY_MS: 1000,
  },
  FILES: {
    WATCHER_DEBOUNCE_MS: 300,
    MAX_TREE_DEPTH: 5,
  },
  LOGGING: {
    MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  },
} as const;
