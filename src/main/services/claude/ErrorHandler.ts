/**
 * Error Handler for Claude Code
 *
 * Converts technical error messages to user-friendly messages.
 * Extracted from ClaudeCodeService for better separation of concerns.
 */

/**
 * Converts technical error messages to user-friendly messages
 */
export class ErrorHandler {
  /**
   * Convert a technical error message to a user-friendly message
   */
  getHumanReadableError(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    // Authentication errors
    if (lowerError.includes('401') || lowerError.includes('unauthorized') ||
        lowerError.includes('invalid bearer') || lowerError.includes('invalid token')) {
      return 'Authentication failed. Your login session may have expired. Please log out and log in again.';
    }

    // Rate limiting
    if (lowerError.includes('429') || lowerError.includes('rate limit') ||
        lowerError.includes('too many requests')) {
      return 'Rate limit exceeded. Please wait a moment before sending another message.';
    }

    // Network errors
    if (lowerError.includes('network') || lowerError.includes('econnrefused') ||
        lowerError.includes('enotfound') || lowerError.includes('etimedout')) {
      return 'Network error. Please check your internet connection and try again.';
    }

    // Process exit errors
    if (lowerError.includes('process exited') || lowerError.includes('exit code')) {
      return 'The Claude process ended unexpectedly. Please try again. If the problem persists, restart the application.';
    }

    // API errors
    if (lowerError.includes('500') || lowerError.includes('502') ||
        lowerError.includes('503') || lowerError.includes('504')) {
      return 'Claude service is temporarily unavailable. Please try again in a few moments.';
    }

    // Fallback to original message or generic error
    return errorMessage || 'Failed to communicate with Claude. Please try again.';
  }

  /**
   * Check if an error is an abort error
   */
  isAbortError(error: Error): boolean {
    return error.name === 'AbortError';
  }

  /**
   * Check if an error is a process exit error that occurred after successful completion
   */
  isPostSuccessProcessExitError(errorMessage: string, querySucceeded: boolean): boolean {
    return querySucceeded && errorMessage.includes('process exited');
  }
}

export default ErrorHandler;
