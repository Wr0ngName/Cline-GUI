/**
 * Tests for the useEventCleanup composable.
 *
 * Tests cover:
 * - Adding cleanup functions
 * - Executing cleanup functions
 * - Error handling during cleanup
 * - Cleanup count tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useEventCleanup } from '../useEventCleanup';

describe('useEventCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // addCleanup
  // ===========================================================================
  describe('addCleanup', () => {
    it('should add cleanup function', () => {
      const { addCleanup, getCleanupCount } = useEventCleanup();

      addCleanup(() => {});

      expect(getCleanupCount()).toBe(1);
    });

    it('should add multiple cleanup functions', () => {
      const { addCleanup, getCleanupCount } = useEventCleanup();

      addCleanup(() => {});
      addCleanup(() => {});
      addCleanup(() => {});

      expect(getCleanupCount()).toBe(3);
    });

    it('should ignore null cleanup functions', () => {
      const { addCleanup, getCleanupCount } = useEventCleanup();

      addCleanup(null);

      expect(getCleanupCount()).toBe(0);
    });

    it('should ignore undefined cleanup functions', () => {
      const { addCleanup, getCleanupCount } = useEventCleanup();

      addCleanup(undefined);

      expect(getCleanupCount()).toBe(0);
    });
  });

  // ===========================================================================
  // cleanup
  // ===========================================================================
  describe('cleanup', () => {
    it('should execute all cleanup functions', () => {
      const { addCleanup, cleanup } = useEventCleanup();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const fn3 = vi.fn();

      addCleanup(fn1);
      addCleanup(fn2);
      addCleanup(fn3);

      cleanup();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(fn3).toHaveBeenCalledTimes(1);
    });

    it('should clear cleanup functions after execution', () => {
      const { addCleanup, cleanup, getCleanupCount } = useEventCleanup();
      const fn = vi.fn();

      addCleanup(fn);
      cleanup();

      expect(getCleanupCount()).toBe(0);
    });

    it('should handle empty cleanup list', () => {
      const { cleanup } = useEventCleanup();

      // Should not throw
      expect(() => cleanup()).not.toThrow();
    });

    it('should continue executing after error in cleanup function', () => {
      const { addCleanup, cleanup } = useEventCleanup();
      const fn1 = vi.fn();
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('Cleanup error');
      });
      const fn2 = vi.fn();

      addCleanup(fn1);
      addCleanup(errorFn);
      addCleanup(fn2);

      // Should not throw
      cleanup();

      expect(fn1).toHaveBeenCalled();
      expect(errorFn).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();
    });

    it('should log errors during cleanup', () => {
      const { addCleanup, cleanup } = useEventCleanup();
      // Logger uses console.error internally, so we still spy on it
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('Cleanup error');
      });

      addCleanup(errorFn);
      cleanup();

      // Logger formats the message, so we check for the error content in the formatted output
      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0] as string;
      expect(callArg).toContain('error');
      expect(callArg).toContain('Error during cleanup');
      consoleSpy.mockRestore();
    });

    it('should only execute each cleanup once', () => {
      const { addCleanup, cleanup } = useEventCleanup();
      const fn = vi.fn();

      addCleanup(fn);
      cleanup();
      cleanup();

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // getCleanupCount
  // ===========================================================================
  describe('getCleanupCount', () => {
    it('should return 0 initially', () => {
      const { getCleanupCount } = useEventCleanup();

      expect(getCleanupCount()).toBe(0);
    });

    it('should return correct count after additions', () => {
      const { addCleanup, getCleanupCount } = useEventCleanup();

      addCleanup(() => {});
      expect(getCleanupCount()).toBe(1);

      addCleanup(() => {});
      expect(getCleanupCount()).toBe(2);
    });

    it('should return 0 after cleanup', () => {
      const { addCleanup, cleanup, getCleanupCount } = useEventCleanup();

      addCleanup(() => {});
      addCleanup(() => {});
      cleanup();

      expect(getCleanupCount()).toBe(0);
    });
  });

  // ===========================================================================
  // Isolation
  // ===========================================================================
  describe('instance isolation', () => {
    it('should have independent cleanup lists', () => {
      const instance1 = useEventCleanup();
      const instance2 = useEventCleanup();

      const fn1 = vi.fn();
      const fn2 = vi.fn();

      instance1.addCleanup(fn1);
      instance2.addCleanup(fn2);

      instance1.cleanup();

      expect(fn1).toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
      expect(instance1.getCleanupCount()).toBe(0);
      expect(instance2.getCleanupCount()).toBe(1);
    });
  });

  // ===========================================================================
  // Real-world Usage Patterns
  // ===========================================================================
  describe('real-world usage patterns', () => {
    it('should work with event listener cleanup pattern', () => {
      const { addCleanup, cleanup } = useEventCleanup();
      const removeEventListener = vi.fn();

      // Simulating the pattern: addCleanup(window.electron.config.onChange(handler))
      addCleanup(removeEventListener);

      cleanup();

      expect(removeEventListener).toHaveBeenCalled();
    });

    it('should work with MediaQueryList cleanup pattern', () => {
      const { addCleanup, cleanup } = useEventCleanup();
      const handler = vi.fn();
      const mediaQuery = {
        removeEventListener: vi.fn(),
      };

      // Simulating: addCleanup(() => mediaQuery.removeEventListener('change', handler))
      addCleanup(() => mediaQuery.removeEventListener('change', handler));

      cleanup();

      expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', handler);
    });

    it('should work with multiple mixed cleanups', () => {
      const { addCleanup, cleanup } = useEventCleanup();

      const unsubscribeConfig = vi.fn();
      const unsubscribeFiles = vi.fn();
      const mediaQueryRemove = vi.fn();
      const timerClear = vi.fn();

      addCleanup(unsubscribeConfig);
      addCleanup(unsubscribeFiles);
      addCleanup(() => mediaQueryRemove());
      addCleanup(() => timerClear());

      cleanup();

      expect(unsubscribeConfig).toHaveBeenCalled();
      expect(unsubscribeFiles).toHaveBeenCalled();
      expect(mediaQueryRemove).toHaveBeenCalled();
      expect(timerClear).toHaveBeenCalled();
    });
  });
});
