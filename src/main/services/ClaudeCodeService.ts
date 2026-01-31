/**
 * Service for integrating with @anthropic-ai/claude-code
 * Handles message sending, streaming, and tool use approval
 */

import { BrowserWindow } from 'electron';
import Anthropic from '@anthropic-ai/sdk';

import {
  ActionDetails,
  ActionType,
  BashCommandDetails,
  ChatMessage,
  FileEditDetails,
  IPC_CHANNELS,
  PendingAction,
  ReadFileDetails,
} from '../../shared/types';
import logger from '../utils/logger';
import ConfigService from './ConfigService';

export class ClaudeCodeService {
  private configService: ConfigService;
  private client: Anthropic | null = null;
  private abortController: AbortController | null = null;
  private pendingActions: Map<string, PendingAction> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor(configService: ConfigService) {
    this.configService = configService;
    logger.info('ClaudeCodeService initialized');
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Initialize or reinitialize the Anthropic client
   */
  private async initClient(): Promise<boolean> {
    const apiKey = await this.configService.getApiKey();

    if (!apiKey) {
      logger.warn('No API key configured');
      return false;
    }

    try {
      this.client = new Anthropic({
        apiKey,
      });
      logger.info('Anthropic client initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Anthropic client', error);
      return false;
    }
  }

  /**
   * Send a message to Claude and stream the response
   */
  async sendMessage(message: string, workingDirectory: string): Promise<void> {
    // Initialize client if needed
    if (!this.client) {
      if (!(await this.initClient())) {
        this.emitError('API key not configured. Please add your API key in Settings.');
        return;
      }
    }

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      logger.info('Sending message to Claude', {
        messageLength: message.length,
        workingDirectory,
      });

      // Build the system prompt with context about the working directory
      const systemPrompt = this.buildSystemPrompt(workingDirectory);

      // Create the message with streaming
      const stream = this.client!.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: message,
          },
        ],
      });

      // Handle streaming events
      stream.on('text', (text) => {
        this.emitChunk(text);
      });

      // Wait for the complete response
      const response = await stream.finalMessage();

      // Process tool use blocks if any
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          await this.handleToolUse(block);
        }
      }

      // Signal completion
      this.emitDone();
      logger.info('Message completed');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.info('Request aborted');
        return;
      }

      logger.error('Failed to send message', error);
      this.emitError((error as Error).message || 'Failed to communicate with Claude');
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Build the system prompt with working directory context
   */
  private buildSystemPrompt(workingDirectory: string): string {
    return `You are Claude, an AI assistant integrated into Cline GUI, a desktop application for coding assistance.

Current working directory: ${workingDirectory}

You can help users with:
- Writing and editing code
- Explaining code and concepts
- Debugging issues
- Suggesting improvements
- Running commands

When you need to perform actions like editing files or running commands, describe what you want to do and the user will approve it through the GUI.

Be concise and helpful. Focus on solving the user's problem efficiently.`;
  }

  /**
   * Handle tool use from Claude's response
   */
  private async handleToolUse(toolBlock: { id: string; name: string; input: unknown }): Promise<void> {
    const action = this.parseToolUse(toolBlock);
    if (action) {
      this.pendingActions.set(action.id, action);
      this.emitToolUse(action);
    }
  }

  /**
   * Parse a tool use block into a PendingAction
   */
  private parseToolUse(toolBlock: { id: string; name: string; input: unknown }): PendingAction | null {
    const { id, name, input } = toolBlock;
    const inputObj = input as Record<string, unknown>;

    let actionType: ActionType;
    let description: string;
    let details: ActionDetails;

    switch (name) {
      case 'edit_file':
      case 'write_file':
        actionType = name === 'edit_file' ? 'file-edit' : 'file-create';
        description = `${name === 'edit_file' ? 'Edit' : 'Create'} file: ${inputObj.path}`;
        details = {
          filePath: inputObj.path as string,
          newContent: inputObj.content as string,
          diff: inputObj.diff as string | undefined,
        } as FileEditDetails;
        break;

      case 'delete_file':
        actionType = 'file-delete';
        description = `Delete file: ${inputObj.path}`;
        details = {
          filePath: inputObj.path as string,
          newContent: '',
        } as FileEditDetails;
        break;

      case 'run_command':
      case 'bash':
        actionType = 'bash-command';
        description = `Run command: ${(inputObj.command as string).slice(0, 50)}...`;
        details = {
          command: inputObj.command as string,
          workingDirectory: (inputObj.cwd as string) || '',
        } as BashCommandDetails;
        break;

      case 'read_file':
        actionType = 'read-file';
        description = `Read file: ${inputObj.path}`;
        details = {
          filePath: inputObj.path as string,
        } as ReadFileDetails;
        break;

      default:
        logger.warn('Unknown tool use', { name });
        return null;
    }

    return {
      id,
      type: actionType,
      description,
      details,
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  /**
   * Approve a pending action
   */
  async approveAction(actionId: string): Promise<void> {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      logger.warn('Action not found for approval', { actionId });
      return;
    }

    action.status = 'approved';
    logger.info('Action approved', { actionId, type: action.type });

    // TODO: Execute the approved action
    // This will be implemented when we have the file system integration
    action.status = 'executed';
    this.pendingActions.delete(actionId);
  }

  /**
   * Reject a pending action
   */
  async rejectAction(actionId: string): Promise<void> {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      logger.warn('Action not found for rejection', { actionId });
      return;
    }

    action.status = 'rejected';
    logger.info('Action rejected', { actionId, type: action.type });
    this.pendingActions.delete(actionId);
  }

  /**
   * Abort the current request
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Request abort requested');
    }
  }

  /**
   * Check if API key is configured
   */
  async hasApiKey(): Promise<boolean> {
    return await this.configService.hasApiKey();
  }

  /**
   * Emit a text chunk to the renderer
   */
  private emitChunk(chunk: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_CHUNK, chunk);
    }
  }

  /**
   * Emit a tool use event to the renderer
   */
  private emitToolUse(action: PendingAction): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_TOOL_USE, action);
    }
  }

  /**
   * Emit an error to the renderer
   */
  private emitError(error: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_ERROR, error);
    }
  }

  /**
   * Emit done event to the renderer
   */
  private emitDone(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_DONE);
    }
  }
}

export default ClaudeCodeService;
