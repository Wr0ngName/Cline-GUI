/**
 * Tests for the conversations store
 */

import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useChatStore } from '../chat';
import { useConversationsStore } from '../conversations';

// Mock window.electron
const mockElectron = {
  conversation: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
  config: {
    get: vi.fn(),
    set: vi.fn(),
    onChange: vi.fn(() => () => {}),
  },
};

// Set up the mock before tests
vi.stubGlobal('window', { electron: mockElectron });

describe('useConversationsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Setup default mock returns
    mockElectron.conversation.list.mockResolvedValue([]);
    mockElectron.conversation.get.mockResolvedValue(null);
    mockElectron.conversation.save.mockResolvedValue(undefined);
    mockElectron.conversation.delete.mockResolvedValue(undefined);
    mockElectron.config.get.mockResolvedValue({
      workingDirectory: '/home/user/project',
      apiKey: '',
      oauthToken: '',
      authMethod: 'none',
      recentProjects: [],
      theme: 'system',
      fontSize: 14,
      autoApproveReads: true,
    });
  });

  describe('initial state', () => {
    it('should have empty conversations', () => {
      const store = useConversationsStore();
      expect(store.conversations).toEqual([]);
    });

    it('should have no current conversation', () => {
      const store = useConversationsStore();
      expect(store.currentConversationId).toBeNull();
    });

    it('should not be loading', () => {
      const store = useConversationsStore();
      expect(store.isLoading).toBe(false);
    });

    it('should not be saving', () => {
      const store = useConversationsStore();
      expect(store.isSaving).toBe(false);
    });

    it('should have no error', () => {
      const store = useConversationsStore();
      expect(store.error).toBeNull();
    });
  });

  describe('computed properties', () => {
    it('hasConversations should be false when empty', () => {
      const store = useConversationsStore();
      expect(store.hasConversations).toBe(false);
    });

    it('currentConversation should be null when no ID set', () => {
      const store = useConversationsStore();
      expect(store.currentConversation).toBeNull();
    });

    it('sortedConversations should sort by updatedAt descending', () => {
      const store = useConversationsStore();
      store.conversations = [
        { id: '1', title: 'Old', workingDirectory: '', messages: [], createdAt: 1000, updatedAt: 1000 },
        { id: '2', title: 'New', workingDirectory: '', messages: [], createdAt: 2000, updatedAt: 3000 },
        { id: '3', title: 'Mid', workingDirectory: '', messages: [], createdAt: 1500, updatedAt: 2000 },
      ];

      expect(store.sortedConversations[0].id).toBe('2');
      expect(store.sortedConversations[1].id).toBe('3');
      expect(store.sortedConversations[2].id).toBe('1');
    });
  });

  describe('loadConversationList', () => {
    it('should load conversations from API', async () => {
      const conversations = [
        { id: 'conv_1', title: 'First', workingDirectory: '/home', messages: [], createdAt: 1000, updatedAt: 2000 },
        { id: 'conv_2', title: 'Second', workingDirectory: '/home', messages: [], createdAt: 2000, updatedAt: 3000 },
      ];
      mockElectron.conversation.list.mockResolvedValue(conversations);

      const store = useConversationsStore();
      await store.loadConversationList();

      expect(mockElectron.conversation.list).toHaveBeenCalled();
      expect(store.conversations).toHaveLength(2);
      expect(store.isLoading).toBe(false);
    });

    it('should handle errors', async () => {
      mockElectron.conversation.list.mockRejectedValue(new Error('Network error'));

      const store = useConversationsStore();
      await store.loadConversationList();

      expect(store.error).toBe('Failed to load conversations');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('loadConversation', () => {
    it('should load a conversation and update chat store', async () => {
      const conversation = {
        id: 'conv_1',
        title: 'Test',
        workingDirectory: '/home/user/project',
        messages: [
          { id: 'msg_1', role: 'user' as const, content: 'Hello', timestamp: 1000 },
        ],
        createdAt: 1000,
        updatedAt: 2000,
      };
      mockElectron.conversation.get.mockResolvedValue(conversation);

      const store = useConversationsStore();
      const chatStore = useChatStore();

      const result = await store.loadConversation('conv_1');

      expect(result).toBe(true);
      expect(store.currentConversationId).toBe('conv_1');
      expect(chatStore.messages).toHaveLength(1);
      expect(chatStore.messages[0].content).toBe('Hello');
    });

    it('should return false if conversation not found', async () => {
      mockElectron.conversation.get.mockResolvedValue(null);

      const store = useConversationsStore();
      const result = await store.loadConversation('nonexistent');

      expect(result).toBe(false);
      expect(store.error).toBe('Conversation not found');
    });
  });

  describe('createNewConversation', () => {
    it('should create a new conversation with unique ID', () => {
      const store = useConversationsStore();
      const id1 = store.createNewConversation();
      const id2 = store.createNewConversation();

      expect(id1).toMatch(/^conv_/);
      expect(id2).toMatch(/^conv_/);
      expect(id1).not.toBe(id2);
    });

    it('should set as current conversation', () => {
      const store = useConversationsStore();
      const id = store.createNewConversation();

      expect(store.currentConversationId).toBe(id);
    });

    it('should clear chat messages', () => {
      const chatStore = useChatStore();
      chatStore.addUserMessage('Test');

      const store = useConversationsStore();
      store.createNewConversation();

      expect(chatStore.messages).toEqual([]);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const store = useConversationsStore();
      store.conversations = [
        { id: 'conv_1', title: 'Test', workingDirectory: '', messages: [], createdAt: 1000, updatedAt: 2000 },
      ];

      await store.deleteConversation('conv_1');

      expect(mockElectron.conversation.delete).toHaveBeenCalledWith('conv_1');
      expect(store.conversations).toHaveLength(0);
    });

    it('should create new conversation if deleting current', async () => {
      const store = useConversationsStore();
      store.conversations = [
        { id: 'conv_1', title: 'Test', workingDirectory: '', messages: [], createdAt: 1000, updatedAt: 2000 },
      ];
      store.currentConversationId = 'conv_1';

      await store.deleteConversation('conv_1');

      expect(store.currentConversationId).not.toBe('conv_1');
      expect(store.currentConversationId).toMatch(/^conv_/);
    });
  });

  describe('error handling', () => {
    it('should clear error', () => {
      const store = useConversationsStore();
      store.error = 'Some error';
      store.clearError();

      expect(store.error).toBeNull();
    });
  });
});
