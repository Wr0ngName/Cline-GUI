/**
 * Conversations store - manages conversation persistence and history
 */

import type { ChatMessage, Conversation } from '@shared/types';
import { defineStore, storeToRefs } from 'pinia';
import { ref, computed, watch } from 'vue';

import { CONSTANTS } from '../constants/app';
import { generateId } from '../utils/id';
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
  const isInitialized = ref(false);

  // Set up watchers at store creation time for proper reactivity
  const chatStore = useChatStore();
  const { messages: chatMessages, isLoading: chatIsLoading } = storeToRefs(chatStore);

  // Watch for streaming to finish - save when Claude response is complete
  watch(
    chatIsLoading,
    (loading, wasLoading) => {
      if (!isInitialized.value) return; // Don't save before initialization

      logger.info('Chat loading state changed', {
        loading,
        wasLoading,
        conversationId: currentConversationId.value,
        messageCount: chatMessages.value.length,
      });

      // When loading transitions from true to false, the message is complete
      if (!loading && wasLoading && currentConversationId.value && chatMessages.value.length > 0) {
        logger.info('Streaming finished, saving conversation');
        saveCurrentConversation();
      }
    }
  );

  // Watch for message count changes - save when first user message is added
  // This ensures the conversation appears in history immediately
  watch(
    () => chatMessages.value.length,
    (newLength, oldLength) => {
      if (!isInitialized.value) return; // Don't save before initialization

      logger.info('Messages length changed', {
        newLength,
        oldLength,
        conversationId: currentConversationId.value,
        isLoading: chatIsLoading.value,
      });

      // Save when first message is added (user message)
      // This makes the conversation appear in history immediately
      if (oldLength === 0 && newLength > 0 && currentConversationId.value) {
        logger.info('First message added, saving conversation to history');
        saveCurrentConversation();
      }
    }
  );

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
      logger.debug('No current conversation ID, skipping save');
      return;
    }

    const chatStore = useChatStore();
    const settingsStore = useSettingsStore();

    // Don't save if no messages
    if (chatStore.messages.length === 0) {
      logger.debug('No messages to save');
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

      logger.info('Saving conversation', {
        id: conversation.id,
        messageCount: conversation.messages.length,
        title: conversation.title?.slice(0, 30),
      });

      await window.electron.conversation.save(conversation);

      // Update in list
      const index = conversations.value.findIndex((c) => c.id === conversation.id);
      if (index !== -1) {
        conversations.value[index] = { ...conversation, messages: [] }; // Store without messages for list
      } else {
        conversations.value.push({ ...conversation, messages: [] });
      }

      logger.info('Conversation saved successfully', { id: conversation.id });
    } catch (err) {
      logger.error('Failed to save conversation', { error: err instanceof Error ? err.message : String(err) });
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
    const id = generateId('conv');

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
   * Generate a title from the first user message
   */
  function generateTitle(messages: ChatMessage[]): string {
    const firstUserMessage = messages.find((m) => m.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      if (content.length <= CONSTANTS.CONVERSATION.TITLE_MAX_LENGTH) {
        return content;
      }
      return content.slice(0, CONSTANTS.CONVERSATION.TITLE_TRUNCATE_LENGTH) + '...';
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
   * Initialize the store - load conversations and enable auto-save
   */
  async function initialize(): Promise<void> {
    logger.info('Initializing conversations store');

    // Wait for conversation list to load before proceeding
    await loadConversationList();

    // Create initial conversation if none exists
    if (!currentConversationId.value) {
      createNewConversation();
    }

    // Enable auto-save watchers (they're created at store creation time)
    isInitialized.value = true;

    logger.info('Conversations store initialized', {
      currentConversationId: currentConversationId.value,
      messageCount: chatMessages.value.length,
    });
  }

  /**
   * Cleanup on unmount
   */
  function cleanup(): void {
    // Disable auto-save watchers
    isInitialized.value = false;

    // Save current conversation before cleanup
    saveCurrentConversation();
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
    clearError,
    initialize,
    cleanup,
  };
});
