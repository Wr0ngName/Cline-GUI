/**
 * Comprehensive tests for the chat store.
 *
 * Tests cover:
 * - Message management (add, append, stream, clear, load)
 * - Pending actions lifecycle (add, remove, update status)
 * - Loading and error state management
 * - Message limit enforcement (MAX_COUNT)
 * - Getters accuracy (hasMessages, hasPendingActions, lastMessage)
 * - Edge cases (unicode, long messages, rapid appends, empty content)
 * - Integration scenarios (full conversation flow, tool approval flow)
 */

import type { ChatMessage, PendingAction, BashCommandAction, FileEditAction } from '@shared/types';
import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useChatStore } from '../chat';

// Helper to create valid BashCommandAction
function createBashAction(overrides: Partial<BashCommandAction> & { id: string }): BashCommandAction {
  return {
    type: 'bash-command',
    toolName: 'Bash',
    description: 'Run command',
    input: {},
    status: 'pending',
    timestamp: Date.now(),
    details: { command: 'ls', workingDirectory: '/tmp' },
    ...overrides,
  };
}

// Helper to create valid FileEditAction
function createFileEditAction(overrides: Partial<FileEditAction> & { id: string }): FileEditAction {
  return {
    type: 'file-edit',
    toolName: 'Edit',
    description: 'Edit file',
    input: {},
    status: 'pending',
    timestamp: Date.now(),
    details: { filePath: '/tmp/test.txt', newContent: 'content' },
    ...overrides,
  };
}

// Mock CONSTANTS with testable values
vi.mock('../../constants/app', () => ({
  CONSTANTS: {
    MESSAGES: {
      MAX_COUNT: 100,
    },
  },
}));

describe('useChatStore', () => {
  let store: ReturnType<typeof useChatStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useChatStore();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================
  describe('initial state', () => {
    it('should have empty messages', () => {
      expect(store.messages).toEqual([]);
    });

    it('should have empty pending actions', () => {
      expect(store.pendingActions).toEqual([]);
    });

    it('should not be loading', () => {
      expect(store.isLoading).toBe(false);
    });

    it('should have no error', () => {
      expect(store.error).toBeNull();
    });

    it('should have empty currentStreamingContent', () => {
      expect(store.currentStreamingContent).toBe('');
    });
  });

  // ===========================================================================
  // Getters
  // ===========================================================================
  describe('getters', () => {
    describe('hasMessages', () => {
      it('should be false when empty', () => {
        expect(store.hasMessages).toBe(false);
      });

      it('should be true when messages exist', () => {
        store.addUserMessage('Hello');
        expect(store.hasMessages).toBe(true);
      });

      it('should be true with single assistant message', () => {
        store.startAssistantMessage();
        expect(store.hasMessages).toBe(true);
      });

      it('should become false after clearing messages', () => {
        store.addUserMessage('Test');
        expect(store.hasMessages).toBe(true);
        store.clearMessages();
        expect(store.hasMessages).toBe(false);
      });
    });

    describe('hasPendingActions', () => {
      it('should be false when empty', () => {
        expect(store.hasPendingActions).toBe(false);
      });

      it('should be true when actions exist', () => {
        store.addPendingAction(createBashAction({ id: 'action-1' }));
        expect(store.hasPendingActions).toBe(true);
      });

      it('should become false after removing all actions', () => {
        store.addPendingAction(createBashAction({ id: 'action-1' }));
        expect(store.hasPendingActions).toBe(true);
        store.removePendingAction('action-1');
        expect(store.hasPendingActions).toBe(false);
      });
    });

    describe('lastMessage', () => {
      it('should be null when empty', () => {
        expect(store.lastMessage).toBeNull();
      });

      it('should return last message', () => {
        store.addUserMessage('First');
        store.addUserMessage('Second');
        expect(store.lastMessage?.content).toBe('Second');
      });

      it('should update when new message is added', () => {
        store.addUserMessage('Original');
        expect(store.lastMessage?.content).toBe('Original');
        store.addUserMessage('New');
        expect(store.lastMessage?.content).toBe('New');
      });

      it('should return assistant message when streaming', () => {
        store.addUserMessage('Question');
        store.startAssistantMessage();
        store.appendToLastMessage('Answer');
        expect(store.lastMessage?.role).toBe('assistant');
        expect(store.lastMessage?.content).toBe('Answer');
      });
    });
  });

  // ===========================================================================
  // addMessage
  // ===========================================================================
  describe('addMessage', () => {
    it('should add message to array', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: 'Test message',
        timestamp: Date.now(),
      };
      store.addMessage(message);
      expect(store.messages).toHaveLength(1);
      expect(store.messages[0]).toEqual(message);
    });

    it('should preserve message order', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'user', content: 'First', timestamp: 1000 },
        { id: 'msg-2', role: 'assistant', content: 'Second', timestamp: 2000 },
        { id: 'msg-3', role: 'user', content: 'Third', timestamp: 3000 },
      ];
      messages.forEach((msg) => store.addMessage(msg));
      expect(store.messages).toHaveLength(3);
      expect(store.messages[0].content).toBe('First');
      expect(store.messages[1].content).toBe('Second');
      expect(store.messages[2].content).toBe('Third');
    });

    it('should enforce message limit by removing oldest', () => {
      // Add more than MAX_COUNT messages
      for (let i = 0; i < 105; i++) {
        store.addMessage({
          id: `msg-${i}`,
          role: 'user',
          content: `Message ${i}`,
          timestamp: i,
        });
      }
      // Should only have MAX_COUNT messages (100)
      expect(store.messages).toHaveLength(100);
      // Should have removed oldest (first 5)
      expect(store.messages[0].content).toBe('Message 5');
      expect(store.messages[99].content).toBe('Message 104');
    });

    it('should handle exactly MAX_COUNT messages', () => {
      for (let i = 0; i < 100; i++) {
        store.addMessage({
          id: `msg-${i}`,
          role: 'user',
          content: `Message ${i}`,
          timestamp: i,
        });
      }
      expect(store.messages).toHaveLength(100);
      expect(store.messages[0].content).toBe('Message 0');
    });
  });

  // ===========================================================================
  // addUserMessage
  // ===========================================================================
  describe('addUserMessage', () => {
    it('should add a user message', () => {
      const message = store.addUserMessage('Hello');
      expect(store.messages).toHaveLength(1);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.id).toMatch(/^msg_/);
      expect(message.timestamp).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const msg1 = store.addUserMessage('First');
      const msg2 = store.addUserMessage('Second');
      expect(msg1.id).not.toBe(msg2.id);
    });

    it('should handle empty content', () => {
      const message = store.addUserMessage('');
      expect(message.content).toBe('');
      expect(store.messages).toHaveLength(1);
    });

    it('should handle multiline content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const message = store.addUserMessage(content);
      expect(message.content).toBe(content);
    });

    it('should handle special characters and emoji', () => {
      const content = 'Test with <script>alert("xss")</script> and emoji 🎉 and unicode 你好';
      const message = store.addUserMessage(content);
      expect(message.content).toBe(content);
    });

    it('should handle very long content', () => {
      const longContent = 'x'.repeat(100000);
      const message = store.addUserMessage(longContent);
      expect(message.content).toHaveLength(100000);
    });
  });

  // ===========================================================================
  // startAssistantMessage
  // ===========================================================================
  describe('startAssistantMessage', () => {
    it('should add an empty streaming message', () => {
      const message = store.startAssistantMessage();
      expect(store.messages).toHaveLength(1);
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('');
      expect(message.isStreaming).toBe(true);
    });

    it('should reset currentStreamingContent', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('old content');
      store.finishStreaming();

      // Start new message
      store.startAssistantMessage();
      expect(store.currentStreamingContent).toBe('');
    });

    it('should generate unique ID', () => {
      const msg1 = store.startAssistantMessage();
      store.finishStreaming();
      const msg2 = store.startAssistantMessage();
      expect(msg1.id).not.toBe(msg2.id);
    });

    it('should set timestamp', () => {
      const before = Date.now();
      const message = store.startAssistantMessage();
      const after = Date.now();
      expect(message.timestamp).toBeGreaterThanOrEqual(before);
      expect(message.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // ===========================================================================
  // appendToLastMessage
  // ===========================================================================
  describe('appendToLastMessage', () => {
    it('should append content to last assistant message', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('Hello');
      store.appendToLastMessage(' World');
      expect(store.messages[0].content).toBe('Hello World');
      expect(store.currentStreamingContent).toBe('Hello World');
    });

    it('should not append to user message', () => {
      store.addUserMessage('User message');
      store.appendToLastMessage('This should not be appended');
      expect(store.messages[0].content).toBe('User message');
    });

    it('should handle empty chunks', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('');
      store.appendToLastMessage('Content');
      store.appendToLastMessage('');
      expect(store.messages[0].content).toBe('Content');
    });

    it('should handle rapid successive appends', () => {
      store.startAssistantMessage();
      // Simulate rapid streaming
      for (let i = 0; i < 100; i++) {
        store.appendToLastMessage(`${i} `);
      }
      const expected = Array.from({ length: 100 }, (_, i) => `${i} `).join('');
      expect(store.messages[0].content).toBe(expected);
      expect(store.currentStreamingContent).toBe(expected);
    });

    it('should handle unicode in chunks', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('Hello ');
      store.appendToLastMessage('世界 ');
      store.appendToLastMessage('🌍');
      expect(store.messages[0].content).toBe('Hello 世界 🌍');
    });

    it('should handle newlines in chunks', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('Line 1\n');
      store.appendToLastMessage('Line 2\n');
      store.appendToLastMessage('Line 3');
      expect(store.messages[0].content).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  // ===========================================================================
  // finishStreaming
  // ===========================================================================
  describe('finishStreaming', () => {
    it('should mark last message as not streaming', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('Complete message');
      store.finishStreaming();
      expect(store.messages[0].isStreaming).toBe(false);
      expect(store.currentStreamingContent).toBe('');
    });

    it('should not affect user messages', () => {
      store.addUserMessage('User message');
      store.finishStreaming();
      // Should not throw, should be a no-op
      expect(store.messages[0].isStreaming).toBeUndefined();
    });

    it('should be idempotent', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('Content');
      store.finishStreaming();
      store.finishStreaming();
      store.finishStreaming();
      expect(store.messages[0].isStreaming).toBe(false);
    });

    it('should handle empty message content', () => {
      store.startAssistantMessage();
      store.finishStreaming();
      expect(store.messages[0].content).toBe('');
      expect(store.messages[0].isStreaming).toBe(false);
    });
  });

  // ===========================================================================
  // Pending Actions
  // ===========================================================================
  describe('addPendingAction', () => {
    it('should add action to pending actions', () => {
      const action = createBashAction({ id: 'action-1' });
      store.addPendingAction(action);
      expect(store.pendingActions).toHaveLength(1);
      expect(store.pendingActions[0]).toEqual(action);
      expect(store.hasPendingActions).toBe(true);
    });

    it('should allow multiple actions', () => {
      const actions: PendingAction[] = [
        createFileEditAction({ id: 'a1', description: 'Edit 1' }),
        createFileEditAction({ id: 'a2', description: 'Edit 2' }),
        createBashAction({ id: 'a3', description: 'Run' }),
      ];
      actions.forEach((a) => store.addPendingAction(a));
      expect(store.pendingActions).toHaveLength(3);
    });

    it('should preserve action order', () => {
      store.addPendingAction(createBashAction({ id: 'first', description: 'First' }));
      store.addPendingAction(createBashAction({ id: 'second', description: 'Second' }));
      expect(store.pendingActions[0].id).toBe('first');
      expect(store.pendingActions[1].id).toBe('second');
    });
  });

  describe('removePendingAction', () => {
    it('should remove action by id', () => {
      store.addPendingAction(createFileEditAction({ id: 'action-1' }));
      store.addPendingAction(createBashAction({ id: 'action-2' }));
      store.removePendingAction('action-1');
      expect(store.pendingActions).toHaveLength(1);
      expect(store.pendingActions[0].id).toBe('action-2');
    });

    it('should handle non-existent action id gracefully', () => {
      store.addPendingAction(createFileEditAction({ id: 'action-1' }));
      store.removePendingAction('non-existent');
      expect(store.pendingActions).toHaveLength(1);
    });

    it('should remove from middle of array', () => {
      store.addPendingAction(createBashAction({ id: 'a1', description: '1' }));
      store.addPendingAction(createBashAction({ id: 'a2', description: '2' }));
      store.addPendingAction(createBashAction({ id: 'a3', description: '3' }));
      store.removePendingAction('a2');
      expect(store.pendingActions).toHaveLength(2);
      expect(store.pendingActions[0].id).toBe('a1');
      expect(store.pendingActions[1].id).toBe('a3');
    });
  });

  describe('updateActionStatus', () => {
    it('should update action status to approved', () => {
      store.addPendingAction(createFileEditAction({ id: 'action-1' }));
      store.updateActionStatus('action-1', 'approved');
      expect(store.pendingActions[0].status).toBe('approved');
    });

    it('should update action status to rejected', () => {
      store.addPendingAction(createFileEditAction({ id: 'action-1' }));
      store.updateActionStatus('action-1', 'rejected');
      expect(store.pendingActions[0].status).toBe('rejected');
    });

    it('should handle non-existent action gracefully', () => {
      store.updateActionStatus('non-existent', 'approved');
      // Should not throw
      expect(store.pendingActions).toHaveLength(0);
    });

    it('should update correct action when multiple exist', () => {
      store.addPendingAction(createBashAction({ id: 'a1', description: '1' }));
      store.addPendingAction(createBashAction({ id: 'a2', description: '2' }));
      store.updateActionStatus('a2', 'approved');
      expect(store.pendingActions[0].status).toBe('pending');
      expect(store.pendingActions[1].status).toBe('approved');
    });
  });

  // ===========================================================================
  // Loading State
  // ===========================================================================
  describe('setLoading', () => {
    it('should set loading to true', () => {
      store.setLoading(true);
      expect(store.isLoading).toBe(true);
    });

    it('should set loading to false', () => {
      store.setLoading(true);
      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('setError', () => {
    it('should set error message', () => {
      store.setError('Something went wrong');
      expect(store.error).toBe('Something went wrong');
    });

    it('should allow null to clear error', () => {
      store.setError('Error');
      store.setError(null);
      expect(store.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      store.setError('Error message');
      store.clearError();
      expect(store.error).toBeNull();
    });

    it('should be safe to call when no error', () => {
      store.clearError();
      expect(store.error).toBeNull();
    });
  });

  // ===========================================================================
  // clearMessages
  // ===========================================================================
  describe('clearMessages', () => {
    it('should clear all messages', () => {
      store.addUserMessage('Test');
      store.startAssistantMessage();
      store.appendToLastMessage('Response');
      store.clearMessages();
      expect(store.messages).toEqual([]);
    });

    it('should clear pending actions', () => {
      store.addPendingAction(createBashAction({ id: 'a1' }));
      store.clearMessages();
      expect(store.pendingActions).toEqual([]);
    });

    it('should clear currentStreamingContent', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('Streaming');
      store.clearMessages();
      expect(store.currentStreamingContent).toBe('');
    });

    it('should clear error', () => {
      store.setError('Error');
      store.clearMessages();
      expect(store.error).toBeNull();
    });

    it('should reset all state at once', () => {
      store.addUserMessage('Test');
      store.startAssistantMessage();
      store.appendToLastMessage('Response');
      store.setError('Error');
      store.addPendingAction(createBashAction({ id: 'a1' }));

      store.clearMessages();

      expect(store.messages).toEqual([]);
      expect(store.pendingActions).toEqual([]);
      expect(store.currentStreamingContent).toBe('');
      expect(store.error).toBeNull();
    });
  });

  // ===========================================================================
  // loadMessages
  // ===========================================================================
  describe('loadMessages', () => {
    it('should replace all messages', () => {
      store.addUserMessage('Old message');
      const newMessages: ChatMessage[] = [
        { id: 'new-1', role: 'user', content: 'New 1', timestamp: 1000 },
        { id: 'new-2', role: 'assistant', content: 'New 2', timestamp: 2000 },
      ];
      store.loadMessages(newMessages);
      expect(store.messages).toHaveLength(2);
      expect(store.messages[0].content).toBe('New 1');
      expect(store.messages[1].content).toBe('New 2');
    });

    it('should handle empty array', () => {
      store.addUserMessage('Existing');
      store.loadMessages([]);
      expect(store.messages).toHaveLength(0);
    });

    it('should set messages to provided array', () => {
      const messages: ChatMessage[] = [
        { id: 'msg-1', role: 'user', content: 'Test', timestamp: 1000 },
      ];
      store.loadMessages(messages);
      expect(store.messages).toStrictEqual(messages);
    });

    it('should load large conversation history', () => {
      const messages: ChatMessage[] = Array.from({ length: 50 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `Message ${i}`,
        timestamp: i * 1000,
      }));
      store.loadMessages(messages);
      expect(store.messages).toHaveLength(50);
    });
  });

  // ===========================================================================
  // Integration Scenarios
  // ===========================================================================
  describe('complete conversation flow', () => {
    it('should handle a full conversation cycle', () => {
      // User sends message
      store.addUserMessage('Hello, can you help me?');
      expect(store.messages).toHaveLength(1);
      expect(store.hasMessages).toBe(true);

      // Start streaming response
      store.setLoading(true);
      const assistantMsg = store.startAssistantMessage();
      expect(store.messages).toHaveLength(2);
      expect(assistantMsg.isStreaming).toBe(true);

      // Stream chunks
      store.appendToLastMessage('Of course!');
      store.appendToLastMessage(' How can I assist you today?');
      expect(store.currentStreamingContent).toBe('Of course! How can I assist you today?');

      // Finish streaming
      store.finishStreaming();
      store.setLoading(false);

      expect(store.messages[1].isStreaming).toBe(false);
      expect(store.isLoading).toBe(false);
      expect(store.messages[1].content).toBe('Of course! How can I assist you today?');
    });

    it('should handle tool use approval flow', () => {
      // User sends message
      store.addUserMessage('Run the tests');
      store.setLoading(true);
      store.startAssistantMessage();
      store.appendToLastMessage('I\'ll run the tests for you.');
      store.finishStreaming();

      // Tool use requested
      const action = createBashAction({
        id: 'tool-1',
        description: 'npm test',
        details: { command: 'npm test', workingDirectory: '/project' },
      });
      store.addPendingAction(action);
      expect(store.hasPendingActions).toBe(true);

      // User approves
      store.updateActionStatus('tool-1', 'approved');
      expect(store.pendingActions[0].status).toBe('approved');

      // Action completed, remove
      store.removePendingAction('tool-1');
      expect(store.hasPendingActions).toBe(false);

      store.setLoading(false);
    });

    it('should handle error during conversation', () => {
      store.addUserMessage('Do something');
      store.setLoading(true);
      store.startAssistantMessage();

      // Error occurs
      store.setError('Connection lost');
      store.setLoading(false);

      expect(store.error).toBe('Connection lost');
      expect(store.isLoading).toBe(false);

      // User clears error
      store.clearError();
      expect(store.error).toBeNull();
    });

    it('should handle multiple user-assistant exchanges', () => {
      // Add multiple exchanges
      for (let i = 0; i < 10; i++) {
        store.addUserMessage(`Question ${i}`);
        store.startAssistantMessage();
        store.appendToLastMessage(`Answer ${i}`);
        store.finishStreaming();
      }

      expect(store.messages).toHaveLength(20);

      // Verify alternating pattern
      for (let i = 0; i < 20; i++) {
        const expected = i % 2 === 0 ? 'user' : 'assistant';
        expect(store.messages[i].role).toBe(expected);
      }
    });

    it('should handle concurrent action updates', () => {
      // Add multiple actions
      for (let i = 0; i < 5; i++) {
        store.addPendingAction(createFileEditAction({
          id: `action-${i}`,
          description: `Edit ${i}`,
        }));
      }

      // Update all to approved
      for (let i = 0; i < 5; i++) {
        store.updateActionStatus(`action-${i}`, 'approved');
      }

      // Verify all updated
      store.pendingActions.forEach((action) => {
        expect(action.status).toBe('approved');
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================
  describe('edge cases', () => {
    it('should handle unicode content throughout', () => {
      const unicodeContent = '你好世界 🌍 مرحبا العالم Привет мир';
      const message = store.addUserMessage(unicodeContent);
      expect(message.content).toBe(unicodeContent);
    });

    it('should handle message limit with alternating user/assistant', () => {
      // Fill up to limit with alternating messages
      for (let i = 0; i < 60; i++) {
        if (i % 2 === 0) {
          store.addUserMessage(`User ${i}`);
        } else {
          store.startAssistantMessage();
          store.appendToLastMessage(`Assistant ${i}`);
          store.finishStreaming();
        }
      }
      expect(store.messages.length).toBeLessThanOrEqual(100);
    });

    it('should handle empty append followed by content', () => {
      store.startAssistantMessage();
      store.appendToLastMessage('');
      store.appendToLastMessage('');
      store.appendToLastMessage('Finally content');
      store.appendToLastMessage('');
      expect(store.messages[0].content).toBe('Finally content');
    });
  });
});
