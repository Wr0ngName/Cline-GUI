/**
 * ANSI Escape Code Utilities
 *
 * Functions for handling ANSI escape sequences in terminal output.
 * Extracted from AuthService for reuse across the codebase.
 */

/* eslint-disable no-control-regex */

/**
 * Regular expression patterns for ANSI escape sequences
 */
const ANSI_PATTERNS = {
  /** CSI (Control Sequence Introducer) sequences - most common */
  CSI: /\x1b\[[0-9;?]*[a-zA-Z]/g,
  /** OSC (Operating System Command) sequences */
  OSC: /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,
  /** DCS, SOS, PM, APC sequences */
  CONTROL: /\x1b[PX^_][^\x1b]*\x1b\\/g,
  /** Other single-character escapes */
  SINGLE: /\x1b./g,
} as const;

/**
 * Strip all ANSI escape codes from a string.
 *
 * Handles:
 * - CSI sequences (cursor movement, colors, etc.)
 * - OSC sequences (window titles, hyperlinks)
 * - DCS, SOS, PM, APC control sequences
 * - Single-character escape sequences
 *
 * @param str - The string containing ANSI escape codes
 * @returns The string with all ANSI codes removed
 *
 * @example
 * stripAnsi('\x1b[31mRed Text\x1b[0m') // => 'Red Text'
 * stripAnsi('\x1b]0;Window Title\x07') // => ''
 */
export function stripAnsi(str: string): string {
  let clean = str;
  // CSI sequences (most common)
  clean = clean.replace(ANSI_PATTERNS.CSI, '');
  // OSC sequences
  clean = clean.replace(ANSI_PATTERNS.OSC, '');
  // DCS, SOS, PM, APC
  clean = clean.replace(ANSI_PATTERNS.CONTROL, '');
  // Other single-char escapes
  clean = clean.replace(ANSI_PATTERNS.SINGLE, '');
  return clean;
}

/**
 * Check if a string contains ANSI escape codes.
 *
 * @param str - The string to check
 * @returns true if the string contains ANSI codes
 */
export function hasAnsi(str: string): boolean {
  return (
    ANSI_PATTERNS.CSI.test(str) ||
    ANSI_PATTERNS.OSC.test(str) ||
    ANSI_PATTERNS.CONTROL.test(str) ||
    ANSI_PATTERNS.SINGLE.test(str)
  );
}

/* eslint-enable no-control-regex */
