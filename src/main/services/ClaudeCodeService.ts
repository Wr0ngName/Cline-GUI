/**
 * Service for integrating with @anthropic-ai/claude-code
 * Uses the Claude Code SDK query() function with canUseTool callback
 * for custom permission UI integration.
 * Supports both OAuth tokens (Pro/Max) and API keys
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  Query,
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
  SpawnOptions,
  SpawnedProcess,
} from '@anthropic-ai/claude-agent-sdk';
import { app, BrowserWindow } from 'electron';

import {
  IPC_CHANNELS,
  PendingAction,
  ActionResponse,
} from '../../shared/types';
import { MAIN_CONSTANTS } from '../constants/app';
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
  // Track if we received a successful result from the SDK
  // Used to handle process exit errors that occur after successful completion
  private querySucceeded = false;

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
   * Validate OAuth token format
   * Valid OAuth tokens from Claude setup-token have format: sk-ant-oat01-...
   */
  private validateOAuthToken(token: string): { valid: boolean; error?: string } {
    if (!token || token.trim().length === 0) {
      return { valid: false, error: 'Token is empty' };
    }

    // OAuth tokens from setup-token should start with sk-ant-oat01-
    if (!token.startsWith('sk-ant-oat01-')) {
      // Could be a different token format, log warning but allow
      logger.warn('OAuth token does not have expected sk-ant-oat01- prefix', {
        prefix: token.substring(0, 12),
        length: token.length,
      });
    }

    // OAuth tokens are typically 80+ characters
    if (token.length < 50) {
      return { valid: false, error: `Token too short (${token.length} chars, expected 80+)` };
    }

    return { valid: true };
  }

  /**
   * Validate API key format
   * Valid API keys have format: sk-ant-api03-... or sk-...
   */
  private validateApiKey(key: string): { valid: boolean; error?: string } {
    if (!key || key.trim().length === 0) {
      return { valid: false, error: 'API key is empty' };
    }

    if (!key.startsWith('sk-')) {
      return { valid: false, error: 'API key must start with sk-' };
    }

    if (key.length < 40) {
      return { valid: false, error: `API key too short (${key.length} chars)` };
    }

    return { valid: true };
  }

  /**
   * Set up environment variables for Claude Code SDK authentication
   */
  private async setupAuthEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    // Check for OAuth token first (from Claude Pro/Max login)
    const oauthToken = await this.configService.getOAuthToken();
    if (oauthToken) {
      const validation = this.validateOAuthToken(oauthToken);
      if (!validation.valid) {
        logger.error('Invalid OAuth token', { error: validation.error });
        throw new Error(`Invalid OAuth token: ${validation.error}. Please log out and log in again.`);
      }
      env['CLAUDE_CODE_OAUTH_TOKEN'] = oauthToken;
      logger.debug('Using OAuth token for authentication', {
        tokenPrefix: oauthToken.substring(0, 12) + '...',
        tokenLength: oauthToken.length,
      });
      return env;
    }

    // Fall back to API key
    const apiKey = await this.configService.getApiKey();
    if (apiKey) {
      const validation = this.validateApiKey(apiKey);
      if (!validation.valid) {
        logger.error('Invalid API key', { error: validation.error });
        throw new Error(`Invalid API key: ${validation.error}. Please check your API key.`);
      }
      env['ANTHROPIC_API_KEY'] = apiKey;
      logger.debug('Using API key for authentication', {
        keyPrefix: apiKey.substring(0, 10) + '...',
        keyLength: apiKey.length,
      });
      return env;
    }

    logger.warn('No authentication credentials configured');
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

        // Timeout after configured duration (SDK requirement)
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
        }, MAIN_CONSTANTS.CLAUDE.PERMISSION_TIMEOUT_MS);
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
    const baseFields = {
      id: actionId,
      toolName,
      input,
      status: 'pending' as const,
      timestamp: Date.now(),
    };

    switch (toolName) {
      case 'Edit':
        return {
          ...baseFields,
          type: 'file-edit' as const,
          description: `Edit file: ${input.file_path}`,
          details: {
            filePath: input.file_path as string,
            originalContent: input.old_string as string | undefined,
            newContent: input.new_string as string,
          },
        };

      case 'Write':
        return {
          ...baseFields,
          type: 'file-create' as const,
          description: `Write file: ${input.file_path}`,
          details: {
            filePath: input.file_path as string,
            content: input.content as string,
          },
        };

      case 'Bash': {
        const cmd = input.command as string;
        return {
          ...baseFields,
          type: 'bash-command' as const,
          description: `Run command: ${cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd}`,
          details: {
            command: cmd,
            workingDirectory: (input.cwd as string) || '',
          },
        };
      }

      case 'Read':
        return {
          ...baseFields,
          type: 'read-file' as const,
          description: `Read file: ${input.file_path}`,
          details: {
            filePath: input.file_path as string,
          },
        };

      case 'Glob':
        return {
          ...baseFields,
          type: 'read-file' as const,
          description: `Search files: ${input.pattern}`,
          details: {
            filePath: (input.path as string) || '.',
          },
        };

      case 'Grep':
        return {
          ...baseFields,
          type: 'read-file' as const,
          description: `Search content: ${input.pattern}`,
          details: {
            filePath: (input.path as string) || '.',
          },
        };

      default:
        // Handle unknown tools generically
        return {
          ...baseFields,
          type: 'bash-command' as const,
          description: `Tool: ${toolName}`,
          details: {
            command: JSON.stringify(input),
            workingDirectory: '',
          },
        };
    }
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
    // Reset query state
    this.querySucceeded = false;

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
          // Use Electron as Node.js runtime (with Windows bundled Node.js support)
          spawnClaudeCodeProcess: (options: SpawnOptions): SpawnedProcess => {
            let spawnFile: string = process.execPath;
            let spawnArgs: string[] = options.args;
            let extraEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' };

            // On Windows, use bundled Node.js executable instead of ELECTRON_RUN_AS_NODE
            // Windows GUI apps (like Electron) have known stdout capture issues
            // See: https://github.com/electron/electron/issues/4552
            if (process.platform === 'win32') {
              const resourcesPath = process.resourcesPath || path.dirname(app.getAppPath());
              const bundledNodeExe = path.join(resourcesPath, 'node.exe');

              if (fs.existsSync(bundledNodeExe)) {
                logger.info('Windows: using bundled Node.js for SDK spawn', { bundledNodeExe });
                spawnFile = bundledNodeExe;
                extraEnv = {}; // No ELECTRON_RUN_AS_NODE needed with real Node.js

                // CRITICAL: Vanilla Node.js cannot read from .asar archives.
                // Files are unpacked to app.asar.unpacked/ via forge's asar.unpack config.
                // We must rewrite paths from app.asar to app.asar.unpacked for the SDK's cli.js
                spawnArgs = spawnArgs.map(arg => {
                  if (typeof arg === 'string' && arg.includes('app.asar') && !arg.includes('app.asar.unpacked')) {
                    const rewrittenArg = arg.replace(/app\.asar([\/\\])/g, 'app.asar.unpacked$1');
                    if (rewrittenArg !== arg) {
                      logger.debug('Windows: rewrote asar path to unpacked', {
                        original: arg.slice(0, 100),
                        rewritten: rewrittenArg.slice(0, 100),
                      });
                    }
                    return rewrittenArg;
                  }
                  return arg;
                });
              } else {
                logger.warn('Windows: bundled Node.js not found, falling back to ELECTRON_RUN_AS_NODE', {
                  expectedPath: bundledNodeExe,
                });
              }
            }

            // Log full spawn details for debugging
            logger.info('Spawning SDK process', {
              spawnFile,
              args: spawnArgs.slice(0, 3).map(a => a.length > 50 ? a.slice(0, 50) + '...' : a), // First 3 args, truncated
              argsCount: spawnArgs.length,
              cwd: options.cwd,
              platform: process.platform,
              hasOAuthToken: !!options.env?.CLAUDE_CODE_OAUTH_TOKEN,
              hasApiKey: !!options.env?.ANTHROPIC_API_KEY,
            });

            const childProcess: ChildProcess = spawn(spawnFile, spawnArgs, {
              cwd: options.cwd,
              env: {
                ...options.env,
                ...extraEnv,
              },
              stdio: ['pipe', 'pipe', 'pipe'],
              signal: options.signal,
            });

            // Capture stderr for debugging failed spawns
            let stderrData = '';
            if (childProcess.stderr) {
              childProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
                // Log stderr in real-time for debugging
                logger.debug('SDK process stderr', { data: data.toString().slice(0, 500) });
              });
            }

            // Add process lifecycle event handlers for better error handling
            childProcess.on('spawn', () => {
              logger.debug('SDK process spawned successfully', { pid: childProcess.pid });
            });

            childProcess.on('error', (error) => {
              logger.error('SDK process spawn error', { error: error.message, code: (error as NodeJS.ErrnoException).code });
            });

            childProcess.on('exit', (code, signal) => {
              if (code !== 0 && code !== null && signal !== 'SIGTERM' && signal !== 'SIGINT') {
                logger.warn('SDK process exited unexpectedly', {
                  code,
                  signal,
                  pid: childProcess.pid,
                  stderr: stderrData.slice(0, 1000), // Include stderr for debugging
                });
              } else {
                logger.debug('SDK process exited', { code, signal });
              }
            });

            // ChildProcess satisfies SpawnedProcess interface
            return childProcess as SpawnedProcess;
          },
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

      const errorMessage = (error as Error).message || '';

      // Handle process exit errors that occur after successful query completion
      // The SDK throws when the underlying process exits with non-zero code,
      // even if the query completed successfully. This is a known issue.
      if (this.querySucceeded && errorMessage.includes('process exited')) {
        logger.warn('Process exit error after successful query (ignoring)', {
          error: errorMessage,
        });
        // Query succeeded, so emit done instead of error
        this.emitDone();
        return;
      }

      logger.error('Failed to send message', error);

      // Provide user-friendly error messages based on error type
      const userMessage = this.getHumanReadableError(errorMessage);
      this.emitError(userMessage);
    } finally {
      this.abortController = null;
      this.currentQuery = null;
      this.querySucceeded = false; // Reset for next query
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

      case 'result': {
        const resultMsg = message as SDKResultMessage;
        if (resultMsg.subtype === 'success') {
          // Mark query as succeeded - used to handle process exit errors gracefully
          this.querySucceeded = true;
          logger.info('Query completed successfully', {
            numTurns: resultMsg.num_turns,
            duration: resultMsg.duration_ms,
          });
        } else {
          logger.warn('Query ended with non-success', { subtype: resultMsg.subtype });
        }
        break;
      }

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
   * Convert technical error messages to user-friendly messages
   */
  private getHumanReadableError(errorMessage: string): string {
    const lowerError = errorMessage.toLowerCase();

    // Authentication errors
    if (lowerError.includes('401') || lowerError.includes('unauthorized') ||
        lowerError.includes('invalid bearer') || lowerError.includes('invalid token')) {
      return 'Authentication failed. Your login session may have expired. Please log out and log in again.';
    }

    // Rate limiting
    if (lowerError.includes('429') || lowerError.includes('rate limit') ||
        lowerError.includes('too many requests')) {
      return 'Rate limit exceeded. Please wait a moment before sending another message.';
    }

    // Network errors
    if (lowerError.includes('network') || lowerError.includes('econnrefused') ||
        lowerError.includes('enotfound') || lowerError.includes('etimedout')) {
      return 'Network error. Please check your internet connection and try again.';
    }

    // Process exit errors
    if (lowerError.includes('process exited') || lowerError.includes('exit code')) {
      return 'The Claude process ended unexpectedly. Please try again. If the problem persists, restart the application.';
    }

    // API errors
    if (lowerError.includes('500') || lowerError.includes('502') ||
        lowerError.includes('503') || lowerError.includes('504')) {
      return 'Claude service is temporarily unavailable. Please try again in a few moments.';
    }

    // Fallback to original message or generic error
    return errorMessage || 'Failed to communicate with Claude. Please try again.';
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
