/**
 * Composable for handling async operations with loading/error state
 *
 * Provides a standardized way to handle async operations with:
 * - Loading state tracking
 * - Error state management
 * - Automatic state cleanup
 *
 * @example
 * ```ts
 * const { isLoading, error, execute, clearError } = useAsyncOperation();
 *
 * async function loadData() {
 *   await execute(async () => {
 *     const data = await fetchData();
 *     items.value = data;
 *   }, 'Failed to load data');
 * }
 * ```
 */

import { ref, type Ref } from 'vue';

import { logger } from '../utils/logger';

export interface AsyncOperationState {
  /** Whether an async operation is in progress */
  isLoading: Ref<boolean>;
  /** Error message from the last failed operation, or null if no error */
  error: Ref<string | null>;
}

export interface AsyncOperationActions {
  /**
   * Execute an async operation with automatic loading/error handling
   *
   * @param operation - The async function to execute
   * @param errorMessage - User-friendly error message prefix
   * @returns The result of the operation, or undefined if it failed
   */
  execute: <T>(operation: () => Promise<T>, errorMessage?: string) => Promise<T | undefined>;

  /**
   * Clear the current error state
   */
  clearError: () => void;

  /**
   * Reset both loading and error states
   */
  reset: () => void;
}

export type AsyncOperation = AsyncOperationState & AsyncOperationActions;

/**
 * Creates an async operation handler with loading and error state management
 *
 * @param initialLoading - Initial loading state (default: false)
 * @returns Object with state refs and action functions
 */
export function useAsyncOperation(initialLoading = false): AsyncOperation {
  const isLoading = ref(initialLoading);
  const error = ref<string | null>(null);

  /**
   * Execute an async operation with automatic state management
   */
  async function execute<T>(
    operation: () => Promise<T>,
    errorMessage = 'Operation failed'
  ): Promise<T | undefined> {
    isLoading.value = true;
    error.value = null;

    try {
      const result = await operation();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = `${errorMessage}: ${message}`;
      logger.error(errorMessage, { error: err });
      return undefined;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Clear the current error
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Reset both loading and error states
   */
  function reset(): void {
    isLoading.value = false;
    error.value = null;
  }

  return {
    isLoading,
    error,
    execute,
    clearError,
    reset,
  };
}

/**
 * Type for the return value of useAsyncOperation
 */
export type UseAsyncOperation = ReturnType<typeof useAsyncOperation>;
