/**
 * Service for integrating with @anthropic-ai/claude-code
 *
 * Uses the Claude Code SDK query() function with canUseTool callback
 * for custom permission UI integration.
 * Supports both OAuth tokens (Pro/Max) and API keys.
 *
 * MULTI-INSTANCE SUPPORT:
 * This service supports multiple concurrent SDK queries, one per conversation.
 * Each conversation gets its own Query instance, AbortController, and message handler.
 * Resource limits prevent memory exhaustion (default: 5 concurrent queries).
 *
 * This service orchestrates the following modules:
 * - PermissionManager: Handles tool permission requests
 * - SDKMessageHandler: Processes SDK messages
 * - AuthValidator: Validates authentication credentials
 * - ErrorHandler: Converts errors to user-friendly messages
 */

import { spawn, type ChildProcess } from 'node:child_process';

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SpawnOptions,
  SpawnedProcess,
} from '@anthropic-ai/claude-agent-sdk';
import { BrowserWindow } from 'electron';

import {
  IPC_CHANNELS,
  PendingAction,
  ActionResponse,
  SlashCommandInfo,
  ModelInfo,
  TaskNotification,
  SessionUsage,
  MAX_CONCURRENT_QUERIES,
} from '../../shared/types';
import { createSender } from '../utils/ipc-helpers';
import logger from '../utils/logger';
import { WindowsPaths } from '../utils/resourcePaths';

import ConfigService from './ConfigService';
import NotificationService from './NotificationService';
import {
  PermissionManager,
  SDKMessageHandler,
  AuthValidator,
  ErrorHandler,
  BuiltinCommandHandler,
} from './claude';

/**
 * Represents an active query instance for a specific conversation
 */
interface QueryInstance {
  conversationId: string;
  query: Query;
  abortController: AbortController;
  messageHandler: SDKMessageHandler;
  permissionManager: PermissionManager;
  workingDirectory: string;
  startedAt: number;
  originalEnv: Record<string, string | undefined>;
}

export class ClaudeCodeService {
  private authValidator: AuthValidator;
  private errorHandler: ErrorHandler;
  private builtinCommandHandler: BuiltinCommandHandler;

  // Multi-instance support: Map of conversation ID to active query
  private activeQueries: Map<string, QueryInstance> = new Map();
  private maxConcurrentQueries: number = MAX_CONCURRENT_QUERIES;

  // Bound sender function for DRY IPC communication
  private send: (channel: string, ...args: unknown[]) => boolean;
  // Cached models list (shared across all queries)
  private cachedModels: ModelInfo[] = [];
  // Cached slash commands (shared across all queries)
  private cachedSlashCommands: SlashCommandInfo[] = [];
  private configService: ConfigService;
  private notificationService: NotificationService;

  constructor(configService: ConfigService, getMainWindow: () => BrowserWindow | null, notificationService: NotificationService) {
    // Create bound sender using the provided window getter
    this.send = createSender(getMainWindow);

    // Store config service reference for model selection
    this.configService = configService;
    this.notificationService = notificationService;

    // Initialize shared modules (not per-query)
    this.authValidator = new AuthValidator(configService);
    this.errorHandler = new ErrorHandler();

    // Builtin command handler is shared (for /help, /clear, etc.)
    this.builtinCommandHandler = new BuiltinCommandHandler({
      getSlashCommands: () => this.cachedSlashCommands,
      // Note: builtin commands need conversationId, handled in sendMessage
      onChunk: () => {}, // Will be overridden per-call
      onDone: () => {},  // Will be overridden per-call
    });

    logger.info('ClaudeCodeService initialized with multi-instance support', {
      maxConcurrentQueries: this.maxConcurrentQueries,
    });
  }

  /**
   * Handle action response from renderer (approve/reject)
   * Routes to the correct conversation's permission manager
   */
  handleActionResponse(conversationId: string, response: ActionResponse): void {
    const instance = this.activeQueries.get(conversationId);
    if (instance) {
      instance.permissionManager.handleActionResponse(response);
    } else {
      logger.warn('Cannot handle action response - no active query for conversation', {
        conversationId,
        actionId: response.actionId,
      });
    }
  }

  /**
   * Get the count of active queries
   */
  getActiveQueryCount(): number {
    return this.activeQueries.size;
  }

  /**
   * Check if a specific conversation has an active query
   */
  isConversationActive(conversationId: string): boolean {
    return this.activeQueries.has(conversationId);
  }

  /**
   * Get list of active conversation IDs
   */
  getActiveConversationIds(): string[] {
    return Array.from(this.activeQueries.keys());
  }

  /**
   * Get maximum concurrent queries limit
   */
  getMaxConcurrentQueries(): number {
    return this.maxConcurrentQueries;
  }

  /**
   * Emit active query count to renderer
   */
  private emitActiveQueryCount(): void {
    this.send(IPC_CHANNELS.CLAUDE_ACTIVE_QUERIES, this.activeQueries.size, this.maxConcurrentQueries);
  }

  /**
   * Send a message to Claude using the Claude Code SDK
   * @param conversationId - The conversation this message belongs to
   * @param message - The message content
   * @param workingDirectory - The working directory for file operations
   * @param resumeSessionId - Optional SDK session ID to resume conversation context
   */
  async sendMessage(conversationId: string, message: string, workingDirectory: string, resumeSessionId?: string): Promise<void> {
    // Check resource limits
    if (this.activeQueries.size >= this.maxConcurrentQueries && !this.activeQueries.has(conversationId)) {
      const errorMsg = `Maximum concurrent conversations (${this.maxConcurrentQueries}) reached. ` +
        `Please wait for another conversation to complete or cancel it.`;
      logger.warn('Resource limit reached', {
        currentCount: this.activeQueries.size,
        maxCount: this.maxConcurrentQueries,
        conversationId,
      });
      this.emitError(conversationId, errorMsg);
      return;
    }

    // If this conversation already has an active query, abort it first
    if (this.activeQueries.has(conversationId)) {
      logger.info('Aborting existing query for conversation before starting new one', { conversationId });
      await this.abort(conversationId);
    }

    // Check if this is a built-in command that must be handled locally
    // (SDK doesn't support built-in CLI commands like /help, /clear, etc.)
    if (this.builtinCommandHandler.isBuiltinCommand(message)) {
      const result = this.builtinCommandHandler.handleCommand(message);
      if (result.handled) {
        logger.info('Handled built-in command locally', {
          conversationId,
          command: message.trim().split(' ')[0],
          hasAction: !!result.action,
        });
        if (result.response) {
          this.emitChunk(conversationId, result.response);
        }
        // Emit special action if needed (e.g., clear conversation)
        if (result.action) {
          this.send(IPC_CHANNELS.CLAUDE_COMMAND_ACTION, result.action);
        }
        this.emitDone(conversationId);
        return;
      }
    }

    // Check if this is a slash command (starts with /)
    const isSlashCommand = message.trim().startsWith('/');

    // Check if auth is configured
    if (!(await this.authValidator.hasAuth())) {
      this.emitError(conversationId, 'Not authenticated. Please login with your Claude account or add an API key in Settings.');
      return;
    }

    // Create abort controller for this request
    const abortController = new AbortController();

    // Create per-conversation permission manager
    const permissionManager = new PermissionManager(
      this.configService,
      (action: PendingAction) => this.emitToolUse(conversationId, action)
    );

    // Create per-conversation message handler
    const messageHandler = new SDKMessageHandler({
      onChunk: (chunk: string) => this.emitChunk(conversationId, chunk),
      onSlashCommands: (commands: SlashCommandInfo[]) => {
        this.cachedSlashCommands = commands;
        this.emitSlashCommands(conversationId, commands);
      },
      onTaskNotification: (notification: TaskNotification) => this.emitTaskNotification(conversationId, notification),
      onUsageUpdate: (usage: SessionUsage) => this.emitUsageUpdate(conversationId, usage),
      onSessionId: (sessionId: string) => this.emitSessionId(conversationId, sessionId),
    });

    if (isSlashCommand) {
      messageHandler.markSlashCommandSent();
      logger.debug('Detected slash command', { conversationId, command: message.trim().split(' ')[0] });
    }

    // Track original env values for cleanup
    const originalEnv: Record<string, string | undefined> = {};

    try {
      // Get selected model from config
      const selectedModel = await this.configService.getSelectedModel();

      logger.info('Sending message to Claude Code SDK', {
        conversationId,
        messageLength: message.length,
        workingDirectory,
        isSlashCommand,
        model: selectedModel || '(SDK default)',
        activeQueries: this.activeQueries.size,
      });

      // Set up authentication environment
      const authEnv = await this.authValidator.setupAuthEnv();

      // CRITICAL: Set auth env vars in actual process.env BEFORE calling query()
      Object.entries(authEnv).forEach(([key, value]) => {
        originalEnv[key] = process.env[key];
        process.env[key] = value;
      });

      // Use Claude Code SDK query function with canUseTool callback
      const queryIterator = query({
        prompt: message,
        options: {
          cwd: workingDirectory,
          abortController,
          env: authEnv,
          canUseTool: permissionManager.createCanUseToolCallback(),
          includePartialMessages: true,
          ...(selectedModel ? { model: selectedModel } : {}),
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
          spawnClaudeCodeProcess: (options: SpawnOptions): SpawnedProcess => {
            return this.spawnSDKProcess(options, conversationId);
          },
        },
      });

      logger.info('SDK query options', {
        conversationId,
        hasResume: !!resumeSessionId,
        resumeSessionId: resumeSessionId?.slice(0, 20) + (resumeSessionId && resumeSessionId.length > 20 ? '...' : ''),
      });

      // Create and store the query instance
      const instance: QueryInstance = {
        conversationId,
        query: queryIterator,
        abortController,
        messageHandler,
        permissionManager,
        workingDirectory,
        startedAt: Date.now(),
        originalEnv,
      };
      this.activeQueries.set(conversationId, instance);
      this.emitActiveQueryCount();

      // Fetch full slash command details and available models
      this.fetchAndEmitSlashCommandDetails(conversationId, queryIterator);
      this.fetchAndCacheModels(queryIterator);

      // Process the async generator
      for await (const sdkMessage of queryIterator) {
        // Check if query was aborted while processing
        if (!this.activeQueries.has(conversationId)) {
          logger.debug('Query was aborted, stopping message processing', { conversationId });
          break;
        }
        await messageHandler.handleMessage(sdkMessage);
      }

      // Signal completion (only if not already cleaned up)
      if (this.activeQueries.has(conversationId)) {
        this.emitDone(conversationId);
        logger.info('Message completed', { conversationId });
      }
    } catch (error) {
      this.handleQueryError(conversationId, error as Error, messageHandler);
    } finally {
      this.cleanupQuery(conversationId);
    }
  }

  /**
   * Fetch full slash command details and emit to renderer.
   */
  private async fetchAndEmitSlashCommandDetails(conversationId: string, queryIterator: Query): Promise<void> {
    try {
      const commands = await queryIterator.supportedCommands();
      const slashCommands = commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        argumentHint: cmd.argumentHint,
      }));

      // Update cached commands
      this.cachedSlashCommands = slashCommands;

      // Emit to renderer
      this.emitSlashCommands(conversationId, slashCommands);
      logger.info('Emitted full slash command details', {
        conversationId,
        count: slashCommands.length,
      });
    } catch (error) {
      logger.warn('Failed to fetch and emit slash command details', { conversationId, error });
    }
  }

  /**
   * Spawn the SDK process with platform-specific handling
   */
  private spawnSDKProcess(options: SpawnOptions, conversationId: string): SpawnedProcess {
    let spawnFile: string = process.execPath;
    let spawnArgs: string[] = options.args;
    let extraEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' };

    // On Windows, use bundled Node.js executable instead of ELECTRON_RUN_AS_NODE
    if (process.platform === 'win32') {
      const result = this.getWindowsSpawnConfig(options, spawnArgs);
      spawnFile = result.spawnFile;
      spawnArgs = result.spawnArgs;
      extraEnv = result.extraEnv;
    }

    logger.debug('Spawning SDK process', {
      conversationId,
      argsCount: spawnArgs.length,
      cwd: options.cwd,
      hasOAuthToken: !!options.env?.CLAUDE_CODE_OAUTH_TOKEN,
      hasApiKey: !!options.env?.ANTHROPIC_API_KEY,
    });

    const childProcess: ChildProcess = spawn(spawnFile, spawnArgs, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        ...extraEnv,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: options.signal,
    });

    this.setupProcessLogging(childProcess, conversationId);

    return childProcess as SpawnedProcess;
  }

  /**
   * Get Windows-specific spawn configuration
   */
  private getWindowsSpawnConfig(
    _options: SpawnOptions,
    originalArgs: string[]
  ): { spawnFile: string; spawnArgs: string[]; extraEnv: Record<string, string> } {
    const bundledNodeExe = WindowsPaths.getBundledNodeExe();
    const bundledGitBash = WindowsPaths.getBashExe();
    const extraEnv: Record<string, string> = {};

    // Check for bundled Git Bash (required by Claude Code CLI on Windows)
    if (WindowsPaths.hasBundledGitBash()) {
      logger.info('Windows: using bundled Git Bash', { bundledGitBash });
      extraEnv.CLAUDE_CODE_GIT_BASH_PATH = bundledGitBash;

      // Add Git Bash bin directories to PATH so cygpath and other utilities are found
      // The SDK spawns bash but doesn't set up the PATH correctly
      extraEnv.PATH = WindowsPaths.buildEnhancedPath();
      logger.info('Windows: added Git Bash to PATH', {
        gitBashBinDir: WindowsPaths.getGitBashBinDir(),
        gitBashMingwBin: WindowsPaths.getGitBashMingwBin()
      });
    } else {
      logger.warn('Windows: bundled Git Bash not found', { expectedPath: bundledGitBash });
    }

    if (WindowsPaths.hasBundledNode()) {
      logger.info('Windows: using bundled Node.js for SDK spawn', { bundledNodeExe });

      const spawnArgs = originalArgs.map(arg => {
        if (typeof arg === 'string' && arg.includes('app.asar') && !arg.includes('app.asar.unpacked')) {
          return arg.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
        }
        return arg;
      });

      return {
        spawnFile: bundledNodeExe,
        spawnArgs,
        extraEnv,
      };
    }

    logger.warn('Windows: bundled Node.js not found, falling back to ELECTRON_RUN_AS_NODE', {
      expectedPath: bundledNodeExe,
    });

    return {
      spawnFile: process.execPath,
      spawnArgs: originalArgs,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1', ...extraEnv },
    };
  }

  /**
   * Set up logging for the spawned process
   */
  private setupProcessLogging(childProcess: ChildProcess, conversationId: string): void {
    let stderrData = '';
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        logger.debug('SDK process stderr', { conversationId, data: data.toString().slice(0, 500) });
      });
    }

    childProcess.on('spawn', () => {
      logger.debug('SDK process spawned successfully', { conversationId, pid: childProcess.pid });
    });

    childProcess.on('error', (error) => {
      logger.error('SDK process spawn error', {
        conversationId,
        error: error.message,
        code: (error as NodeJS.ErrnoException).code,
      });
    });

    childProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null && signal !== 'SIGTERM' && signal !== 'SIGINT') {
        logger.warn('SDK process exited unexpectedly', {
          conversationId,
          code,
          signal,
          pid: childProcess.pid,
          stderr: stderrData.slice(0, 1000),
        });
      } else {
        logger.debug('SDK process exited', { conversationId, code, signal });
      }
    });
  }

  /**
   * Handle query errors
   */
  private handleQueryError(conversationId: string, error: Error, messageHandler: SDKMessageHandler): void {
    if (this.errorHandler.isAbortError(error)) {
      logger.info('Request aborted', { conversationId });
      return;
    }

    const errorMessage = error.message || '';

    // Handle process exit errors that occur after successful query completion
    if (this.errorHandler.isPostSuccessProcessExitError(errorMessage, messageHandler.didQuerySucceed())) {
      logger.warn('Process exit error after successful query (ignoring)', {
        conversationId,
        error: errorMessage,
      });
      this.emitDone(conversationId);
      return;
    }

    logger.error('Failed to send message', { conversationId, error });

    const userMessage = this.errorHandler.getHumanReadableError(errorMessage);
    this.emitError(conversationId, userMessage);
  }

  /**
   * Clean up after query completion
   */
  private cleanupQuery(conversationId: string): void {
    const instance = this.activeQueries.get(conversationId);
    if (!instance) {
      return;
    }

    // Clear pending permissions
    instance.permissionManager.clearPendingPermissions();

    // Restore original process.env values
    Object.entries(instance.originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    // Remove from active queries
    this.activeQueries.delete(conversationId);
    this.emitActiveQueryCount();

    logger.debug('Cleaned up query', {
      conversationId,
      remainingQueries: this.activeQueries.size,
    });
  }

  /**
   * Approve a pending action (called from IPC handler)
   */
  async approveAction(
    conversationId: string,
    actionId: string,
    updatedInput?: Record<string, unknown>,
    alwaysAllow?: boolean
  ): Promise<void> {
    const instance = this.activeQueries.get(conversationId);
    if (instance) {
      instance.permissionManager.handleActionResponse({
        conversationId,
        actionId,
        approved: true,
        updatedInput,
        alwaysAllow,
      });
    } else {
      logger.warn('Cannot approve action - no active query for conversation', { conversationId, actionId });
    }
  }

  /**
   * Reject a pending action (called from IPC handler)
   */
  async rejectAction(conversationId: string, actionId: string, message?: string): Promise<void> {
    const instance = this.activeQueries.get(conversationId);
    if (instance) {
      instance.permissionManager.handleActionResponse({
        conversationId,
        actionId,
        approved: false,
        denyMessage: message,
      });
    } else {
      logger.warn('Cannot reject action - no active query for conversation', { conversationId, actionId });
    }
  }

  /**
   * Abort a specific conversation's request
   */
  async abort(conversationId: string): Promise<void> {
    const instance = this.activeQueries.get(conversationId);
    if (!instance) {
      logger.debug('No active query to abort', { conversationId });
      return;
    }

    try {
      await instance.query.interrupt();
      logger.info('Query interrupted via SDK', { conversationId });
    } catch (error) {
      logger.debug('Could not interrupt query', { conversationId, error });
    }

    instance.abortController.abort();
    logger.info('Request abort requested', { conversationId });

    // Clear pending permissions
    instance.permissionManager.clearPendingPermissions();

    // Clean up immediately
    this.cleanupQuery(conversationId);

    // Emit done to signal abort completion
    this.emitDone(conversationId);
  }

  /**
   * Abort all active queries (e.g., when app is closing)
   */
  async abortAll(): Promise<void> {
    const conversationIds = Array.from(this.activeQueries.keys());
    logger.info('Aborting all active queries', { count: conversationIds.length });

    await Promise.all(conversationIds.map(id => this.abort(id)));
  }

  /**
   * Check if any authentication is configured
   */
  async hasAuth(): Promise<boolean> {
    return await this.authValidator.hasAuth();
  }

  /**
   * Emit a text chunk to the renderer for a specific conversation
   */
  private emitChunk(conversationId: string, chunk: string): void {
    this.send(IPC_CHANNELS.CLAUDE_CHUNK, conversationId, chunk);
  }

  /**
   * Emit a tool use event to the renderer for permission request
   */
  private emitToolUse(conversationId: string, action: PendingAction): void {
    this.send(IPC_CHANNELS.CLAUDE_TOOL_USE, conversationId, action);
    this.notificationService.showPermissionRequest(conversationId, action.toolName, action.description);
  }

  /**
   * Emit an error to the renderer for a specific conversation
   */
  private emitError(conversationId: string, error: string): void {
    this.send(IPC_CHANNELS.CLAUDE_ERROR, conversationId, error);
    this.notificationService.showError(conversationId, error);
  }

  /**
   * Emit done event to the renderer for a specific conversation
   */
  private emitDone(conversationId: string): void {
    this.send(IPC_CHANNELS.CLAUDE_DONE, conversationId);
    this.notificationService.showQueryComplete(conversationId);
  }

  /**
   * Emit slash commands to the renderer
   */
  private emitSlashCommands(conversationId: string, commands: SlashCommandInfo[]): void {
    this.send(IPC_CHANNELS.CLAUDE_SLASH_COMMANDS, conversationId, commands);
  }

  /**
   * Emit task notification to the renderer
   */
  private emitTaskNotification(conversationId: string, notification: TaskNotification): void {
    this.send(IPC_CHANNELS.CLAUDE_TASK_NOTIFICATION, conversationId, notification);
  }

  /**
   * Emit usage update to the renderer
   */
  private emitUsageUpdate(conversationId: string, usage: SessionUsage): void {
    this.send(IPC_CHANNELS.CLAUDE_USAGE_UPDATE, conversationId, usage);
  }

  /**
   * Emit session ID to the renderer for conversation continuity
   */
  private emitSessionId(conversationId: string, sessionId: string): void {
    logger.info('Emitting SDK session ID to renderer', { conversationId, sessionId: sessionId.slice(0, 20) + '...' });
    this.send(IPC_CHANNELS.CLAUDE_SESSION_ID, conversationId, sessionId);
  }

  /**
   * Get available slash commands
   * Returns cached commands from the last SDK init message
   */
  getSlashCommands(): SlashCommandInfo[] {
    return this.cachedSlashCommands;
  }

  /**
   * Get available models from the SDK
   * Returns cached models if available
   */
  async getModels(): Promise<ModelInfo[]> {
    if (this.cachedModels.length > 0) {
      return this.cachedModels;
    }

    // Try to fetch from any active query
    for (const instance of this.activeQueries.values()) {
      try {
        const models = await instance.query.supportedModels();
        this.cachedModels = models.map((m) => ({
          value: m.value,
          displayName: m.displayName,
          description: m.description,
        }));
        logger.info('Fetched models from SDK', { count: this.cachedModels.length });
        return this.cachedModels;
      } catch (error) {
        logger.warn('Failed to fetch models from query', { error });
      }
    }

    return [];
  }

  /**
   * Update cached models from SDK (called after query init)
   */
  private async fetchAndCacheModels(queryIterator: Query): Promise<void> {
    try {
      const models = await queryIterator.supportedModels();
      this.cachedModels = models.map((m) => ({
        value: m.value,
        displayName: m.displayName,
        description: m.description,
      }));
      logger.info('Cached models from SDK', {
        count: this.cachedModels.length,
        models: this.cachedModels.map(m => m.displayName),
      });
      this.send(IPC_CHANNELS.CLAUDE_MODEL_CHANGED, this.cachedModels);
    } catch (error) {
      logger.warn('Failed to fetch models for caching', error);
    }
  }
}

export default ClaudeCodeService;
