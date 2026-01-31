/**
 * Chat store - manages chat messages and Claude interactions
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import type { ChatMessage, PendingAction } from '@shared/types';

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
  function addMessage(message: ChatMessage) {
    messages.value.push(message);
  }

  function addUserMessage(content: string) {
    const message: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    addMessage(message);
    return message;
  }

  function startAssistantMessage() {
    const message: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(message);
    currentStreamingContent.value = '';
    return message;
  }

  function appendToLastMessage(chunk: string) {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.content += chunk;
      currentStreamingContent.value = last.content;
    }
  }

  function finishStreaming() {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.isStreaming = false;
    }
    currentStreamingContent.value = '';
  }

  function addPendingAction(action: PendingAction) {
    pendingActions.value.push(action);
  }

  function removePendingAction(actionId: string) {
    const index = pendingActions.value.findIndex((a) => a.id === actionId);
    if (index !== -1) {
      pendingActions.value.splice(index, 1);
    }
  }

  function updateActionStatus(actionId: string, status: PendingAction['status']) {
    const action = pendingActions.value.find((a) => a.id === actionId);
    if (action) {
      action.status = status;
    }
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading;
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage;
  }

  function clearError() {
    error.value = null;
  }

  function clearMessages() {
    messages.value = [];
    pendingActions.value = [];
    currentStreamingContent.value = '';
    error.value = null;
  }

  function loadMessages(loadedMessages: ChatMessage[]) {
    messages.value = loadedMessages;
  }

  // Helper
  function generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
