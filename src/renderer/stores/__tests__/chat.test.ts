/**
 * Tests for the chat store
 */

import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';

import { useChatStore } from '../chat';

describe('useChatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have empty messages', () => {
      const store = useChatStore();
      expect(store.messages).toEqual([]);
    });

    it('should have empty pending actions', () => {
      const store = useChatStore();
      expect(store.pendingActions).toEqual([]);
    });

    it('should not be loading', () => {
      const store = useChatStore();
      expect(store.isLoading).toBe(false);
    });

    it('should have no error', () => {
      const store = useChatStore();
      expect(store.error).toBeNull();
    });
  });

  describe('computed properties', () => {
    it('hasMessages should be false when empty', () => {
      const store = useChatStore();
      expect(store.hasMessages).toBe(false);
    });

    it('hasMessages should be true when messages exist', () => {
      const store = useChatStore();
      store.addUserMessage('Hello');
      expect(store.hasMessages).toBe(true);
    });

    it('hasPendingActions should be false when empty', () => {
      const store = useChatStore();
      expect(store.hasPendingActions).toBe(false);
    });

    it('lastMessage should be null when empty', () => {
      const store = useChatStore();
      expect(store.lastMessage).toBeNull();
    });

    it('lastMessage should return last message', () => {
      const store = useChatStore();
      store.addUserMessage('First');
      store.addUserMessage('Second');
      expect(store.lastMessage?.content).toBe('Second');
    });
  });

  describe('addUserMessage', () => {
    it('should add a user message', () => {
      const store = useChatStore();
      const message = store.addUserMessage('Hello');

      expect(store.messages).toHaveLength(1);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello');
      expect(message.id).toMatch(/^msg_/);
      expect(message.timestamp).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const store = useChatStore();
      const msg1 = store.addUserMessage('First');
      const msg2 = store.addUserMessage('Second');

      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('startAssistantMessage', () => {
    it('should add an empty streaming message', () => {
      const store = useChatStore();
      const message = store.startAssistantMessage();

      expect(store.messages).toHaveLength(1);
      expect(message.role).toBe('assistant');
      expect(message.content).toBe('');
      expect(message.isStreaming).toBe(true);
    });
  });

  describe('appendToLastMessage', () => {
    it('should append content to last assistant message', () => {
      const store = useChatStore();
      store.startAssistantMessage();
      store.appendToLastMessage('Hello');
      store.appendToLastMessage(' World');

      expect(store.messages[0].content).toBe('Hello World');
      expect(store.currentStreamingContent).toBe('Hello World');
    });

    it('should not append to user message', () => {
      const store = useChatStore();
      store.addUserMessage('User message');
      store.appendToLastMessage('This should not be appended');

      expect(store.messages[0].content).toBe('User message');
    });
  });

  describe('finishStreaming', () => {
    it('should mark last message as not streaming', () => {
      const store = useChatStore();
      store.startAssistantMessage();
      store.appendToLastMessage('Complete message');
      store.finishStreaming();

      expect(store.messages[0].isStreaming).toBe(false);
      expect(store.currentStreamingContent).toBe('');
    });
  });

  describe('pending actions', () => {
    it('should add pending action', () => {
      const store = useChatStore();
      const action = {
        id: 'action_1',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run command',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      store.addPendingAction(action);

      expect(store.pendingActions).toHaveLength(1);
      expect(store.hasPendingActions).toBe(true);
    });

    it('should remove pending action', () => {
      const store = useChatStore();
      const action = {
        id: 'action_1',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run command',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      store.addPendingAction(action);
      store.removePendingAction('action_1');

      expect(store.pendingActions).toHaveLength(0);
    });

    it('should update action status', () => {
      const store = useChatStore();
      const action = {
        id: 'action_1',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run command',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      store.addPendingAction(action);
      store.updateActionStatus('action_1', 'approved');

      expect(store.pendingActions[0].status).toBe('approved');
    });
  });

  describe('error handling', () => {
    it('should set error', () => {
      const store = useChatStore();
      store.setError('Something went wrong');

      expect(store.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const store = useChatStore();
      store.setError('Something went wrong');
      store.clearError();

      expect(store.error).toBeNull();
    });
  });

  describe('clearMessages', () => {
    it('should clear all state', () => {
      const store = useChatStore();
      store.addUserMessage('Test');
      store.startAssistantMessage();
      store.appendToLastMessage('Response');
      store.setError('Error');
      store.addPendingAction({
        id: 'action_1',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run command',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      });

      store.clearMessages();

      expect(store.messages).toEqual([]);
      expect(store.pendingActions).toEqual([]);
      expect(store.currentStreamingContent).toBe('');
      expect(store.error).toBeNull();
    });
  });

  describe('loadMessages', () => {
    it('should load messages', () => {
      const store = useChatStore();
      const messages = [
        { id: 'msg_1', role: 'user' as const, content: 'Hello', timestamp: 1000 },
        { id: 'msg_2', role: 'assistant' as const, content: 'Hi there', timestamp: 2000 },
      ];

      store.loadMessages(messages);

      expect(store.messages).toHaveLength(2);
      expect(store.messages[0].content).toBe('Hello');
      expect(store.messages[1].content).toBe('Hi there');
    });
  });
});
