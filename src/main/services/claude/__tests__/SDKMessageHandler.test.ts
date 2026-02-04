/**
 * Tests for SDKMessageHandler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SlashCommandInfo } from '../../../../shared/types';
// Mock the logger to avoid Electron app dependency
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
import { SDKMessageHandler, MessageHandlerCallbacks } from '../SDKMessageHandler';

describe('SDKMessageHandler', () => {
  let callbacks: MessageHandlerCallbacks;
  let handler: SDKMessageHandler;

  beforeEach(() => {
    callbacks = {
      onChunk: vi.fn(),
      onSlashCommands: vi.fn(),
    };
    handler = new SDKMessageHandler(callbacks);
  });

  describe('reset', () => {
    it('should reset querySucceeded flag', () => {
      // Simulate query success
      handler.handleMessage({
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        duration_ms: 100,
      } as never);

      expect(handler.didQuerySucceed()).toBe(true);

      handler.reset();
      expect(handler.didQuerySucceed()).toBe(false);
    });

    it('should reset slash command tracking flag', () => {
      handler.markSlashCommandSent();
      handler.reset();
      // Flag should be reset - verify by checking behavior
      // When slash command flag is reset, assistant messages won't be emitted
      handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'test' }] },
      } as never);
      expect(callbacks.onChunk).not.toHaveBeenCalled();
    });
  });

  describe('markSlashCommandSent', () => {
    it('should mark that a slash command was sent', () => {
      handler.markSlashCommandSent();

      // When slash command is marked, assistant messages should be emitted
      handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Help output' }] },
      } as never);

      expect(callbacks.onChunk).toHaveBeenCalledWith('Help output');
    });

    it('should reset flag after processing assistant message', () => {
      handler.markSlashCommandSent();

      // First assistant message - emitted
      handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'First' }] },
      } as never);

      // Clear the mock
      vi.clearAllMocks();

      // Second assistant message - not emitted (flag was reset)
      handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Second' }] },
      } as never);

      expect(callbacks.onChunk).not.toHaveBeenCalled();
    });
  });

  describe('updateSlashCommands', () => {
    it('should update cached slash commands', () => {
      const commands: SlashCommandInfo[] = [
        { name: 'help', description: 'Show help', argumentHint: '' },
        { name: 'cost', description: 'Show costs', argumentHint: '' },
      ];

      handler.updateSlashCommands(commands);

      expect(handler.getSlashCommands()).toEqual(commands);
    });

    it('should replace existing commands', () => {
      const initialCommands: SlashCommandInfo[] = [
        { name: 'help', description: '', argumentHint: '' },
      ];

      const updatedCommands: SlashCommandInfo[] = [
        { name: 'help', description: 'Show help text', argumentHint: '[command]' },
        { name: 'cost', description: 'Show cost info', argumentHint: '' },
      ];

      handler.updateSlashCommands(initialCommands);
      handler.updateSlashCommands(updatedCommands);

      expect(handler.getSlashCommands()).toEqual(updatedCommands);
    });
  });

  describe('handleMessage - assistant type', () => {
    it('should not emit regular assistant messages', async () => {
      await handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Regular message' }] },
      } as never);

      expect(callbacks.onChunk).not.toHaveBeenCalled();
    });

    it('should emit assistant messages when slash command flag is set', async () => {
      handler.markSlashCommandSent();

      await handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Command output' }] },
      } as never);

      expect(callbacks.onChunk).toHaveBeenCalledWith('Command output');
    });

    it('should not emit empty text content', async () => {
      handler.markSlashCommandSent();

      await handler.handleMessage({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '   ' }] },
      } as never);

      expect(callbacks.onChunk).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage - system type with init', () => {
    it('should cache slash commands from init message', async () => {
      await handler.handleMessage({
        type: 'system',
        subtype: 'init',
        slash_commands: ['help', 'cost', 'compact'],
        model: 'claude-3',
      } as never);

      const commands = handler.getSlashCommands();
      expect(commands).toHaveLength(3);
      expect(commands[0].name).toBe('help');
      expect(commands[0].description).toBe(''); // Stub has empty description
    });

    it('should emit slash commands to callback', async () => {
      await handler.handleMessage({
        type: 'system',
        subtype: 'init',
        slash_commands: ['help'],
        model: 'claude-3',
      } as never);

      expect(callbacks.onSlashCommands).toHaveBeenCalledWith([
        { name: 'help', description: '', argumentHint: '' },
      ]);
    });
  });

  describe('handleMessage - stream_event type', () => {
    it('should emit text delta chunks', async () => {
      await handler.handleMessage({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Hello' },
        },
      } as never);

      expect(callbacks.onChunk).toHaveBeenCalledWith('Hello');
    });

    it('should not emit for non-text_delta events', async () => {
      await handler.handleMessage({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          delta: {},
        },
      } as never);

      expect(callbacks.onChunk).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage - result type', () => {
    it('should set querySucceeded on success', async () => {
      await handler.handleMessage({
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        duration_ms: 100,
      } as never);

      expect(handler.didQuerySucceed()).toBe(true);
    });

    it('should not set querySucceeded on non-success', async () => {
      await handler.handleMessage({
        type: 'result',
        subtype: 'error',
        num_turns: 0,
        duration_ms: 50,
      } as never);

      expect(handler.didQuerySucceed()).toBe(false);
    });
  });
});
