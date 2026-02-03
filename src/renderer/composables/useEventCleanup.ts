/**
 * Composable for managing event listener cleanup
 *
 * Provides a centralized way to track and clean up event listeners,
 * preventing memory leaks in Vue components and Pinia stores.
 *
 * @example
 * ```ts
 * const { addCleanup, cleanup } = useEventCleanup();
 *
 * // Register cleanups
 * addCleanup(window.electron.config.onChange(handler));
 * addCleanup(() => mediaQuery.removeEventListener('change', handler));
 *
 * // Clean up all at once
 * onUnmounted(cleanup);
 * ```
 */

/**
 * Creates an event cleanup manager for tracking and disposing of event listeners
 */
export function useEventCleanup() {
  const cleanupFns: Array<() => void> = [];

  /**
   * Register a cleanup function to be called when cleanup() is invoked
   *
   * @param cleanupFn - Function that removes an event listener or disposes a resource
   */
  function addCleanup(cleanupFn: (() => void) | null | undefined): void {
    if (cleanupFn) {
      cleanupFns.push(cleanupFn);
    }
  }

  /**
   * Execute all registered cleanup functions and clear the list
   */
  function cleanup(): void {
    for (const fn of cleanupFns) {
      try {
        fn();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    }
    cleanupFns.length = 0;
  }

  /**
   * Get the count of registered cleanup functions (for testing/debugging)
   */
  function getCleanupCount(): number {
    return cleanupFns.length;
  }

  return {
    addCleanup,
    cleanup,
    getCleanupCount,
  };
}

/**
 * Type for the return value of useEventCleanup
 */
export type EventCleanup = ReturnType<typeof useEventCleanup>;
