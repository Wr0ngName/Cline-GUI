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
    it('should merge SDK commands with built-in commands', () => {
      const commands: SlashCommandInfo[] = [
        { name: 'custom-skill', description: 'Custom skill', argumentHint: '' },
      ];

      handler.updateSlashCommands(commands);

      const result = handler.getSlashCommands();
      // Should have built-in commands + the custom skill
      expect(result.length).toBeGreaterThan(1);
      expect(result.find(c => c.name === 'help')).toBeDefined();
      expect(result.find(c => c.name === 'custom-skill')).toBeDefined();
    });

    it('should override built-in commands with SDK commands of same name', () => {
      const commands: SlashCommandInfo[] = [
        { name: 'help', description: 'SDK help description', argumentHint: '[topic]' },
      ];

      handler.updateSlashCommands(commands);

      const result = handler.getSlashCommands();
      const helpCmd = result.find(c => c.name === 'help');
      expect(helpCmd?.description).toBe('SDK help description');
      expect(helpCmd?.argumentHint).toBe('[topic]');
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
    it('should merge SDK and built-in commands from init message', async () => {
      await handler.handleMessage({
        type: 'system',
        subtype: 'init',
        slash_commands: ['custom-skill', 'another-skill'],
        model: 'claude-3',
      } as never);

      const commands = handler.getSlashCommands();
      // Should have built-in commands + SDK commands
      expect(commands.length).toBeGreaterThan(2);
      // Built-in commands should have descriptions
      const helpCmd = commands.find(c => c.name === 'help');
      expect(helpCmd).toBeDefined();
      expect(helpCmd?.description).toBeTruthy();
      // SDK commands without built-in match should have empty descriptions
      const customCmd = commands.find(c => c.name === 'custom-skill');
      expect(customCmd).toBeDefined();
    });

    it('should emit merged commands to callback', async () => {
      // Clear mock calls from constructor
      vi.clearAllMocks();

      await handler.handleMessage({
        type: 'system',
        subtype: 'init',
        slash_commands: ['custom-skill'],
        model: 'claude-3',
      } as never);

      expect(callbacks.onSlashCommands).toHaveBeenCalled();
      const mockFn = callbacks.onSlashCommands as ReturnType<typeof vi.fn>;
      // Get the last call (after init message)
      const emittedCommands = mockFn.mock.calls[mockFn.mock.calls.length - 1][0];
      // Should include both built-in and SDK commands
      expect(emittedCommands.find((c: SlashCommandInfo) => c.name === 'help')).toBeDefined();
      expect(emittedCommands.find((c: SlashCommandInfo) => c.name === 'custom-skill')).toBeDefined();
    });

    it('should add new SDK commands while preserving existing descriptions', async () => {
      // First set commands with descriptions via updateSlashCommands
      handler.updateSlashCommands([
        { name: 'custom', description: 'Custom desc', argumentHint: '' },
      ]);

      const commandsBefore = handler.getSlashCommands();
      const countBefore = commandsBefore.length;

      // Then receive init message with a NEW skill (should be added)
      await handler.handleMessage({
        type: 'system',
        subtype: 'init',
        slash_commands: ['new-skill'],
        model: 'claude-3',
      } as never);

      // Should have one more command (new-skill was added)
      const commandsAfter = handler.getSlashCommands();
      expect(commandsAfter.length).toBe(countBefore + 1);

      // Existing descriptions should be preserved
      const customCmd = commandsAfter.find(c => c.name === 'custom');
      expect(customCmd?.description).toBe('Custom desc');

      // New skill should be added (with empty description from init)
      const newSkill = commandsAfter.find(c => c.name === 'new-skill');
      expect(newSkill).toBeDefined();
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

    it('should emit result text on success (slash command output)', async () => {
      await handler.handleMessage({
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        duration_ms: 100,
        result: 'Help output from /help command',
      } as never);

      expect(callbacks.onChunk).toHaveBeenCalledWith('Help output from /help command');
    });

    it('should not emit empty result text', async () => {
      await handler.handleMessage({
        type: 'result',
        subtype: 'success',
        num_turns: 1,
        duration_ms: 100,
        result: '   ',
      } as never);

      expect(callbacks.onChunk).not.toHaveBeenCalled();
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
