/**
 * Composable for Claude chat functionality
 */

import { onMounted, onUnmounted, ref } from 'vue';

import type { SlashCommandInfo } from '@shared/types';

import { useChatStore } from '../stores/chat';
import { useFilesStore } from '../stores/files';
import { useSettingsStore } from '../stores/settings';
import { logger } from '../utils/logger';

export function useClaudeChat() {
  const chatStore = useChatStore();
  const filesStore = useFilesStore();
  const settingsStore = useSettingsStore();

  // Cleanup functions for IPC listeners
  let cleanupChunk: (() => void) | null = null;
  let cleanupToolUse: (() => void) | null = null;
  let cleanupError: (() => void) | null = null;
  let cleanupDone: (() => void) | null = null;
  let cleanupSlashCommands: (() => void) | null = null;

  // Available slash commands from the SDK (dynamically populated)
  const slashCommands = ref<SlashCommandInfo[]>([]);

  /**
   * Check if a message is a slash command
   */
  function isSlashCommand(message: string): SlashCommandInfo | null {
    const trimmed = message.trim();
    if (!trimmed.startsWith('/')) return null;

    // Extract command name (without arguments)
    const cmdPart = trimmed.split(' ')[0].slice(1); // Remove leading /

    return slashCommands.value.find((cmd) => cmd.name === cmdPart) || null;
  }

  /**
   * Load available slash commands from the SDK
   */
  async function loadSlashCommands(): Promise<void> {
    try {
      const commands = await window.electron.claude.getCommands();
      slashCommands.value = commands;
      logger.debug('Loaded slash commands', { count: commands.length });
    } catch (err) {
      logger.warn('Failed to load slash commands', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Send a message to Claude
   */
  async function sendMessage(content: string) {
    if (!content.trim()) {
      return;
    }

    // Check prerequisites
    if (!settingsStore.hasAuth) {
      chatStore.setError('Please log in or configure your API key in Settings');
      return;
    }

    if (!filesStore.workingDirectory) {
      chatStore.setError('Please select a working directory');
      return;
    }

    // Clear any previous error
    chatStore.clearError();

    // Add user message to chat
    chatStore.addUserMessage(content);

    // Check if this is a slash command
    const slashCmd = isSlashCommand(content);
    if (slashCmd) {
      // For slash commands, log what's happening
      // The SDK handles these internally
      logger.info('Slash command detected', {
        command: content.split(' ')[0],
        name: slashCmd.name,
        description: slashCmd.description,
      });
    }

    // Start assistant message for streaming
    chatStore.startAssistantMessage();
    chatStore.setLoading(true);

    try {
      // Send message via IPC
      await window.electron.claude.send(content, filesStore.workingDirectory);
    } catch (err) {
      logger.error('Failed to send message', err);
      chatStore.setError('Failed to send message to Claude');
      chatStore.setLoading(false);
    }
  }

  /**
   * Approve a pending action
   * @param actionId - The action to approve
   * @param alwaysAllow - If true, automatically approve similar actions in the future
   */
  async function approveAction(actionId: string, alwaysAllow?: boolean) {
    try {
      chatStore.updateActionStatus(actionId, 'approved');
      await window.electron.claude.approve(actionId, undefined, alwaysAllow);
      chatStore.removePendingAction(actionId);
    } catch (err) {
      logger.error('Failed to approve action', err);
      chatStore.setError('Failed to approve action');
    }
  }

  /**
   * Reject a pending action
   */
  async function rejectAction(actionId: string) {
    try {
      chatStore.updateActionStatus(actionId, 'rejected');
      await window.electron.claude.reject(actionId);
      chatStore.removePendingAction(actionId);
    } catch (err) {
      logger.error('Failed to reject action', err);
      chatStore.setError('Failed to reject action');
    }
  }

  /**
   * Abort the current request
   */
  async function abort() {
    try {
      await window.electron.claude.abort();
      chatStore.setLoading(false);
      chatStore.finishStreaming();
    } catch (err) {
      logger.error('Failed to abort', err);
    }
  }

  /**
   * Clear the chat
   */
  function clearChat() {
    chatStore.clearMessages();
  }

  /**
   * Set up IPC event listeners
   */
  function setupListeners() {
    // Handle streaming chunks
    cleanupChunk = window.electron.claude.onChunk((chunk) => {
      chatStore.appendToLastMessage(chunk);
    });

    // Handle tool use requests
    cleanupToolUse = window.electron.claude.onToolUse((action) => {
      chatStore.addPendingAction(action);
    });

    // Handle errors
    cleanupError = window.electron.claude.onError((error) => {
      chatStore.setError(error);
      chatStore.setLoading(false);
      chatStore.finishStreaming();
    });

    // Handle completion
    cleanupDone = window.electron.claude.onDone(() => {
      chatStore.setLoading(false);
      chatStore.finishStreaming();
    });

    // Handle slash commands updates from SDK
    cleanupSlashCommands = window.electron.claude.onSlashCommands((commands) => {
      slashCommands.value = commands;
      logger.debug('Received slash commands from SDK', { count: commands.length });
    });
  }

  /**
   * Clean up IPC event listeners
   */
  function cleanupListeners() {
    if (cleanupChunk) {
      cleanupChunk();
      cleanupChunk = null;
    }
    if (cleanupToolUse) {
      cleanupToolUse();
      cleanupToolUse = null;
    }
    if (cleanupError) {
      cleanupError();
      cleanupError = null;
    }
    if (cleanupDone) {
      cleanupDone();
      cleanupDone = null;
    }
    if (cleanupSlashCommands) {
      cleanupSlashCommands();
      cleanupSlashCommands = null;
    }
  }

  // Set up listeners on mount, clean up on unmount
  onMounted(() => {
    setupListeners();
    // Load available slash commands
    loadSlashCommands();
  });

  onUnmounted(() => {
    cleanupListeners();
  });

  return {
    // Actions
    sendMessage,
    approveAction,
    rejectAction,
    abort,
    clearChat,

    // Store refs (for convenience)
    messages: chatStore.messages,
    pendingActions: chatStore.pendingActions,
    isLoading: chatStore.isLoading,
    error: chatStore.error,

    // Slash commands from SDK
    slashCommands,
  };
}
