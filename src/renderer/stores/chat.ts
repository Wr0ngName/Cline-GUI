/**
 * Chat store - manages chat messages and Claude interactions
 */

import type { ChatMessage, PendingAction, BackgroundTask, TaskNotification } from '@shared/types';
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
  // Track which conversation owns the current streaming session
  const streamingConversationId = ref<string | null>(null);
  // Track the message ID being streamed
  const streamingMessageId = ref<string | null>(null);
  // Flag to indicate user is switching away from a streaming conversation
  const isSwitchingFromStreaming = ref(false);
  // Buffer for streaming content when user switches away from the streaming conversation
  const streamingBuffer = ref<{ conversationId: string; messageId: string; content: string } | null>(null);
  // Background tasks (subagents, background commands)
  const backgroundTasks = ref<Map<string, BackgroundTask>>(new Map());

  // Getters
  const hasMessages = computed(() => messages.value.length > 0);
  const hasPendingActions = computed(() => pendingActions.value.length > 0);
  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  );
  const hasBackgroundTasks = computed(() => backgroundTasks.value.size > 0);
  const runningTasksCount = computed(() =>
    Array.from(backgroundTasks.value.values()).filter(t => t.status === 'running').length
  );
  const backgroundTasksList = computed(() => Array.from(backgroundTasks.value.values()));

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

  function startAssistantMessage(conversationId?: string): ChatMessage {
    const message: ChatMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };
    addMessage(message);
    currentStreamingContent.value = '';
    // Track which conversation and message this streaming belongs to
    streamingMessageId.value = message.id;
    if (conversationId) {
      streamingConversationId.value = conversationId;
      streamingBuffer.value = null; // Clear any previous buffer
    }
    return message;
  }

  function appendToLastMessage(chunk: string): void {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.content += chunk;
      currentStreamingContent.value = last.content;
    }
  }

  /**
   * Append chunk to streaming buffer (used when user switched away from streaming conversation)
   */
  function appendToStreamingBuffer(chunk: string, conversationId: string, messageId: string): void {
    if (!streamingBuffer.value || streamingBuffer.value.conversationId !== conversationId) {
      // Initialize buffer for this conversation
      streamingBuffer.value = {
        conversationId,
        messageId,
        content: chunk,
      };
    } else {
      // Append to existing buffer
      streamingBuffer.value.content += chunk;
    }
  }

  /**
   * Get and clear the streaming buffer
   */
  function getAndClearStreamingBuffer(): { conversationId: string; messageId: string; content: string } | null {
    const buffer = streamingBuffer.value;
    streamingBuffer.value = null;
    return buffer;
  }

  /**
   * Get current streaming conversation ID
   */
  function getStreamingConversationId(): string | null {
    return streamingConversationId.value;
  }

  /**
   * Get current streaming message ID
   */
  function getStreamingMessageId(): string | null {
    return streamingMessageId.value;
  }

  /**
   * Mark that user is switching away from a streaming conversation
   * This triggers immediate buffering of incoming chunks
   */
  function startSwitchingFromStreaming(): void {
    if (streamingConversationId.value && isLoading.value) {
      isSwitchingFromStreaming.value = true;
    }
  }

  /**
   * Check if we should buffer chunks (user switched away from streaming conversation)
   */
  function shouldBufferChunks(): boolean {
    return isSwitchingFromStreaming.value;
  }

  /**
   * Clear streaming state
   */
  function clearStreamingState(): void {
    streamingConversationId.value = null;
    streamingMessageId.value = null;
    streamingBuffer.value = null;
    isSwitchingFromStreaming.value = false;
  }

  function finishStreaming(): void {
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant') {
      last.isStreaming = false;
    }
    currentStreamingContent.value = '';
    // Note: Don't clear streamingConversationId here - it's needed for proper buffer handling
    // It will be cleared when the conversation is saved or a new stream starts
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

  /**
   * Handle a task notification from the SDK
   * Updates or creates a background task based on the notification
   */
  function handleTaskNotification(notification: TaskNotification): void {
    const existingTask = backgroundTasks.value.get(notification.taskId);

    if (existingTask) {
      // Update existing task
      existingTask.status = notification.status;
      if (notification.description) {
        existingTask.description = notification.description;
      }
      if (notification.summary) {
        existingTask.summary = notification.summary;
      }
      if (notification.error) {
        existingTask.error = notification.error;
      }
      if (notification.status !== 'running') {
        existingTask.completedAt = Date.now();
      }
    } else {
      // Create new task
      const task: BackgroundTask = {
        id: notification.taskId,
        description: notification.description || 'Background task',
        status: notification.status,
        startedAt: Date.now(),
        summary: notification.summary,
        outputFile: notification.outputFile,
        sessionId: notification.sessionId,
        error: notification.error,
      };
      if (notification.status !== 'running') {
        task.completedAt = Date.now();
      }
      backgroundTasks.value.set(notification.taskId, task);
    }
  }

  /**
   * Remove a background task by ID
   */
  function removeBackgroundTask(taskId: string): void {
    backgroundTasks.value.delete(taskId);
  }

  /**
   * Clear all completed background tasks
   */
  function clearCompletedTasks(): void {
    for (const [taskId, task] of backgroundTasks.value.entries()) {
      if (task.status !== 'running') {
        backgroundTasks.value.delete(taskId);
      }
    }
  }

  /**
   * Clear all background tasks
   */
  function clearAllBackgroundTasks(): void {
    backgroundTasks.value.clear();
  }

  return {
    // State
    messages,
    pendingActions,
    isLoading,
    error,
    currentStreamingContent,
    streamingConversationId,
    streamingMessageId,
    streamingBuffer,
    isSwitchingFromStreaming,
    backgroundTasks,

    // Getters
    hasMessages,
    hasPendingActions,
    lastMessage,
    hasBackgroundTasks,
    runningTasksCount,
    backgroundTasksList,

    // Actions
    addMessage,
    addUserMessage,
    startAssistantMessage,
    appendToLastMessage,
    appendToStreamingBuffer,
    getAndClearStreamingBuffer,
    getStreamingConversationId,
    getStreamingMessageId,
    startSwitchingFromStreaming,
    shouldBufferChunks,
    clearStreamingState,
    finishStreaming,
    addPendingAction,
    removePendingAction,
    updateActionStatus,
    setLoading,
    setError,
    clearError,
    clearMessages,
    loadMessages,
    handleTaskNotification,
    removeBackgroundTask,
    clearCompletedTasks,
    clearAllBackgroundTasks,
  };
});
