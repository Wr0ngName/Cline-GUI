/**
 * Main process constants
 * Centralized magic numbers for configuration and timeouts
 */

export const MAIN_CONSTANTS = {
  AUTH: {
    /** OAuth flow timeout - 10 minutes */
    OAUTH_TIMEOUT_MS: 600000,
    /** Time to wait for OAuth URL to appear in CLI output - 30 seconds */
    OAUTH_URL_DETECTION_TIMEOUT_MS: 30000,
    /** Delay before considering OAuth URL ready - 3 seconds */
    OAUTH_URL_DETECTION_DELAY_MS: 3000,
    /** OAuth completion timeout - 45 seconds (90 attempts * 500ms) */
    OAUTH_COMPLETION_TIMEOUT_MS: 45000,
    /** Polling interval for OAuth completion - 500ms */
    OAUTH_POLL_INTERVAL_MS: 500,
    /** Maximum polling attempts for OAuth completion */
    OAUTH_POLL_MAX_ATTEMPTS: 90,
    /** Delay after OAuth process exit before final check - 500ms */
    OAUTH_PROCESS_EXIT_DELAY_MS: 500,
    /** Delay before checking credentials file - 500ms */
    OAUTH_CREDENTIALS_CHECK_DELAY_MS: 500,
    /** Wide terminal width to prevent URL wrapping */
    OAUTH_TERMINAL_COLS: 500,
    /** Terminal rows for OAuth PTY */
    OAUTH_TERMINAL_ROWS: 30,
    /** Minimum length for OAuth authorization code */
    OAUTH_CODE_MIN_LENGTH: 10,
    /** Maximum length for OAuth authorization code */
    OAUTH_CODE_MAX_LENGTH: 500,
    /** Delay before cleaning up PTY resources - 1 second */
    PTY_CLEANUP_DELAY_MS: 1000,
    /** Minimum OAuth token length for validation */
    OAUTH_TOKEN_MIN_LENGTH: 50,
    /** Expected OAuth token length (for detecting over-matched regex) */
    OAUTH_TOKEN_EXPECTED_LENGTH: 91,
    /** Minimum API key length for validation */
    API_KEY_MIN_LENGTH: 40,
  },
  CLAUDE: {
    /** Permission request timeout - 60 seconds (SDK requirement) */
    PERMISSION_TIMEOUT_MS: 60000,
    /** Delay when interrupting Claude operations - 1 second */
    INTERRUPT_DELAY_MS: 1000,
  },
  FILES: {
    /** Debounce interval for file watcher events - 300ms */
    WATCHER_DEBOUNCE_MS: 300,
    /** Maximum depth for file tree scanning */
    MAX_TREE_DEPTH: 5,
    /** Threshold for batch file changes before full tree reload */
    BATCH_CHANGE_THRESHOLD: 10,
  },
  LOGGING: {
    /** Maximum log file size before rotation - 5MB */
    MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,
  },
  WINDOW: {
    /** Default window width */
    DEFAULT_WIDTH: 1400,
    /** Default window height */
    DEFAULT_HEIGHT: 900,
    /** Minimum window width */
    MIN_WIDTH: 800,
    /** Minimum window height */
    MIN_HEIGHT: 600,
    /** Timeout for showing window if ready-to-show doesn't fire - 5 seconds */
    SHOW_TIMEOUT_MS: 5000,
  },
} as const;
