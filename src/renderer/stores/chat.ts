/**
 * Chat store - manages chat messages and Claude interactions
 */

import type { ChatMessage, PendingAction } from '@shared/types';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import { CONSTANTS } from '../constants/app';
import { generateId } from '../utils/id';

export const useChatStore = defineStore('chat', () => {
  // State
  const messages = ref<ChatMessage[]>([]);
  const pendingActions = ref<PendingAction[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const currentStreamingContent = ref('');

  // Getters
  const hasMessages = computed(() => messages.value.length > 0);
  const hasPendingActions = computed(() => pendingActions.value.length > 0);
  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  );

  // Actions
  function addMessage(message: ChatMessage): void {
    messages.value.push(message);

    // Enforce message limit
    if (messages.value.length > CONSTANTS.MESSAGES.MAX_COUNT) {
      const removeCount = messages.value.length - CONSTANTS.MESSAGES.MAX_COUNT;
      messages.value.splice(0, removeCount);
    }
  }

  function addUserMessage(content: string): ChatMessage {
    const message: ChatMessage = {
      id: generateId('msg'),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    addMessage(message);
    return message;
  }

  function startAssistantMessage(): ChatMessage {
    const message: ChatMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(message);
    currentStreamingContent.value = '';
    return message;
  }

  function appendToLastMessage(chunk: string): void {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.content += chunk;
      currentStreamingContent.value = last.content;
    }
  }

  function finishStreaming(): void {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.isStreaming = false;
    }
    currentStreamingContent.value = '';
  }

  function addPendingAction(action: PendingAction): void {
    pendingActions.value.push(action);
  }

  function removePendingAction(actionId: string): void {
    const index = pendingActions.value.findIndex((a) => a.id === actionId);
    if (index !== -1) {
      pendingActions.value.splice(index, 1);
    }
  }

  function updateActionStatus(actionId: string, status: PendingAction['status']): void {
    const action = pendingActions.value.find((a) => a.id === actionId);
    if (action) {
      action.status = status;
    }
  }

  function setLoading(loading: boolean): void {
    isLoading.value = loading;
  }

  function setError(errorMessage: string | null): void {
    error.value = errorMessage;
  }

  function clearError(): void {
    error.value = null;
  }

  function clearMessages(): void {
    messages.value = [];
    pendingActions.value = [];
    currentStreamingContent.value = '';
    error.value = null;
  }

  function loadMessages(loadedMessages: ChatMessage[]): void {
    messages.value = loadedMessages;
  }

  return {
    // State
    messages,
    pendingActions,
    isLoading,
    error,
    currentStreamingContent,

    // Getters
    hasMessages,
    hasPendingActions,
    lastMessage,

    // Actions
    addMessage,
    addUserMessage,
    startAssistantMessage,
    appendToLastMessage,
    finishStreaming,
    addPendingAction,
    removePendingAction,
    updateActionStatus,
    setLoading,
    setError,
    clearError,
    clearMessages,
    loadMessages,
  };
});
