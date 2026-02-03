/**
 * Renderer process constants
 * Centralized configuration values for the Vue frontend
 */
export const CONSTANTS = {
  /** Auto-save configuration */
  AUTO_SAVE: {
    /** Delay before auto-saving changes - 2 seconds */
    DELAY_MS: 2000,
  },
  /** Conversation-related limits */
  CONVERSATION: {
    /** Maximum length for conversation titles */
    TITLE_MAX_LENGTH: 50,
    /** Length at which to truncate titles with ellipsis */
    TITLE_TRUNCATE_LENGTH: 47,
  },
  /** File system constants */
  FILES: {
    /** Threshold for batch file changes before full tree reload */
    BATCH_CHANGE_THRESHOLD: 10,
  },
  /** Message-related limits */
  MESSAGES: {
    /** Maximum number of messages to keep in memory */
    MAX_COUNT: 1000,
  },
  /** UI configuration */
  UI: {
    /** Maximum height for auto-resizing textarea (pixels) */
    TEXTAREA_MAX_HEIGHT: 200,
    /** Debounce delay for file watcher events (ms) */
    FILE_WATCHER_DEBOUNCE_MS: 300,
    /** Scroll margin for auto-scrolling (pixels) */
    SCROLL_MARGIN: 100,
  },
  /** Time unit constants */
  TIME: {
    MILLISECONDS_PER_SECOND: 1000,
    SECONDS_PER_MINUTE: 60,
    MINUTES_PER_HOUR: 60,
    HOURS_PER_DAY: 24,
    DAYS_PER_WEEK: 7,
  },
  /** Vue transition class configurations */
  TRANSITIONS: {
    /** Standard fade transition for modals and overlays */
    FADE: {
      enter: 'transition ease-out duration-200',
      enterFrom: 'opacity-0',
      enterTo: 'opacity-100',
      leave: 'transition ease-in duration-150',
      leaveFrom: 'opacity-100',
      leaveTo: 'opacity-0',
    },
    /** Slide-up transition for panels and toasts */
    SLIDE_UP: {
      enter: 'transition-all duration-200 ease-out',
      enterFrom: 'opacity-0 translate-y-2',
      enterTo: 'opacity-100 translate-y-0',
      leave: 'transition-all duration-150 ease-in',
      leaveFrom: 'opacity-100 translate-y-0',
      leaveTo: 'opacity-0 translate-y-2',
    },
    /** Scale transition for modal content */
    SCALE: {
      enter: 'transition ease-out duration-200',
      enterFrom: 'opacity-0 scale-95',
      enterTo: 'opacity-100 scale-100',
      leave: 'transition ease-in duration-150',
      leaveFrom: 'opacity-100 scale-100',
      leaveTo: 'opacity-0 scale-95',
    },
    /** Collapse transition for expandable sections */
    COLLAPSE: {
      enter: 'transition-all duration-150 ease-out',
      enterFrom: 'opacity-0 max-h-0',
      enterTo: 'opacity-100 max-h-screen',
      leave: 'transition-all duration-100 ease-in',
      leaveFrom: 'opacity-100 max-h-screen',
      leaveTo: 'opacity-0 max-h-0',
    },
  },
} as const;

// Computed time constants for convenience
export const TIME_MS = {
  ONE_SECOND: CONSTANTS.TIME.MILLISECONDS_PER_SECOND,
  ONE_MINUTE: CONSTANTS.TIME.SECONDS_PER_MINUTE * CONSTANTS.TIME.MILLISECONDS_PER_SECOND,
  ONE_HOUR: CONSTANTS.TIME.MINUTES_PER_HOUR * CONSTANTS.TIME.SECONDS_PER_MINUTE * CONSTANTS.TIME.MILLISECONDS_PER_SECOND,
  ONE_DAY: CONSTANTS.TIME.HOURS_PER_DAY * CONSTANTS.TIME.MINUTES_PER_HOUR * CONSTANTS.TIME.SECONDS_PER_MINUTE * CONSTANTS.TIME.MILLISECONDS_PER_SECOND,
  ONE_WEEK: CONSTANTS.TIME.DAYS_PER_WEEK * CONSTANTS.TIME.HOURS_PER_DAY * CONSTANTS.TIME.MINUTES_PER_HOUR * CONSTANTS.TIME.SECONDS_PER_MINUTE * CONSTANTS.TIME.MILLISECONDS_PER_SECOND,
} as const;
