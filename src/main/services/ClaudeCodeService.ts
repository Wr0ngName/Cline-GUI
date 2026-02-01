/**
 * Service for integrating with @anthropic-ai/claude-code
 * Uses the Claude Code SDK query() function with canUseTool callback
 * for custom permission UI integration.
 * Supports both OAuth tokens (Pro/Max) and API keys
 */

import { BrowserWindow } from 'electron';
import { query } from '@anthropic-ai/claude-code';
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  Query,
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-code';

import {
  ActionType,
  BashCommandDetails,
  FileEditDetails,
  IPC_CHANNELS,
  PendingAction,
  ReadFileDetails,
  ActionResponse,
} from '../../shared/types';
import logger from '../utils/logger';
import ConfigService from './ConfigService';

interface PendingPermission {
  actionId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  suggestions?: PermissionUpdate[];
}

export class ClaudeCodeService {
  private configService: ConfigService;
  private abortController: AbortController | null = null;
  private currentQuery: Query | null = null;
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private actionCounter = 0;

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
  private async hasAuthInternal(): Promise<boolean> {
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
   * Generate a unique action ID
   */
  private generateActionId(): string {
    return `action_${Date.now()}_${++this.actionCounter}`;
  }

  /**
   * Create the canUseTool callback for custom permission handling
   * This is called by the SDK when Claude wants to use a tool
   */
  private createCanUseToolCallback(): CanUseTool {
    return async (toolName, input, options): Promise<PermissionResult> => {
      const actionId = this.generateActionId();

      logger.info('Tool permission requested', { actionId, toolName, input });

      // Check if operation was aborted
      if (options.signal.aborted) {
        return {
          behavior: 'deny',
          message: 'Operation was cancelled',
          interrupt: true,
        };
      }

      // Auto-approve read operations if configured
      const config = await this.configService.getConfig();
      if (config.autoApproveReads && this.isReadOnlyTool(toolName)) {
        logger.debug('Auto-approving read operation', { toolName });
        return {
          behavior: 'allow',
          updatedInput: input,
        };
      }

      // Create pending action for UI
      const action = this.createPendingAction(actionId, toolName, input);
      if (!action) {
        logger.warn('Could not create action for tool', { toolName });
        return {
          behavior: 'deny',
          message: `Unknown tool: ${toolName}`,
        };
      }

      // Send to renderer for user approval
      this.emitToolUse(action);

      // Create promise that will be resolved when user responds
      return new Promise<PermissionResult>((resolve, reject) => {
        const pendingPermission: PendingPermission = {
          actionId,
          toolName,
          input,
          resolve,
          reject,
          suggestions: options.suggestions,
        };

        this.pendingPermissions.set(actionId, pendingPermission);

        // Set up abort handler
        options.signal.addEventListener('abort', () => {
          const pending = this.pendingPermissions.get(actionId);
          if (pending) {
            this.pendingPermissions.delete(actionId);
            resolve({
              behavior: 'deny',
              message: 'Operation was cancelled',
              interrupt: true,
            });
          }
        });

        // Timeout after 60 seconds (SDK requirement)
        setTimeout(() => {
          const pending = this.pendingPermissions.get(actionId);
          if (pending) {
            this.pendingPermissions.delete(actionId);
            logger.warn('Permission request timed out', { actionId });
            resolve({
              behavior: 'deny',
              message: 'Permission request timed out',
              interrupt: false,
            });
          }
        }, 60000);
      });
    };
  }

  /**
   * Check if a tool is read-only (safe to auto-approve)
   */
  private isReadOnlyTool(toolName: string): boolean {
    const readOnlyTools = ['Read', 'Glob', 'Grep', 'LS', 'ListFiles'];
    return readOnlyTools.includes(toolName);
  }

  /**
   * Create a PendingAction from tool info for UI display
   */
  private createPendingAction(
    actionId: string,
    toolName: string,
    input: Record<string, unknown>
  ): PendingAction | null {
    let actionType: ActionType;
    let description: string;
    let details: FileEditDetails | BashCommandDetails | ReadFileDetails;

    switch (toolName) {
      case 'Edit':
        actionType = 'file-edit';
        description = `Edit file: ${input.file_path}`;
        details = {
          filePath: input.file_path as string,
          originalContent: input.old_string as string | undefined,
          newContent: input.new_string as string,
        } as FileEditDetails;
        break;

      case 'Write':
        actionType = 'file-create';
        description = `Write file: ${input.file_path}`;
        details = {
          filePath: input.file_path as string,
          newContent: input.content as string,
        } as FileEditDetails;
        break;

      case 'Bash':
        actionType = 'bash-command';
        const cmd = input.command as string;
        description = `Run command: ${cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd}`;
        details = {
          command: cmd,
          workingDirectory: (input.cwd as string) || '',
        } as BashCommandDetails;
        break;

      case 'Read':
        actionType = 'read-file';
        description = `Read file: ${input.file_path}`;
        details = {
          filePath: input.file_path as string,
        } as ReadFileDetails;
        break;

      case 'Glob':
        actionType = 'read-file';
        description = `Search files: ${input.pattern}`;
        details = {
          filePath: (input.path as string) || '.',
        } as ReadFileDetails;
        break;

      case 'Grep':
        actionType = 'read-file';
        description = `Search content: ${input.pattern}`;
        details = {
          filePath: (input.path as string) || '.',
        } as ReadFileDetails;
        break;

      default:
        // Handle unknown tools generically
        actionType = 'bash-command';
        description = `Tool: ${toolName}`;
        details = {
          command: JSON.stringify(input),
          workingDirectory: '',
        } as BashCommandDetails;
    }

    return {
      id: actionId,
      type: actionType,
      toolName,
      description,
      details,
      input,
      status: 'pending',
      timestamp: Date.now(),
    };
  }

  /**
   * Handle action response from renderer (approve/reject)
   */
  handleActionResponse(response: ActionResponse): void {
    const pending = this.pendingPermissions.get(response.actionId);
    if (!pending) {
      logger.warn('No pending permission found for action', { actionId: response.actionId });
      return;
    }

    this.pendingPermissions.delete(response.actionId);

    if (response.approved) {
      logger.info('Action approved by user', {
        actionId: response.actionId,
        toolName: pending.toolName,
        alwaysAllow: response.alwaysAllow,
      });

      const result: PermissionResult = {
        behavior: 'allow',
        updatedInput: response.updatedInput || pending.input,
      };

      // Include permission updates if user chose "always allow"
      if (response.alwaysAllow && pending.suggestions) {
        result.updatedPermissions = pending.suggestions;
      }

      pending.resolve(result);
    } else {
      logger.info('Action rejected by user', {
        actionId: response.actionId,
        toolName: pending.toolName,
        message: response.denyMessage,
      });

      pending.resolve({
        behavior: 'deny',
        message: response.denyMessage || 'User rejected this action',
        interrupt: !response.denyMessage, // Interrupt if no guidance provided
      });
    }
  }

  /**
   * Send a message to Claude using the Claude Code SDK
   */
  async sendMessage(message: string, workingDirectory: string): Promise<void> {
    // Check if auth is configured
    if (!(await this.hasAuthInternal())) {
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

      // Use Claude Code SDK query function with canUseTool callback
      const queryIterator = query({
        prompt: message,
        options: {
          cwd: workingDirectory,
          abortController: this.abortController,
          env: authEnv,
          // Use canUseTool for custom permission UI
          canUseTool: this.createCanUseToolCallback(),
          // Stream partial messages for real-time updates
          includePartialMessages: true,
        },
      });

      this.currentQuery = queryIterator;

      // Process the async generator
      for await (const sdkMessage of queryIterator) {
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
      // Clear any pending permissions
      this.pendingPermissions.clear();
    }
  }

  /**
   * Handle messages from the Claude Code SDK
   */
  private async handleSDKMessage(message: SDKMessage): Promise<void> {
    switch (message.type) {
      case 'assistant':
        await this.processAssistantMessage(message as SDKAssistantMessage);
        break;

      case 'result':
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
        this.handleStreamEvent(message);
        break;

      case 'system':
        logger.debug('System message', { subtype: (message as { subtype?: string }).subtype });
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
      }
      // Tool use is handled via canUseTool callback, not here
    }
  }

  /**
   * Handle streaming events for real-time text updates
   */
  private handleStreamEvent(message: SDKMessage): void {
    const event = (message as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event;
    if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
      this.emitChunk(event.delta.text || '');
    }
  }

  /**
   * Approve a pending action (called from IPC handler)
   */
  async approveAction(actionId: string, updatedInput?: Record<string, unknown>, alwaysAllow?: boolean): Promise<void> {
    this.handleActionResponse({
      actionId,
      approved: true,
      updatedInput,
      alwaysAllow,
    });
  }

  /**
   * Reject a pending action (called from IPC handler)
   */
  async rejectAction(actionId: string, message?: string): Promise<void> {
    this.handleActionResponse({
      actionId,
      approved: false,
      denyMessage: message,
    });
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
    // Clear pending permissions
    for (const [, pending] of this.pendingPermissions) {
      pending.resolve({
        behavior: 'deny',
        message: 'Operation was cancelled',
        interrupt: true,
      });
    }
    this.pendingPermissions.clear();
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
   * Emit a tool use event to the renderer for permission request
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
