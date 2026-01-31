/**
 * Service for integrating with @anthropic-ai/claude-code
 * Uses the Claude Code SDK query() function for full Claude Code capabilities
 * Supports both OAuth tokens (Pro/Max) and API keys
 */

import { BrowserWindow } from 'electron';
import { query } from '@anthropic-ai/claude-code';
import type { SDKMessage, SDKAssistantMessage, SDKResultMessage, Query } from '@anthropic-ai/claude-code';

import {
  ActionType,
  BashCommandDetails,
  FileEditDetails,
  IPC_CHANNELS,
  PendingAction,
  ReadFileDetails,
} from '../../shared/types';
import logger from '../utils/logger';
import ConfigService from './ConfigService';

export class ClaudeCodeService {
  private configService: ConfigService;
  private abortController: AbortController | null = null;
  private currentQuery: Query | null = null;
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
   * Check if authentication is configured (OAuth or API key)
   */
  private async hasAuth(): Promise<boolean> {
    return await this.configService.hasAuth();
  }

  /**
   * Set up environment variables for Claude Code SDK authentication
   */
  private async setupAuthEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    // Check for OAuth token first (from Claude Pro/Max login)
    const oauthToken = await this.configService.getOAuthToken();
    if (oauthToken) {
      env['CLAUDE_CODE_OAUTH_TOKEN'] = oauthToken;
      logger.debug('Using OAuth token for authentication');
      return env;
    }

    // Fall back to API key
    const apiKey = await this.configService.getApiKey();
    if (apiKey) {
      env['ANTHROPIC_API_KEY'] = apiKey;
      logger.debug('Using API key for authentication');
      return env;
    }

    return env;
  }

  /**
   * Send a message to Claude using the Claude Code SDK
   */
  async sendMessage(message: string, workingDirectory: string): Promise<void> {
    // Check if auth is configured
    if (!(await this.hasAuth())) {
      this.emitError('Not authenticated. Please login with your Claude account or add an API key in Settings.');
      return;
    }

    // Create abort controller for this request
    this.abortController = new AbortController();

    try {
      logger.info('Sending message to Claude Code SDK', {
        messageLength: message.length,
        workingDirectory,
      });

      // Set up authentication environment
      const authEnv = await this.setupAuthEnv();

      // Use Claude Code SDK query function
      const queryIterator = query({
        prompt: message,
        options: {
          cwd: workingDirectory,
          abortController: this.abortController,
          env: authEnv,
          // Auto-approve read operations for better UX
          permissionMode: 'default',
          // Stream partial messages for real-time updates
          includePartialMessages: true,
        },
      });

      this.currentQuery = queryIterator;

      // Process the async generator
      for await (const sdkMessage of queryIterator) {
        // Handle different message types
        await this.handleSDKMessage(sdkMessage);
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
      this.currentQuery = null;
    }
  }

  /**
   * Handle messages from the Claude Code SDK
   */
  private async handleSDKMessage(message: SDKMessage): Promise<void> {
    switch (message.type) {
      case 'assistant':
        // Process assistant message content blocks
        await this.processAssistantMessage(message as SDKAssistantMessage);
        break;

      case 'result':
        // Log result info
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.subtype === 'success') {
          logger.info('Query completed successfully', {
            numTurns: resultMsg.num_turns,
            duration: resultMsg.duration_ms,
          });
        } else {
          logger.warn('Query ended with non-success', { subtype: resultMsg.subtype });
        }
        break;

      case 'stream_event':
        // Handle streaming text updates
        this.handleStreamEvent(message);
        break;

      case 'system':
        logger.debug('System message', { subtype: (message as any).subtype });
        break;

      default:
        logger.debug('Unknown SDK message type', { type: message.type });
    }
  }

  /**
   * Process assistant message and extract text/tool use
   */
  private async processAssistantMessage(message: SDKAssistantMessage): Promise<void> {
    const content = message.message.content;

    for (const block of content) {
      if (block.type === 'text') {
        this.emitChunk(block.text);
      } else if (block.type === 'tool_use') {
        await this.handleToolUse({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
  }

  /**
   * Handle streaming events for real-time text updates
   */
  private handleStreamEvent(message: SDKMessage): void {
    const event = (message as any).event;
    if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
      this.emitChunk(event.delta.text);
    }
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
  async abort(): Promise<void> {
    if (this.currentQuery) {
      try {
        await this.currentQuery.interrupt();
        logger.info('Query interrupted via SDK');
      } catch (error) {
        logger.debug('Could not interrupt query', error);
      }
    }
    if (this.abortController) {
      this.abortController.abort();
      logger.info('Request abort requested');
    }
  }

  /**
   * Check if any authentication is configured
   */
  async hasAuth(): Promise<boolean> {
    return await this.configService.hasAuth();
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
