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
    logger.debug('IPC: conversation:list');
    return await conversationService.list();
  });

  // Get a single conversation
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET, async (_event, id: string) => {
    logger.debug('IPC: conversation:get', { id });
    return await conversationService.get(id);
  });

  // Save a conversation
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_SAVE, async (_event, conversation: Conversation) => {
    logger.debug('IPC: conversation:save', { id: conversation.id });
    await conversationService.save(conversation);
  });

  // Delete a conversation
  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, async (_event, id: string) => {
    logger.debug('IPC: conversation:delete', { id });
    await conversationService.delete(id);
  });

  logger.info('Conversation IPC handlers registered');
}
