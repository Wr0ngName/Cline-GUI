/**
 * Comprehensive tests for ClaudeCodeService.
 *
 * Tests cover:
 * - Message sending with SDK integration
 * - Tool permission handling (canUseTool callback)
 * - Action approval and rejection flows
 * - Streaming message handling
 * - Abort functionality
 * - Authentication validation
 * - Error handling and recovery
 * - Slash commands caching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before vi.mock is called
const { mockQuery, mockSend, mockConfigService } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSend: vi.fn(),
  mockConfigService: {
    hasAuth: vi.fn(),
    getOAuthToken: vi.fn(),
    getApiKey: vi.fn(),
    getConfig: vi.fn(),
    getSelectedModel: vi.fn(),
  },
}));

// Mock the SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ipc-helpers
vi.mock('../../utils/ipc-helpers', () => ({
  createSender: vi.fn(() => mockSend),
}));

// Import after mocks
import { IPC_CHANNELS } from '../../../shared/types';
import { createMockBrowserWindow } from '../../__tests__/setup';
import ClaudeCodeService from '../ClaudeCodeService';

describe('ClaudeCodeService', () => {
  let service: ClaudeCodeService;
  let mockWindow: ReturnType<typeof createMockBrowserWindow>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWindow = createMockBrowserWindow();
    const getMainWindow = vi.fn().mockReturnValue(mockWindow);

    // Default mock implementations
    mockConfigService.hasAuth.mockResolvedValue(true);
    mockConfigService.getOAuthToken.mockResolvedValue('sk-ant-oat01-test-token-that-is-long-enough-to-pass-validation-check');
    mockConfigService.getApiKey.mockResolvedValue('');
    mockConfigService.getConfig.mockResolvedValue({ autoApproveReads: false });
    mockConfigService.getSelectedModel.mockResolvedValue('');

    service = new ClaudeCodeService(mockConfigService as any, getMainWindow);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Constructor and Initialization
  // ===========================================================================
  describe('constructor', () => {
    it('should initialize with config service and window getter', () => {
      expect(service).toBeDefined();
    });

    it('should create sender using provided window getter', async () => {
      const { createSender } = vi.mocked(await import('../../utils/ipc-helpers'));
      expect(createSender).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // hasAuth
  // ===========================================================================
  describe('hasAuth', () => {
    it('should delegate to config service', async () => {
      mockConfigService.hasAuth.mockResolvedValue(true);

      const result = await service.hasAuth();

      expect(result).toBe(true);
      expect(mockConfigService.hasAuth).toHaveBeenCalled();
    });

    it('should return false when not authenticated', async () => {
      mockConfigService.hasAuth.mockResolvedValue(false);

      const result = await service.hasAuth();

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // sendMessage - Authentication
  // ===========================================================================
  describe('sendMessage - authentication', () => {
    it('should emit error when not authenticated', async () => {
      mockConfigService.hasAuth.mockResolvedValue(false);

      await service.sendMessage('Hello', '/home/user/project');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.stringContaining('Not authenticated')
      );
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should validate OAuth token format', async () => {
      mockConfigService.getOAuthToken.mockResolvedValue('short');

      await service.sendMessage('Hello', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.stringContaining('Invalid OAuth token')
      );
    });

    it('should validate OAuth token prefix', async () => {
      // Valid length but wrong prefix - should log warning but proceed
      mockConfigService.getOAuthToken.mockResolvedValue('invalid-token-that-is-definitely-long-enough-to-pass-the-length-validation-check');

      // This should proceed (with warning) since length is valid
      const mockIterator = createMockQueryIterator([]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hello', '/home/user');

      // Should have called query (proceeds despite wrong prefix)
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should validate API key format', async () => {
      mockConfigService.getOAuthToken.mockResolvedValue('');
      mockConfigService.getApiKey.mockResolvedValue('invalid-key');

      await service.sendMessage('Hello', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.stringContaining('Invalid API key')
      );
    });

    it('should accept valid API key', async () => {
      mockConfigService.getOAuthToken.mockResolvedValue('');
      mockConfigService.getApiKey.mockResolvedValue('sk-ant-api03-test-key-that-is-long-enough-to-pass');

      const mockIterator = createMockQueryIterator([]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hello', '/home/user');

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // sendMessage - SDK Integration
  // ===========================================================================
  describe('sendMessage - SDK integration', () => {
    beforeEach(() => {
      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );
    });

    it('should call SDK query with correct parameters', async () => {
      const mockIterator = createMockQueryIterator([]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hello Claude', '/home/user/project');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Hello Claude',
          options: expect.objectContaining({
            cwd: '/home/user/project',
            abortController: expect.any(AbortController),
            canUseTool: expect.any(Function),
            includePartialMessages: true,
          }),
        })
      );
    });

    it('should emit CLAUDE_DONE on successful completion', async () => {
      const mockIterator = createMockQueryIterator([
        { type: 'result', subtype: 'success', num_turns: 1, duration_ms: 1000 },
      ]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hello', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(IPC_CHANNELS.CLAUDE_DONE);
    });

    it('should handle SDK throwing an error', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('SDK initialization failed');
      });

      await service.sendMessage('Hello', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.any(String)
      );
    });

    it('should handle iterator throwing during iteration', async () => {
      const mockIterator = createThrowingIterator(new Error('Stream error'));
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hello', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.any(String)
      );
    });
  });

  // ===========================================================================
  // Streaming Messages
  // ===========================================================================
  describe('streaming messages', () => {
    beforeEach(() => {
      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );
    });

    it('should emit chunks for stream events', async () => {
      const mockIterator = createMockQueryIterator([
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } },
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'World' } },
        },
        { type: 'result', subtype: 'success' },
      ]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hi', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(IPC_CHANNELS.CLAUDE_CHUNK, 'Hello ');
      expect(mockSend).toHaveBeenCalledWith(IPC_CHANNELS.CLAUDE_CHUNK, 'World');
    });

    it('should handle system messages', async () => {
      const mockIterator = createMockQueryIterator([
        { type: 'system', subtype: 'status', status: 'Compacting context...' },
        { type: 'result', subtype: 'success' },
      ]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hi', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_CHUNK,
        expect.stringContaining('Compacting context')
      );
    });

    it('should handle init message with slash commands', async () => {
      // Clear the initial emit from constructor
      mockSend.mockClear();

      const mockIterator = createMockQueryIterator([
        {
          type: 'system',
          subtype: 'init',
          slash_commands: ['custom-skill', 'another-skill'],
          model: 'claude-3-opus',
        },
        { type: 'result', subtype: 'success' },
      ]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hi', '/home/user');

      // Should emit merged commands (built-in + SDK skills)
      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_SLASH_COMMANDS,
        expect.arrayContaining([
          // Built-in commands
          expect.objectContaining({ name: 'help' }),
          expect.objectContaining({ name: 'clear' }),
          expect.objectContaining({ name: 'compact' }),
          // SDK skills from init
          expect.objectContaining({ name: 'custom-skill' }),
          expect.objectContaining({ name: 'another-skill' }),
        ])
      );
    });
  });

  // ===========================================================================
  // Tool Permission Handling
  // ===========================================================================
  describe('tool permission handling', () => {
    let capturedCanUseTool: (...args: unknown[]) => unknown;

    beforeEach(() => {
      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );
      mockConfigService.getConfig.mockResolvedValue({ autoApproveReads: false });

      mockQuery.mockImplementation(({ options }) => {
        capturedCanUseTool = options.canUseTool;
        return createMockQueryIterator([{ type: 'result', subtype: 'success' }]);
      });
    });

    it('should emit tool use event for permission request', async () => {
      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      // Trigger permission request (don't await - it waits for response)
      const permissionPromise = capturedCanUseTool(
        'Bash',
        { command: 'ls -la', cwd: '/home/user' },
        { signal: mockAbortController.signal, suggestions: [] }
      );

      // Let the async callback progress past its first await (getConfig)
      await Promise.resolve();

      // Should emit tool use event
      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_TOOL_USE,
        expect.objectContaining({
          toolName: 'Bash',
          type: 'bash-command',
        })
      );

      // Clean up by approving
      const action = mockSend.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      )?.[1];
      if (action) {
        service.handleActionResponse({ actionId: action.id, approved: true });
      }
      await permissionPromise;
    });

    it('should auto-approve read operations when configured', async () => {
      mockConfigService.getConfig.mockResolvedValue({ autoApproveReads: true });

      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      const result = await capturedCanUseTool(
        'Read',
        { file_path: '/home/user/test.txt' },
        { signal: mockAbortController.signal, suggestions: [] }
      ) as { behavior: string };

      expect(result.behavior).toBe('allow');
      // Should NOT emit tool use event for auto-approved
      const toolUseCalls = mockSend.mock.calls.filter(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      );
      expect(toolUseCalls).toHaveLength(0);
    });

    it('should deny when operation is aborted', async () => {
      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: true, addEventListener: vi.fn() } };

      const result = await capturedCanUseTool(
        'Bash',
        { command: 'ls' },
        { signal: mockAbortController.signal, suggestions: [] }
      ) as { behavior: string; interrupt: boolean };

      expect(result.behavior).toBe('deny');
      expect(result.interrupt).toBe(true);
    });

    it('should generate unique action IDs', async () => {
      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      // Request multiple permissions
      const promise1 = capturedCanUseTool('Bash', { command: 'ls' }, { signal: mockAbortController.signal, suggestions: [] });
      await Promise.resolve(); // Let first callback progress
      const promise2 = capturedCanUseTool('Bash', { command: 'pwd' }, { signal: mockAbortController.signal, suggestions: [] });
      await Promise.resolve(); // Let second callback progress

      const toolUseCalls = mockSend.mock.calls.filter(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      );

      expect(toolUseCalls.length).toBe(2);
      expect(toolUseCalls[0][1].id).not.toBe(toolUseCalls[1][1].id);

      // Clean up by approving both
      service.handleActionResponse({ actionId: toolUseCalls[0][1].id, approved: true });
      service.handleActionResponse({ actionId: toolUseCalls[1][1].id, approved: true });
      await Promise.all([promise1, promise2]);
    });

    it('should create correct action for Edit tool', async () => {
      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      const promise = capturedCanUseTool(
        'Edit',
        { file_path: '/test.txt', old_string: 'foo', new_string: 'bar' },
        { signal: mockAbortController.signal, suggestions: [] }
      );
      await Promise.resolve(); // Let callback progress past first await

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_TOOL_USE,
        expect.objectContaining({
          type: 'file-edit',
          toolName: 'Edit',
          description: expect.stringContaining('/test.txt'),
        })
      );

      // Clean up
      const action = mockSend.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      )?.[1];
      if (action) {
        service.handleActionResponse({ actionId: action.id, approved: true });
      }
      await promise;
    });

    it('should create correct action for Write tool', async () => {
      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      const promise = capturedCanUseTool(
        'Write',
        { file_path: '/new-file.txt', content: 'hello' },
        { signal: mockAbortController.signal, suggestions: [] }
      );
      await Promise.resolve(); // Let callback progress past first await

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_TOOL_USE,
        expect.objectContaining({
          type: 'file-create',
          toolName: 'Write',
        })
      );

      // Clean up
      const action = mockSend.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      )?.[1];
      if (action) {
        service.handleActionResponse({ actionId: action.id, approved: true });
      }
      await promise;
    });
  });

  // ===========================================================================
  // Action Response Handling
  // ===========================================================================
  describe('handleActionResponse', () => {
    let capturedCanUseTool: (...args: unknown[]) => unknown;
    let permissionPromise: ReturnType<typeof capturedCanUseTool>;

    beforeEach(async () => {
      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );

      mockQuery.mockImplementation(({ options }) => {
        capturedCanUseTool = options.canUseTool;
        return createMockQueryIterator([{ type: 'result', subtype: 'success' }]);
      });

      await service.sendMessage('Hi', '/home/user');

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      permissionPromise = capturedCanUseTool(
        'Bash',
        { command: 'rm -rf /important' },
        { signal: mockAbortController.signal, suggestions: [] }
      );
    });

    it('should approve action when approved is true', async () => {
      const action = mockSend.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      )?.[1];

      service.handleActionResponse({
        actionId: action.id,
        approved: true,
      });

      const result = await permissionPromise as { behavior: string };
      expect(result.behavior).toBe('allow');
    });

    it('should deny action when approved is false', async () => {
      const action = mockSend.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      )?.[1];

      service.handleActionResponse({
        actionId: action.id,
        approved: false,
        denyMessage: 'Too dangerous',
      });

      const result = await permissionPromise as { behavior: string; message: string };
      expect(result.behavior).toBe('deny');
      expect(result.message).toBe('Too dangerous');
    });

    it('should include updated input when provided', async () => {
      const action = mockSend.mock.calls.find(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_TOOL_USE
      )?.[1];

      service.handleActionResponse({
        actionId: action.id,
        approved: true,
        updatedInput: { command: 'ls -la' }, // Modified command
      });

      const result = await permissionPromise as { updatedInput: Record<string, unknown> };
      expect(result.updatedInput).toEqual({ command: 'ls -la' });
    });

    it('should handle unknown action ID gracefully', () => {
      // Should not throw
      expect(() => {
        service.handleActionResponse({
          actionId: 'unknown-action-id',
          approved: true,
        });
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // Abort Functionality
  // ===========================================================================
  describe('abort', () => {
    it('should abort the current query', async () => {
      const mockInterrupt = vi.fn();
      let iteratorStarted = false;
      let resolveIterator: (() => void) | undefined;

      // Create an iterator that hangs until interrupted
      const hangingIterator = {
        // eslint-disable-next-line require-yield
        [Symbol.asyncIterator]: async function* () {
          iteratorStarted = true;
          // Wait indefinitely until the iterator is "released"
          await new Promise<void>((resolve) => {
            resolveIterator = resolve;
          });
        },
        interrupt: mockInterrupt.mockImplementation(() => {
          // When interrupted, release the iterator
          resolveIterator?.();
        }),
        supportedCommands: vi.fn().mockResolvedValue([]),
      };
      mockQuery.mockReturnValue(hangingIterator);

      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );

      // Start a message (don't await - it will hang)
      const messagePromise = service.sendMessage('Hello', '/home/user');

      // Wait for the iterator to actually start (sendMessage has several awaits before query())
      while (!iteratorStarted) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      // Abort
      await service.abort();

      // Now the message should complete
      await messagePromise;

      expect(mockInterrupt).toHaveBeenCalled();
    });

    it('should clear pending permissions on abort', async () => {
      let capturedCanUseTool: ((...args: unknown[]) => unknown) | undefined;
      let resolveIterator: (() => void) | undefined;

      // Create an iterator that hangs until the permission request triggers it
      mockQuery.mockImplementation(({ options }) => {
        capturedCanUseTool = options.canUseTool;
        return {
          [Symbol.asyncIterator]: async function* () {
            // Wait until test signals to continue
            await new Promise<void>((resolve) => {
              resolveIterator = resolve;
            });
            yield { type: 'result', subtype: 'success' };
          },
          interrupt: vi.fn().mockImplementation(() => {
            resolveIterator?.();
          }),
          supportedCommands: vi.fn().mockResolvedValue([]),
        };
      });

      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );

      // Start message (will hang in iterator)
      const messagePromise = service.sendMessage('Hi', '/home/user');

      // Wait for query() to be called and canUseTool to be captured
      while (!capturedCanUseTool) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      const mockAbortController = { signal: { aborted: false, addEventListener: vi.fn() } };

      // Create a pending permission
      const permissionPromise = capturedCanUseTool(
        'Bash',
        { command: 'ls' },
        { signal: mockAbortController.signal, suggestions: [] }
      );
      await new Promise((resolve) => setImmediate(resolve)); // Let callback progress

      // Abort should clear pending permissions and release the iterator
      await service.abort();

      const result = await permissionPromise as { behavior: string; interrupt: boolean };
      expect(result.behavior).toBe('deny');
      expect(result.interrupt).toBe(true);

      // Clean up
      await messagePromise;
    });

    it('should not throw when no active query', async () => {
      await expect(service.abort()).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('error handling', () => {
    beforeEach(() => {
      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );
    });

    it('should convert 401 error to user-friendly message', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('API returned 401 unauthorized');
      });

      await service.sendMessage('Hi', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.stringContaining('Authentication failed')
      );
    });

    it('should convert 429 error to rate limit message', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('429 Too Many Requests');
      });

      await service.sendMessage('Hi', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.stringContaining('Rate limit')
      );
    });

    it('should convert network error to user-friendly message', async () => {
      mockQuery.mockImplementation(() => {
        throw new Error('ECONNREFUSED');
      });

      await service.sendMessage('Hi', '/home/user');

      expect(mockSend).toHaveBeenCalledWith(
        IPC_CHANNELS.CLAUDE_ERROR,
        expect.stringContaining('Network error')
      );
    });

    it('should handle AbortError silently', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockQuery.mockImplementation(() => {
        throw abortError;
      });

      await service.sendMessage('Hi', '/home/user');

      // Should NOT emit error for abort
      const errorCalls = mockSend.mock.calls.filter(
        (call) => call[0] === IPC_CHANNELS.CLAUDE_ERROR
      );
      expect(errorCalls).toHaveLength(0);
    });

    it('should handle process exit error after successful query', async () => {
      // Iterator completes successfully
      mockQuery.mockImplementation(() => ({
        [Symbol.asyncIterator]: async function* () {
          yield { type: 'result', subtype: 'success', num_turns: 1 };
        },
        interrupt: vi.fn(),
      }));

      await service.sendMessage('Hi', '/home/user');

      // Should have emitted done, not error
      expect(mockSend).toHaveBeenCalledWith(IPC_CHANNELS.CLAUDE_DONE);
    });
  });

  // ===========================================================================
  // Slash Commands
  // ===========================================================================
  describe('getSlashCommands', () => {
    it('should return cached slash commands', () => {
      const commands = service.getSlashCommands();
      expect(Array.isArray(commands)).toBe(true);
    });

    it('should return merged built-in and SDK commands after init message', async () => {
      mockConfigService.getOAuthToken.mockResolvedValue(
        'sk-ant-oat01-valid-token-that-is-long-enough-to-pass-validation-requirements'
      );

      const mockIterator = createMockQueryIterator([
        {
          type: 'system',
          subtype: 'init',
          slash_commands: ['custom-skill', 'another-skill'],
        },
        { type: 'result', subtype: 'success' },
      ]);
      mockQuery.mockReturnValue(mockIterator);

      await service.sendMessage('Hi', '/home/user');

      const commands = service.getSlashCommands();
      // Should have built-in commands + SDK commands merged
      expect(commands.length).toBeGreaterThan(2);
      // Built-in commands should be present with descriptions
      expect(commands.find(c => c.name === 'help')).toBeDefined();
      expect(commands.find(c => c.name === 'clear')).toBeDefined();
      // SDK commands should also be present
      expect(commands.find(c => c.name === 'custom-skill')).toBeDefined();
    });
  });
});

// ===========================================================================
// Helper Functions
// ===========================================================================

/**
 * Create a mock async iterator for SDK query results
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockQueryIterator(messages: any[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const msg of messages) {
        yield msg;
      }
    },
    interrupt: vi.fn(),
    supportedCommands: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Create an iterator that throws an error
 */
function createThrowingIterator(error: Error) {
  return {
    // eslint-disable-next-line require-yield
    [Symbol.asyncIterator]: async function* () {
      throw error;
    },
    interrupt: vi.fn(),
    supportedCommands: vi.fn().mockResolvedValue([]),
  };
}
