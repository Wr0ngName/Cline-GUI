/**
 * Tests for useAsyncOperation composable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useAsyncOperation } from '../useAsyncOperation';

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('useAsyncOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with isLoading false by default', () => {
      const { isLoading } = useAsyncOperation();
      expect(isLoading.value).toBe(false);
    });

    it('should initialize with custom isLoading state', () => {
      const { isLoading } = useAsyncOperation(true);
      expect(isLoading.value).toBe(true);
    });

    it('should initialize with null error', () => {
      const { error } = useAsyncOperation();
      expect(error.value).toBeNull();
    });
  });

  describe('execute', () => {
    it('should set isLoading to true during operation', async () => {
      const { isLoading, execute } = useAsyncOperation();
      let loadingDuringOp = false;

      await execute(async () => {
        loadingDuringOp = isLoading.value;
        return 'result';
      });

      expect(loadingDuringOp).toBe(true);
    });

    it('should set isLoading to false after successful operation', async () => {
      const { isLoading, execute } = useAsyncOperation();

      await execute(async () => 'result');

      expect(isLoading.value).toBe(false);
    });

    it('should set isLoading to false after failed operation', async () => {
      const { isLoading, execute } = useAsyncOperation();

      await execute(async () => {
        throw new Error('Test error');
      });

      expect(isLoading.value).toBe(false);
    });

    it('should return the operation result on success', async () => {
      const { execute } = useAsyncOperation();

      const result = await execute(async () => 'test-result');

      expect(result).toBe('test-result');
    });

    it('should return undefined on failure', async () => {
      const { execute } = useAsyncOperation();

      const result = await execute(async () => {
        throw new Error('Test error');
      });

      expect(result).toBeUndefined();
    });

    it('should clear error before executing', async () => {
      const { error, execute } = useAsyncOperation();

      // First, create an error
      await execute(async () => {
        throw new Error('First error');
      });
      expect(error.value).not.toBeNull();

      // Then execute successfully - error should be cleared
      let errorDuringOp: string | null = 'not-cleared';
      await execute(async () => {
        errorDuringOp = error.value;
        return 'success';
      });

      expect(errorDuringOp).toBeNull();
    });

    it('should set error message with custom prefix', async () => {
      const { error, execute } = useAsyncOperation();

      await execute(async () => {
        throw new Error('specific issue');
      }, 'Failed to load data');

      expect(error.value).toBe('Failed to load data: specific issue');
    });

    it('should use default error message when not provided', async () => {
      const { error, execute } = useAsyncOperation();

      await execute(async () => {
        throw new Error('test error');
      });

      expect(error.value).toBe('Operation failed: test error');
    });

    it('should handle non-Error thrown values', async () => {
      const { error, execute } = useAsyncOperation();

      await execute(async () => {
        throw 'string error';
      });

      expect(error.value).toBe('Operation failed: string error');
    });

    it('should log errors', async () => {
      const { logger } = await import('../../utils/logger');
      const { execute } = useAsyncOperation();
      const testError = new Error('test error');

      await execute(async () => {
        throw testError;
      }, 'Custom message');

      expect(logger.error).toHaveBeenCalledWith('Custom message', { error: testError });
    });
  });

  describe('clearError', () => {
    it('should clear the error state', async () => {
      const { error, execute, clearError } = useAsyncOperation();

      await execute(async () => {
        throw new Error('test');
      });
      expect(error.value).not.toBeNull();

      clearError();
      expect(error.value).toBeNull();
    });

    it('should be safe to call when no error exists', () => {
      const { error, clearError } = useAsyncOperation();

      expect(error.value).toBeNull();
      clearError();
      expect(error.value).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset both loading and error states', async () => {
      const { isLoading, error, execute, reset } = useAsyncOperation(true);

      await execute(async () => {
        throw new Error('test');
      });

      expect(error.value).not.toBeNull();

      reset();

      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();
    });
  });

  describe('concurrent operations', () => {
    it('should handle sequential operations correctly', async () => {
      const { isLoading, error, execute } = useAsyncOperation();

      // First operation succeeds
      await execute(async () => 'first');
      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();

      // Second operation fails
      await execute(async () => {
        throw new Error('second failed');
      });
      expect(isLoading.value).toBe(false);
      expect(error.value).toContain('second failed');

      // Third operation succeeds and clears error
      await execute(async () => 'third');
      expect(isLoading.value).toBe(false);
      expect(error.value).toBeNull();
    });
  });
});
