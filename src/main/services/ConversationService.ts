/**
 * Service for managing conversation persistence
 */

import fs from 'node:fs';
import path from 'node:path';

import { Conversation } from '../../shared/types';
import logger from '../utils/logger';
import { getConversationsPath } from '../utils/paths';

export class ConversationService {
  private conversationsDir: string;

  constructor() {
    this.conversationsDir = getConversationsPath();
    this.ensureDir();
    logger.info('ConversationService initialized', { dir: this.conversationsDir });
  }

  /**
   * Ensure the conversations directory exists
   * @param throwOnError - If true, re-throw errors (used during save operations)
   */
  private ensureDir(throwOnError = false): void {
    try {
      if (!fs.existsSync(this.conversationsDir)) {
        fs.mkdirSync(this.conversationsDir, { recursive: true });
        logger.info('Created conversations directory', { dir: this.conversationsDir });
      }
    } catch (error) {
      logger.error('Failed to create conversations directory', { dir: this.conversationsDir, error });
      if (throwOnError) {
        throw error; // Re-throw to surface the error during critical operations
      }
    }
  }

  /**
   * Get the file path for a conversation
   */
  private getFilePath(id: string): string {
    return path.join(this.conversationsDir, `${id}.json`);
  }

  /**
   * List all conversations (metadata only)
   */
  async list(): Promise<Conversation[]> {
    try {
      const files = await fs.promises.readdir(this.conversationsDir);
      const conversations: Conversation[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        try {
          const content = await fs.promises.readFile(
            path.join(this.conversationsDir, file),
            'utf-8'
          );
          const conversation = JSON.parse(content) as Conversation;
          // Return without full message content for list view
          conversations.push({
            ...conversation,
            messages: [], // Don't include messages in list
          });
        } catch (error) {
          logger.warn('Failed to parse conversation file', { file, error });
        }
      }

      // Sort by updated date, newest first
      conversations.sort((a, b) => b.updatedAt - a.updatedAt);

      return conversations;
    } catch (error) {
      logger.error('Failed to list conversations', error);
      return [];
    }
  }

  /**
   * Get a single conversation by ID
   */
  async get(id: string): Promise<Conversation | null> {
    const filePath = this.getFilePath(id);

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as Conversation;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to get conversation', { id, error });
      }
      return null;
    }
  }

  /**
   * Save a conversation
   */
  async save(conversation: Conversation): Promise<void> {
    const filePath = this.getFilePath(conversation.id);

    try {
      // Ensure directory exists before writing (defensive check, throw on error)
      this.ensureDir(true);

      // Update the updatedAt timestamp
      const updated = {
        ...conversation,
        updatedAt: Date.now(),
      };

      // Generate title from first user message if not set
      if (!updated.title && updated.messages.length > 0) {
        const firstUserMessage = updated.messages.find((m) => m.role === 'user');
        if (firstUserMessage) {
          updated.title = firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
        }
      }

      await fs.promises.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      logger.debug('Conversation saved', { id: conversation.id });
    } catch (error) {
      logger.error('Failed to save conversation', { id: conversation.id, error });
      throw error;
    }
  }

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<void> {
    const filePath = this.getFilePath(id);

    try {
      await fs.promises.unlink(filePath);
      logger.info('Conversation deleted', { id });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to delete conversation', { id, error });
        throw error;
      }
    }
  }

  /**
   * Create a new conversation
   */
  create(workingDirectory: string): Conversation {
    return {
      id: this.generateId(),
      title: '',
      workingDirectory,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Generate a unique conversation ID
   */
  private generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `conv_${timestamp}_${random}`;
  }
}

export default ConversationService;
