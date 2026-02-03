/**
 * Comprehensive tests for Claude IPC handlers.
 *
 * Tests cover:
 * - CLAUDE_SEND handler validation and error handling
 * - CLAUDE_APPROVE handler with parameter validation
 * - CLAUDE_REJECT handler
 * - CLAUDE_ABORT handler
 * - CLAUDE_ACTION_RESPONSE handler
 * - CLAUDE_GET_COMMANDS handler
 * - Input validation for all handlers
 * - Error propagation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before vi.mock is called
const { mockIpcMainHandle, mockIpcMain } = vi.hoisted(() => {
  const mockIpcMainHandle = vi.fn();
  return {
    mockIpcMainHandle,
    mockIpcMain: {
      handle: mockIpcMainHandle,
      on: vi.fn(),
      removeHandler: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockClaudeService = {
  sendMessage: vi.fn(),
  approveAction: vi.fn(),
  rejectAction: vi.fn(),
  abort: vi.fn(),
  handleActionResponse: vi.fn(),
  getSlashCommands: vi.fn(),
};

// Import after mocks
import { IPC_CHANNELS } from '../../../shared/types';
import { IpcError, AppError } from '../../errors';
import { setupClaudeIPC } from '../claude';

describe('Claude IPC handlers', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();

    // Capture registered handlers
    mockIpcMainHandle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    });

    // Default mock implementations
    mockClaudeService.sendMessage.mockResolvedValue(undefined);
    mockClaudeService.approveAction.mockResolvedValue(undefined);
    mockClaudeService.rejectAction.mockResolvedValue(undefined);
    mockClaudeService.abort.mockResolvedValue(undefined);
    mockClaudeService.handleActionResponse.mockReturnValue(undefined);
    mockClaudeService.getSlashCommands.mockReturnValue([]);

    // Register handlers
    setupClaudeIPC(mockClaudeService as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Handler Registration
  // ===========================================================================
  describe('handler registration', () => {
    it('should register all Claude handlers', () => {
      expect(handlers.has(IPC_CHANNELS.CLAUDE_SEND)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.CLAUDE_APPROVE)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.CLAUDE_REJECT)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.CLAUDE_ABORT)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.CLAUDE_ACTION_RESPONSE)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.CLAUDE_GET_COMMANDS)).toBe(true);
    });
  });

  // ===========================================================================
  // CLAUDE_SEND
  // ===========================================================================
  describe('CLAUDE_SEND handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.CLAUDE_SEND)!;
    });

    it('should call sendMessage with correct parameters', async () => {
      await handler({}, 'Hello Claude', '/home/user/project');

      expect(mockClaudeService.sendMessage).toHaveBeenCalledWith(
        'Hello Claude',
        '/home/user/project'
      );
    });

    it('should throw when message is not a string', async () => {
      await expect(handler({}, 123, '/home/user')).rejects.toThrow(IpcError);
    });

    it('should throw when message is empty', async () => {
      await expect(handler({}, '', '/home/user')).rejects.toThrow(IpcError);
    });

    it('should throw when message is only whitespace', async () => {
      await expect(handler({}, '   ', '/home/user')).rejects.toThrow(IpcError);
    });

    it('should throw when workingDir is not a string', async () => {
      await expect(handler({}, 'Hello', null)).rejects.toThrow(IpcError);
    });

    it('should throw when workingDir is empty', async () => {
      await expect(handler({}, 'Hello', '')).rejects.toThrow(IpcError);
    });

    it('should throw when service is not initialized', async () => {
      handlers.clear();
      setupClaudeIPC(null as any);
      const nullHandler = handlers.get(IPC_CHANNELS.CLAUDE_SEND)!;

      await expect(nullHandler({}, 'Hello', '/home')).rejects.toThrow(IpcError);
    });

    it('should propagate service errors', async () => {
      mockClaudeService.sendMessage.mockRejectedValue(new Error('SDK error'));

      await expect(handler({}, 'Hello', '/home/user')).rejects.toThrow(IpcError);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'x'.repeat(10000);
      await handler({}, longMessage, '/home/user');

      expect(mockClaudeService.sendMessage).toHaveBeenCalledWith(longMessage, '/home/user');
    });

    it('should handle special characters in message', async () => {
      const specialMessage = 'Hello\n\t"quotes" <tags> & symbols™';
      await handler({}, specialMessage, '/home/user');

      expect(mockClaudeService.sendMessage).toHaveBeenCalledWith(specialMessage, '/home/user');
    });
  });

  // ===========================================================================
  // CLAUDE_APPROVE
  // ===========================================================================
  describe('CLAUDE_APPROVE handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.CLAUDE_APPROVE)!;
    });

    it('should call approveAction with actionId only', async () => {
      await handler({}, 'action_123');

      expect(mockClaudeService.approveAction).toHaveBeenCalledWith(
        'action_123',
        undefined,
        undefined
      );
    });

    it('should call approveAction with updatedInput', async () => {
      const updatedInput = { command: 'ls -la' };
      await handler({}, 'action_123', updatedInput);

      expect(mockClaudeService.approveAction).toHaveBeenCalledWith(
        'action_123',
        updatedInput,
        undefined
      );
    });

    it('should call approveAction with alwaysAllow', async () => {
      await handler({}, 'action_123', undefined, true);

      expect(mockClaudeService.approveAction).toHaveBeenCalledWith(
        'action_123',
        undefined,
        true
      );
    });

    it('should call approveAction with all parameters', async () => {
      const updatedInput = { file_path: '/new/path' };
      await handler({}, 'action_123', updatedInput, true);

      expect(mockClaudeService.approveAction).toHaveBeenCalledWith(
        'action_123',
        updatedInput,
        true
      );
    });

    it('should throw when actionId is not a string', async () => {
      await expect(handler({}, 123)).rejects.toThrow(IpcError);
    });

    it('should throw when actionId is empty', async () => {
      await expect(handler({}, '')).rejects.toThrow(IpcError);
    });

    it('should throw when updatedInput is not an object', async () => {
      await expect(handler({}, 'action_123', 'not-an-object')).rejects.toThrow(IpcError);
    });

    it('should throw when alwaysAllow is not a boolean', async () => {
      await expect(handler({}, 'action_123', undefined, 'true')).rejects.toThrow(IpcError);
    });

    it('should allow null updatedInput', async () => {
      // undefined is allowed, but explicit null might be passed
      await handler({}, 'action_123', undefined, false);

      expect(mockClaudeService.approveAction).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // CLAUDE_REJECT
  // ===========================================================================
  describe('CLAUDE_REJECT handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.CLAUDE_REJECT)!;
    });

    it('should call rejectAction with actionId only', async () => {
      await handler({}, 'action_456');

      expect(mockClaudeService.rejectAction).toHaveBeenCalledWith('action_456', undefined);
    });

    it('should call rejectAction with message', async () => {
      await handler({}, 'action_456', 'Too dangerous');

      expect(mockClaudeService.rejectAction).toHaveBeenCalledWith('action_456', 'Too dangerous');
    });

    it('should throw when actionId is not a string', async () => {
      await expect(handler({}, null)).rejects.toThrow(IpcError);
    });

    it('should throw when actionId is empty', async () => {
      await expect(handler({}, '')).rejects.toThrow(IpcError);
    });

    it('should throw when message is not a string (if provided)', async () => {
      // ValidationError is caught and wrapped in IpcError by the handler
      await expect(handler({}, 'action_456', 123)).rejects.toThrow(IpcError);
    });

    it('should allow empty message string', async () => {
      await handler({}, 'action_456', '');

      expect(mockClaudeService.rejectAction).toHaveBeenCalledWith('action_456', '');
    });
  });

  // ===========================================================================
  // CLAUDE_ACTION_RESPONSE
  // ===========================================================================
  describe('CLAUDE_ACTION_RESPONSE handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.CLAUDE_ACTION_RESPONSE)!;
    });

    it('should call handleActionResponse with valid response', async () => {
      const response = {
        actionId: 'action_789',
        approved: true,
      };
      await handler({}, response);

      expect(mockClaudeService.handleActionResponse).toHaveBeenCalledWith(response);
    });

    it('should handle rejection response', async () => {
      const response = {
        actionId: 'action_789',
        approved: false,
        denyMessage: 'Not allowed',
      };
      await handler({}, response);

      expect(mockClaudeService.handleActionResponse).toHaveBeenCalledWith(response);
    });

    it('should handle response with updatedInput', async () => {
      const response = {
        actionId: 'action_789',
        approved: true,
        updatedInput: { command: 'safer command' },
      };
      await handler({}, response);

      expect(mockClaudeService.handleActionResponse).toHaveBeenCalledWith(response);
    });

    it('should throw when response is not an object', async () => {
      await expect(handler({}, 'not-an-object')).rejects.toThrow(IpcError);
    });

    it('should throw when response is null', async () => {
      await expect(handler({}, null)).rejects.toThrow(IpcError);
    });

    it('should throw when actionId is missing', async () => {
      // ValidationError is caught and wrapped in IpcError by the handler
      await expect(handler({}, { approved: true })).rejects.toThrow(IpcError);
    });

    it('should throw when actionId is empty', async () => {
      // ValidationError is caught and wrapped in IpcError by the handler
      await expect(handler({}, { actionId: '', approved: true })).rejects.toThrow(IpcError);
    });

    it('should throw when actionId is not a string', async () => {
      // ValidationError is caught and wrapped in IpcError by the handler
      await expect(handler({}, { actionId: 123, approved: true })).rejects.toThrow(IpcError);
    });

    it('should throw when approved is missing', async () => {
      // ValidationError is caught and wrapped in IpcError by the handler
      await expect(handler({}, { actionId: 'action_789' })).rejects.toThrow(IpcError);
    });

    it('should throw when approved is not a boolean', async () => {
      // ValidationError is caught and wrapped in IpcError by the handler
      await expect(handler({}, { actionId: 'action_789', approved: 'yes' })).rejects.toThrow(IpcError);
    });
  });

  // ===========================================================================
  // CLAUDE_ABORT
  // ===========================================================================
  describe('CLAUDE_ABORT handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.CLAUDE_ABORT)!;
    });

    it('should call abort', async () => {
      await handler({});

      expect(mockClaudeService.abort).toHaveBeenCalled();
    });

    it('should throw when service is not initialized', async () => {
      handlers.clear();
      setupClaudeIPC(null as any);
      const nullHandler = handlers.get(IPC_CHANNELS.CLAUDE_ABORT)!;

      // IpcError is caught and wrapped in AppError by the handler's catch block
      await expect(nullHandler({})).rejects.toThrow(AppError);
    });

    it('should propagate abort errors', async () => {
      mockClaudeService.abort.mockRejectedValue(new Error('Abort failed'));

      await expect(handler({})).rejects.toThrow();
    });
  });

  // ===========================================================================
  // CLAUDE_GET_COMMANDS
  // ===========================================================================
  describe('CLAUDE_GET_COMMANDS handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.CLAUDE_GET_COMMANDS)!;
    });

    it('should return slash commands', async () => {
      const commands = [
        { name: '/help', description: 'Get help', argumentHint: '' },
        { name: '/clear', description: 'Clear history', argumentHint: '' },
      ];
      mockClaudeService.getSlashCommands.mockReturnValue(commands);

      const result = await handler({});

      expect(result).toEqual(commands);
    });

    it('should return empty array when no commands', async () => {
      mockClaudeService.getSlashCommands.mockReturnValue([]);

      const result = await handler({});

      expect(result).toEqual([]);
    });

    it('should throw when service is not initialized', async () => {
      handlers.clear();
      setupClaudeIPC(null as any);
      const nullHandler = handlers.get(IPC_CHANNELS.CLAUDE_GET_COMMANDS)!;

      await expect(nullHandler({})).rejects.toThrow(IpcError);
    });
  });

  // ===========================================================================
  // Error Message Formatting
  // ===========================================================================
  describe('error handling', () => {
    it('should include original error message in IpcError', async () => {
      const handler = handlers.get(IPC_CHANNELS.CLAUDE_SEND)!;
      mockClaudeService.sendMessage.mockRejectedValue(new Error('Network timeout'));

      try {
        await handler({}, 'Hello', '/home/user');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(IpcError);
        expect((error as IpcError).message).toContain('Network timeout');
      }
    });

    it('should include channel name in IpcError', async () => {
      const handler = handlers.get(IPC_CHANNELS.CLAUDE_SEND)!;

      try {
        await handler({}, null, '/home');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(IpcError);
        expect((error as IpcError).channel).toBe(IPC_CHANNELS.CLAUDE_SEND);
      }
    });
  });
});
