/**
 * Conversations store - manages conversation persistence and history
 */

import type { ChatMessage, Conversation } from '@shared/types';
import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

import { logger } from '../utils/logger';

import { useChatStore } from './chat';
import { useSettingsStore } from './settings';

export const useConversationsStore = defineStore('conversations', () => {
  // State
  const conversations = ref<Conversation[]>([]);
  const currentConversationId = ref<string | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  // Auto-save debounce timer
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const AUTO_SAVE_DELAY = 2000; // 2 seconds debounce

  // Getters
  const currentConversation = computed(() => {
    if (!currentConversationId.value) return null;
    return conversations.value.find((c) => c.id === currentConversationId.value) || null;
  });

  const hasConversations = computed(() => conversations.value.length > 0);

  const sortedConversations = computed(() => {
    return [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt);
  });

  // Actions

  /**
   * Load the list of all conversations (metadata only)
   */
  async function loadConversationList(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const list = await window.electron.conversation.list();
      conversations.value = list;
      logger.debug('Loaded conversation list', { count: list.length });
    } catch (err) {
      logger.error('Failed to load conversations', err);
      error.value = 'Failed to load conversations';
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Load a specific conversation and its messages
   */
  async function loadConversation(id: string): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      const conversation = await window.electron.conversation.get(id);
      if (!conversation) {
        error.value = 'Conversation not found';
        return false;
      }

      // Update in list with full data
      const index = conversations.value.findIndex((c) => c.id === id);
      if (index !== -1) {
        conversations.value[index] = conversation;
      } else {
        conversations.value.push(conversation);
      }

      currentConversationId.value = id;

      // Load messages into chat store
      const chatStore = useChatStore();
      chatStore.loadMessages(conversation.messages);

      // Update working directory if different
      const settingsStore = useSettingsStore();
      if (conversation.workingDirectory && conversation.workingDirectory !== settingsStore.workingDirectory) {
        await settingsStore.setWorkingDirectory(conversation.workingDirectory);
      }

      logger.info('Loaded conversation', { id, messageCount: conversation.messages.length });
      return true;
    } catch (err) {
      logger.error('Failed to load conversation', err);
      error.value = 'Failed to load conversation';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Save the current conversation
   */
  async function saveCurrentConversation(): Promise<void> {
    if (!currentConversationId.value) {
      return;
    }

    const chatStore = useChatStore();
    const settingsStore = useSettingsStore();

    // Don't save if no messages
    if (chatStore.messages.length === 0) {
      return;
    }

    isSaving.value = true;
    error.value = null;

    try {
      const conversation: Conversation = {
        id: currentConversationId.value,
        title: generateTitle(chatStore.messages),
        workingDirectory: settingsStore.workingDirectory,
        messages: [...chatStore.messages],
        createdAt: currentConversation.value?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await window.electron.conversation.save(conversation);

      // Update in list
      const index = conversations.value.findIndex((c) => c.id === conversation.id);
      if (index !== -1) {
        conversations.value[index] = { ...conversation, messages: [] }; // Store without messages for list
      } else {
        conversations.value.push({ ...conversation, messages: [] });
      }

      logger.debug('Saved conversation', { id: conversation.id });
    } catch (err) {
      logger.error('Failed to save conversation', err);
      error.value = 'Failed to save conversation';
    } finally {
      isSaving.value = false;
    }
  }

  /**
   * Create a new conversation and make it current
   */
  function createNewConversation(): string {
    const chatStore = useChatStore();

    // Clear current chat
    chatStore.clearMessages();

    // Generate new conversation ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    const id = `conv_${timestamp}_${random}`;

    currentConversationId.value = id;

    logger.info('Created new conversation', { id });
    return id;
  }

  /**
   * Delete a conversation
   */
  async function deleteConversation(id: string): Promise<void> {
    try {
      await window.electron.conversation.delete(id);

      // Remove from list
      const index = conversations.value.findIndex((c) => c.id === id);
      if (index !== -1) {
        conversations.value.splice(index, 1);
      }

      // If it was the current conversation, create a new one
      if (currentConversationId.value === id) {
        createNewConversation();
      }

      logger.info('Deleted conversation', { id });
    } catch (err) {
      logger.error('Failed to delete conversation', err);
      error.value = 'Failed to delete conversation';
    }
  }

  /**
   * Schedule auto-save with debounce
   */
  function scheduleAutoSave(): void {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }

    autoSaveTimer = setTimeout(() => {
      saveCurrentConversation();
      autoSaveTimer = null;
    }, AUTO_SAVE_DELAY);
  }

  /**
   * Cancel pending auto-save
   */
  function cancelAutoSave(): void {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
  }

  /**
   * Generate a title from the first user message
   */
  function generateTitle(messages: ChatMessage[]): string {
    const firstUserMessage = messages.find((m) => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      if (content.length <= 50) {
        return content;
      }
      return content.slice(0, 47) + '...';
    }
    return 'New Conversation';
  }

  /**
   * Clear error
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * Initialize the store - load conversations and set up auto-save
   */
  function initialize(): void {
    loadConversationList();

    // Create initial conversation if none exists
    if (!currentConversationId.value) {
      createNewConversation();
    }

    // Watch chat messages for auto-save
    const chatStore = useChatStore();
    watch(
      () => chatStore.messages,
      () => {
        if (currentConversationId.value && chatStore.messages.length > 0) {
          scheduleAutoSave();
        }
      },
      { deep: true }
    );
  }

  /**
   * Cleanup on unmount
   */
  function cleanup(): void {
    // Save any pending changes before cleanup
    if (autoSaveTimer) {
      cancelAutoSave();
      // Synchronously mark as saving but don't await
      saveCurrentConversation();
    }
  }

  return {
    // State
    conversations,
    currentConversationId,
    isLoading,
    isSaving,
    error,

    // Getters
    currentConversation,
    hasConversations,
    sortedConversations,

    // Actions
    loadConversationList,
    loadConversation,
    saveCurrentConversation,
    createNewConversation,
    deleteConversation,
    scheduleAutoSave,
    cancelAutoSave,
    clearError,
    initialize,
    cleanup,
  };
});
