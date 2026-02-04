/**
 * Chat store - manages chat messages and Claude interactions
 * Refactored for multi-conversation support with per-conversation state
 */

import type { ChatMessage, PendingAction, BackgroundTask, TaskNotification, SessionUsage } from '@shared/types';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import { CONSTANTS } from '../constants/app';
import { generateId } from '../utils/id';

/**
 * Per-conversation state tracked for multi-instance support
 */
export interface ConversationState {
  /** Whether this conversation has an active query */
  isLoading: boolean;
  /** Current streaming content for this conversation */
  currentStreamingContent: string;
  /** Message ID being streamed in this conversation */
  streamingMessageId: string | null;
  /** Pending actions waiting for user approval */
  pendingActions: PendingAction[];
  /** Background tasks for this conversation */
  backgroundTasks: Map<string, BackgroundTask>;
  /** Session usage (token counts, cost) */
  sessionUsage: SessionUsage | null;
  /** Error message if any */
  error: string | null;
}

/**
 * Create a fresh conversation state object
 */
function createConversationState(): ConversationState {
  return {
    isLoading: false,
    currentStreamingContent: '',
    streamingMessageId: null,
    pendingActions: [],
    backgroundTasks: new Map(),
    sessionUsage: null,
    error: null,
  };
}

export const useChatStore = defineStore('chat', () => {
  // ============================================
  // Current View State (what user is looking at)
  // ============================================

  /** Messages currently displayed (from active conversation) */
  const messages = ref<ChatMessage[]>([]);

  /** Currently active conversation ID */
  const currentConversationId = ref<string | null>(null);

  // ============================================
  // Per-Conversation State Map
  // ============================================

  /** Map of conversation ID to its state */
  const conversationStates = ref<Map<string, ConversationState>>(new Map());

  // ============================================
  // Global Resource Tracking
  // ============================================

  /** Current number of active queries across all conversations */
  const activeQueryCount = ref(0);

  /** Maximum concurrent queries allowed */
  const maxConcurrentQueries = ref(5);

  /** IDs of conversations with active queries */
  const activeConversationIds = ref<string[]>([]);

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Get or create state for a conversation
   */
  function getConversationState(conversationId: string): ConversationState {
    let state = conversationStates.value.get(conversationId);
    if (!state) {
      state = createConversationState();
      conversationStates.value.set(conversationId, state);
    }
    return state;
  }

  /**
   * Get the current conversation's state
   */
  function getCurrentState(): ConversationState | null {
    if (!currentConversationId.value) return null;
    return getConversationState(currentConversationId.value);
  }

  // ============================================
  // Computed Properties (based on current conversation)
  // ============================================

  const hasMessages = computed(() => messages.value.length > 0);

  const lastMessage = computed(() =>
    messages.value.length > 0 ? messages.value[messages.value.length - 1] : null
  );

  // Current conversation's loading state
  const isLoading = computed(() => {
    const state = getCurrentState();
    return state?.isLoading ?? false;
  });

  // Current conversation's error
  const error = computed(() => {
    const state = getCurrentState();
    return state?.error ?? null;
  });

  // Current conversation's streaming content
  const currentStreamingContent = computed(() => {
    const state = getCurrentState();
    return state?.currentStreamingContent ?? '';
  });

  // Current conversation's pending actions
  const pendingActions = computed(() => {
    const state = getCurrentState();
    return state?.pendingActions ?? [];
  });

  const hasPendingActions = computed(() => pendingActions.value.length > 0);

  // Current conversation's background tasks
  const backgroundTasks = computed(() => {
    const state = getCurrentState();
    return state?.backgroundTasks ?? new Map();
  });

  const hasBackgroundTasks = computed(() => backgroundTasks.value.size > 0);

  const runningTasksCount = computed(() =>
    Array.from(backgroundTasks.value.values()).filter(t => t.status === 'running').length
  );

  const backgroundTasksList = computed(() => Array.from(backgroundTasks.value.values()));

  // Current conversation's session usage
  const sessionUsage = computed(() => {
    const state = getCurrentState();
    return state?.sessionUsage ?? null;
  });

  const hasSessionUsage = computed(() => sessionUsage.value !== null);

  const totalTokensUsed = computed(() => {
    if (!sessionUsage.value) return 0;
    return sessionUsage.value.usage.inputTokens + sessionUsage.value.usage.outputTokens;
  });

  const contextWindowSize = computed(() => {
    if (!sessionUsage.value?.modelUsage) return 0;
    const models = Object.values(sessionUsage.value.modelUsage);
    return models.length > 0 ? models[0].contextWindow : 0;
  });

  const contextUsagePercent = computed(() => {
    if (contextWindowSize.value === 0) return 0;
    return Math.min(100, (totalTokensUsed.value / contextWindowSize.value) * 100);
  });

  // Resource limit computed
  const isAtResourceLimit = computed(() =>
    activeQueryCount.value >= maxConcurrentQueries.value
  );

  const canStartNewQuery = computed(() =>
    activeQueryCount.value < maxConcurrentQueries.value
  );

  // ============================================
  // Current Conversation Management
  // ============================================

  /**
   * Set the currently active conversation
   */
  function setCurrentConversation(conversationId: string | null): void {
    currentConversationId.value = conversationId;
  }

  /**
   * Check if a specific conversation is currently loading
   */
  function isConversationLoading(conversationId: string): boolean {
    const state = conversationStates.value.get(conversationId);
    return state?.isLoading ?? false;
  }

  /**
   * Check if a specific conversation has pending actions
   */
  function conversationHasPendingActions(conversationId: string): boolean {
    const state = conversationStates.value.get(conversationId);
    return (state?.pendingActions.length ?? 0) > 0;
  }

  // ============================================
  // Message Actions
  // ============================================

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

  function startAssistantMessage(conversationId: string): ChatMessage {
    const message: ChatMessage = {
      id: generateId('msg'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    // Only add to messages array if this is the current conversation
    if (conversationId === currentConversationId.value) {
      addMessage(message);
    }

    // Track streaming state for this conversation
    const state = getConversationState(conversationId);
    state.currentStreamingContent = '';
    state.streamingMessageId = message.id;

    return message;
  }

  /**
   * Append chunk to a conversation's streaming message
   */
  function appendChunk(conversationId: string, chunk: string): void {
    const state = getConversationState(conversationId);
    state.currentStreamingContent += chunk;

    // If this is the current conversation, also update the message in view
    if (conversationId === currentConversationId.value) {
      const last = messages.value[messages.value.length - 1];
      if (last && last.role === 'assistant' && last.id === state.streamingMessageId) {
        last.content += chunk;
      }
    }
  }

  /**
   * Get accumulated streaming content for a conversation
   * (used when switching back to a conversation that was streaming)
   */
  function getStreamingContent(conversationId: string): string {
    const state = conversationStates.value.get(conversationId);
    return state?.currentStreamingContent ?? '';
  }

  /**
   * Finish streaming for a conversation
   */
  function finishStreaming(conversationId: string): void {
    const state = conversationStates.value.get(conversationId);
    if (!state) return;

    // If this is the current conversation, update the message
    if (conversationId === currentConversationId.value) {
      const last = messages.value[messages.value.length - 1];
      if (last && last.role === 'assistant' && last.id === state.streamingMessageId) {
        last.isStreaming = false;
        // Ensure content is synced
        last.content = state.currentStreamingContent;
      }
    }

    state.streamingMessageId = null;
    state.currentStreamingContent = '';
  }

  function clearMessages(): void {
    messages.value = [];
    // Don't clear conversation state here - that's separate
  }

  function loadMessages(loadedMessages: ChatMessage[]): void {
    messages.value = loadedMessages;
  }

  // ============================================
  // Loading State Actions
  // ============================================

  function setLoading(conversationId: string, loading: boolean): void {
    const state = getConversationState(conversationId);
    state.isLoading = loading;
  }

  // ============================================
  // Error Actions
  // ============================================

  function setError(conversationId: string, errorMessage: string | null): void {
    const state = getConversationState(conversationId);
    state.error = errorMessage;
  }

  function clearError(): void {
    if (currentConversationId.value) {
      const state = getConversationState(currentConversationId.value);
      state.error = null;
    }
  }

  // ============================================
  // Pending Action Actions
  // ============================================

  function addPendingAction(conversationId: string, action: PendingAction): void {
    const state = getConversationState(conversationId);
    state.pendingActions.push(action);
  }

  function removePendingAction(conversationId: string, actionId: string): void {
    const state = conversationStates.value.get(conversationId);
    if (!state) return;

    const index = state.pendingActions.findIndex((a) => a.id === actionId);
    if (index !== -1) {
      state.pendingActions.splice(index, 1);
    }
  }

  function updateActionStatus(conversationId: string, actionId: string, status: PendingAction['status']): void {
    const state = conversationStates.value.get(conversationId);
    if (!state) return;

    const action = state.pendingActions.find((a) => a.id === actionId);
    if (action) {
      action.status = status;
    }
  }

  // ============================================
  // Background Task Actions
  // ============================================

  function handleTaskNotification(conversationId: string, notification: TaskNotification): void {
    const state = getConversationState(conversationId);
    const existingTask = state.backgroundTasks.get(notification.taskId);

    if (existingTask) {
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
      state.backgroundTasks.set(notification.taskId, task);
    }
  }

  function removeBackgroundTask(taskId: string): void {
    if (currentConversationId.value) {
      const state = getConversationState(currentConversationId.value);
      state.backgroundTasks.delete(taskId);
    }
  }

  function clearCompletedTasks(): void {
    if (currentConversationId.value) {
      const state = getConversationState(currentConversationId.value);
      for (const [taskId, task] of state.backgroundTasks.entries()) {
        if (task.status !== 'running') {
          state.backgroundTasks.delete(taskId);
        }
      }
    }
  }

  function clearAllBackgroundTasks(conversationId?: string): void {
    const targetId = conversationId ?? currentConversationId.value;
    if (targetId) {
      const state = conversationStates.value.get(targetId);
      if (state) {
        state.backgroundTasks.clear();
      }
    }
  }

  // ============================================
  // Session Usage Actions
  // ============================================

  function updateSessionUsage(conversationId: string, usage: SessionUsage): void {
    const state = getConversationState(conversationId);
    state.sessionUsage = usage;
  }

  function clearSessionUsage(conversationId?: string): void {
    const targetId = conversationId ?? currentConversationId.value;
    if (targetId) {
      const state = conversationStates.value.get(targetId);
      if (state) {
        state.sessionUsage = null;
      }
    }
  }

  // ============================================
  // Resource Tracking Actions
  // ============================================

  function updateActiveQueries(count: number, max: number): void {
    activeQueryCount.value = count;
    maxConcurrentQueries.value = max;
  }

  function updateActiveConversationIds(ids: string[]): void {
    activeConversationIds.value = ids;
  }

  // ============================================
  // Cleanup Actions
  // ============================================

  /**
   * Clear all state for a conversation (e.g., when deleted)
   */
  function clearConversationState(conversationId: string): void {
    conversationStates.value.delete(conversationId);
  }

  /**
   * Reset all per-conversation state
   */
  function resetAllConversationStates(): void {
    conversationStates.value.clear();
  }

  // ============================================
  // Legacy compatibility - these methods work on current conversation
  // They delegate to the conversation-specific versions
  // ============================================

  /** @deprecated Use appendChunk(conversationId, chunk) instead */
  function appendToLastMessage(chunk: string): void {
    if (currentConversationId.value) {
      appendChunk(currentConversationId.value, chunk);
    }
  }

  return {
    // Current view state
    messages,
    currentConversationId,

    // Per-conversation state map (for advanced use)
    conversationStates,

    // Resource tracking
    activeQueryCount,
    maxConcurrentQueries,
    activeConversationIds,

    // Computed (based on current conversation)
    hasMessages,
    hasPendingActions,
    lastMessage,
    hasBackgroundTasks,
    runningTasksCount,
    backgroundTasksList,
    hasSessionUsage,
    totalTokensUsed,
    contextWindowSize,
    contextUsagePercent,
    isLoading,
    error,
    currentStreamingContent,
    pendingActions,
    sessionUsage,
    backgroundTasks,
    isAtResourceLimit,
    canStartNewQuery,

    // Conversation management
    setCurrentConversation,
    isConversationLoading,
    conversationHasPendingActions,
    getConversationState,
    getStreamingContent,

    // Message actions
    addMessage,
    addUserMessage,
    startAssistantMessage,
    appendChunk,
    appendToLastMessage, // Legacy
    finishStreaming,
    clearMessages,
    loadMessages,

    // Loading state
    setLoading,

    // Error actions
    setError,
    clearError,

    // Pending action actions
    addPendingAction,
    removePendingAction,
    updateActionStatus,

    // Background task actions
    handleTaskNotification,
    removeBackgroundTask,
    clearCompletedTasks,
    clearAllBackgroundTasks,

    // Session usage actions
    updateSessionUsage,
    clearSessionUsage,

    // Resource tracking
    updateActiveQueries,
    updateActiveConversationIds,

    // Cleanup
    clearConversationState,
    resetAllConversationStates,
  };
});
