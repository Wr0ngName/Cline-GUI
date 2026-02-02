/**
 * IPC handlers for conversation management
 */

import { ipcMain } from 'electron';

import { Conversation, IPC_CHANNELS } from '../../shared/types';
import ConversationService from '../services/ConversationService';
import logger from '../utils/logger';

export function setupConversationIPC(conversationService: ConversationService): void {
  // List all conversations
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, async () => {
    try {
      logger.debug('IPC: conversation:list');

      // Validate service
      if (!conversationService) {
        throw new Error('Conversation service not initialized');
      }

      const conversations = await conversationService.list();

      if (!Array.isArray(conversations)) {
        throw new Error('Invalid conversation list returned');
      }

      return conversations;
    } catch (error) {
      logger.error('Failed to list conversations', { error });
      throw new Error(`Failed to list conversations: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Get a single conversation
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET, async (_event, id: string) => {
    try {
      logger.debug('IPC: conversation:get', { id });

      // Validate service
      if (!conversationService) {
        throw new Error('Conversation service not initialized');
      }

      // Validate input
      if (typeof id !== 'string') {
        throw new Error('Invalid conversation ID type: must be a string');
      }

      if (!id || !id.trim()) {
        throw new Error('Conversation ID cannot be empty');
      }

      const conversation = await conversationService.get(id);

      if (!conversation) {
        throw new Error(`Conversation not found: ${id}`);
      }

      return conversation;
    } catch (error) {
      logger.error('Failed to get conversation', { error, id });
      throw new Error(`Failed to get conversation: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Save a conversation
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_SAVE, async (_event, conversation: Conversation) => {
    try {
      logger.debug('IPC: conversation:save', { id: conversation?.id });

      // Validate service
      if (!conversationService) {
        throw new Error('Conversation service not initialized');
      }

      // Validate input
      if (!conversation || typeof conversation !== 'object') {
        throw new Error('Invalid conversation: must be an object');
      }

      if (typeof conversation.id !== 'string' || !conversation.id.trim()) {
        throw new Error('Invalid conversation ID');
      }

      if (!Array.isArray(conversation.messages)) {
        throw new Error('Invalid conversation messages: must be an array');
      }

      if (typeof conversation.createdAt !== 'number' || conversation.createdAt <= 0) {
        throw new Error('Invalid conversation createdAt timestamp');
      }

      if (typeof conversation.updatedAt !== 'number' || conversation.updatedAt <= 0) {
        throw new Error('Invalid conversation updatedAt timestamp');
      }

      await conversationService.save(conversation);
    } catch (error) {
      logger.error('Failed to save conversation', { error, id: conversation?.id });
      throw new Error(`Failed to save conversation: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Delete a conversation
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (_event, id: string) => {
    try {
      logger.debug('IPC: conversation:delete', { id });

      // Validate service
      if (!conversationService) {
        throw new Error('Conversation service not initialized');
      }

      // Validate input
      if (typeof id !== 'string') {
        throw new Error('Invalid conversation ID type: must be a string');
      }

      if (!id || !id.trim()) {
        throw new Error('Conversation ID cannot be empty');
      }

      await conversationService.delete(id);
    } catch (error) {
      logger.error('Failed to delete conversation', { error, id });
      throw new Error(`Failed to delete conversation: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  logger.info('Conversation IPC handlers registered');
}
