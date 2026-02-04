/**
 * Service for integrating with @anthropic-ai/claude-code
 *
 * Uses the Claude Code SDK query() function with canUseTool callback
 * for custom permission UI integration.
 * Supports both OAuth tokens (Pro/Max) and API keys.
 *
 * This service orchestrates the following modules:
 * - PermissionManager: Handles tool permission requests
 * - SDKMessageHandler: Processes SDK messages
 * - AuthValidator: Validates authentication credentials
 * - ErrorHandler: Converts errors to user-friendly messages
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SpawnOptions,
  SpawnedProcess,
} from '@anthropic-ai/claude-agent-sdk';
import { app, BrowserWindow } from 'electron';

import {
  IPC_CHANNELS,
  PendingAction,
  ActionResponse,
  SlashCommandInfo,
} from '../../shared/types';
import { createSender } from '../utils/ipc-helpers';
import logger from '../utils/logger';

import ConfigService from './ConfigService';
import {
  PermissionManager,
  SDKMessageHandler,
  AuthValidator,
  ErrorHandler,
} from './claude';

export class ClaudeCodeService {
  private permissionManager: PermissionManager;
  private messageHandler: SDKMessageHandler;
  private authValidator: AuthValidator;
  private errorHandler: ErrorHandler;
  private abortController: AbortController | null = null;
  private currentQuery: Query | null = null;
  // Bound sender function for DRY IPC communication
  private send: (channel: string, ...args: unknown[]) => boolean;

  constructor(configService: ConfigService, getMainWindow: () => BrowserWindow | null) {
    // Create bound sender using the provided window getter
    this.send = createSender(getMainWindow);

    // Initialize modules
    this.authValidator = new AuthValidator(configService);
    this.errorHandler = new ErrorHandler();
    this.permissionManager = new PermissionManager(
      configService,
      (action: PendingAction) => this.emitToolUse(action)
    );
    this.messageHandler = new SDKMessageHandler({
      onChunk: (chunk: string) => this.emitChunk(chunk),
      onSlashCommands: (commands: SlashCommandInfo[]) => this.emitSlashCommands(commands),
    });

    logger.info('ClaudeCodeService initialized');
  }

  /**
   * Handle action response from renderer (approve/reject)
   */
  handleActionResponse(response: ActionResponse): void {
    this.permissionManager.handleActionResponse(response);
  }

  /**
   * Send a message to Claude using the Claude Code SDK
   */
  async sendMessage(message: string, workingDirectory: string): Promise<void> {
    // Reset state for new query
    this.messageHandler.reset();

    // Check if auth is configured
    if (!(await this.authValidator.hasAuth())) {
      this.emitError('Not authenticated. Please login with your Claude account or add an API key in Settings.');
      return;
    }

    // Create abort controller for this request
    this.abortController = new AbortController();

    // Track original env values for cleanup - must be outside try block for finally access
    const originalEnv: Record<string, string | undefined> = {};

    try {
      logger.info('Sending message to Claude Code SDK', {
        messageLength: message.length,
        workingDirectory,
      });

      // Set up authentication environment
      const authEnv = await this.authValidator.setupAuthEnv();

      // CRITICAL: Set auth env vars in actual process.env BEFORE calling query()
      // This matches the mautrix-claude pattern that works.
      // The SDK may check process.env for authentication before our spawn callback runs.
      Object.entries(authEnv).forEach(([key, value]) => {
        originalEnv[key] = process.env[key];
        process.env[key] = value;
        logger.debug('Set process.env for SDK', { key, valueLength: value.length });
      });

      // Use Claude Code SDK query function with canUseTool callback
      const queryIterator = query({
        prompt: message,
        options: {
          cwd: workingDirectory,
          abortController: this.abortController,
          // Note: We set env vars in process.env above, but also pass via options
          // for completeness - the SDK should see them either way now
          env: authEnv,
          // Use canUseTool for custom permission UI
          canUseTool: this.permissionManager.createCanUseToolCallback(),
          // Stream partial messages for real-time updates
          includePartialMessages: true,
          // Use Electron as Node.js runtime (with Windows bundled Node.js support)
          spawnClaudeCodeProcess: (options: SpawnOptions): SpawnedProcess => {
            return this.spawnSDKProcess(options);
          },
        },
      });

      this.currentQuery = queryIterator;

      // Process the async generator
      for await (const sdkMessage of queryIterator) {
        await this.messageHandler.handleMessage(sdkMessage);
      }

      // Signal completion
      this.emitDone();
      logger.info('Message completed');
    } catch (error) {
      this.handleQueryError(error as Error);
    } finally {
      this.cleanupQuery(originalEnv);
    }
  }

  /**
   * Spawn the SDK process with platform-specific handling
   */
  private spawnSDKProcess(options: SpawnOptions): SpawnedProcess {
    let spawnFile: string = process.execPath;
    let spawnArgs: string[] = options.args;
    let extraEnv: Record<string, string> = { ELECTRON_RUN_AS_NODE: '1' };

    // On Windows, use bundled Node.js executable instead of ELECTRON_RUN_AS_NODE
    // Windows GUI apps (like Electron) have known stdout capture issues
    // See: https://github.com/electron/electron/issues/4552
    if (process.platform === 'win32') {
      const result = this.getWindowsSpawnConfig(options, spawnArgs);
      spawnFile = result.spawnFile;
      spawnArgs = result.spawnArgs;
      extraEnv = result.extraEnv;
    }

    logger.debug('Spawning SDK process', {
      argsCount: spawnArgs.length,
      cwd: options.cwd,
      hasOAuthToken: !!options.env?.CLAUDE_CODE_OAUTH_TOKEN,
      hasApiKey: !!options.env?.ANTHROPIC_API_KEY,
    });

    // CRITICAL: Inherit process.env so child has PATH, HOME, certs, etc.
    // Then overlay SDK-provided env (includes CLAUDE_CODE_OAUTH_TOKEN)
    // Then our additions (ELECTRON_RUN_AS_NODE on non-Windows)
    const childProcess: ChildProcess = spawn(spawnFile, spawnArgs, {
      cwd: options.cwd,
      env: {
        ...process.env,  // Inherit parent environment (mautrix-claude does this)
        ...options.env,  // SDK-provided env vars
        ...extraEnv,     // Our additions
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: options.signal,
    });

    this.setupProcessLogging(childProcess);

    // ChildProcess satisfies SpawnedProcess interface
    return childProcess as SpawnedProcess;
  }

  /**
   * Get Windows-specific spawn configuration
   */
  private getWindowsSpawnConfig(
    _options: SpawnOptions,
    originalArgs: string[]
  ): { spawnFile: string; spawnArgs: string[]; extraEnv: Record<string, string> } {
    const resourcesPath = process.resourcesPath || path.dirname(app.getAppPath());
    const bundledNodeExe = path.join(resourcesPath, 'node.exe');

    if (fs.existsSync(bundledNodeExe)) {
      logger.info('Windows: using bundled Node.js for SDK spawn', { bundledNodeExe });

      // CRITICAL: Vanilla Node.js cannot read from .asar archives.
      // Files are unpacked to app.asar.unpacked/ via forge's asar.unpack config.
      // We must rewrite paths from app.asar to app.asar.unpacked for the SDK's cli.js
      const spawnArgs = originalArgs.map(arg => {
        if (typeof arg === 'string' && arg.includes('app.asar') && !arg.includes('app.asar.unpacked')) {
          const rewrittenArg = arg.replace(/app\.asar([/\\])/g, 'app.asar.unpacked$1');
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

      return {
        spawnFile: bundledNodeExe,
        spawnArgs,
        extraEnv: {}, // No ELECTRON_RUN_AS_NODE needed with real Node.js
      };
    }

    logger.warn('Windows: bundled Node.js not found, falling back to ELECTRON_RUN_AS_NODE', {
      expectedPath: bundledNodeExe,
    });

    return {
      spawnFile: process.execPath,
      spawnArgs: originalArgs,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  /**
   * Set up logging for the spawned process
   */
  private setupProcessLogging(childProcess: ChildProcess): void {
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
      logger.error('SDK process spawn error', {
        error: error.message,
        code: (error as NodeJS.ErrnoException).code,
      });
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
  }

  /**
   * Handle query errors
   */
  private handleQueryError(error: Error): void {
    if (this.errorHandler.isAbortError(error)) {
      logger.info('Request aborted');
      return;
    }

    const errorMessage = error.message || '';

    // Handle process exit errors that occur after successful query completion
    // The SDK throws when the underlying process exits with non-zero code,
    // even if the query completed successfully. This is a known issue.
    if (this.errorHandler.isPostSuccessProcessExitError(errorMessage, this.messageHandler.didQuerySucceed())) {
      logger.warn('Process exit error after successful query (ignoring)', {
        error: errorMessage,
      });
      // Query succeeded, so emit done instead of error
      this.emitDone();
      return;
    }

    logger.error('Failed to send message', error);

    // Provide user-friendly error messages based on error type
    const userMessage = this.errorHandler.getHumanReadableError(errorMessage);
    this.emitError(userMessage);
  }

  /**
   * Clean up after query completion
   */
  private cleanupQuery(originalEnv: Record<string, string | undefined>): void {
    this.abortController = null;
    this.currentQuery = null;

    // Clear any pending permissions
    this.permissionManager.clearPendingPermissions();

    // CRITICAL: Restore original process.env values
    // This prevents credential leakage between queries if they somehow differ
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
    logger.debug('Restored original process.env');
  }

  /**
   * Approve a pending action (called from IPC handler)
   */
  async approveAction(
    actionId: string,
    updatedInput?: Record<string, unknown>,
    alwaysAllow?: boolean
  ): Promise<void> {
    this.permissionManager.handleActionResponse({
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
    this.permissionManager.handleActionResponse({
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
    this.permissionManager.clearPendingPermissions();
  }

  /**
   * Check if any authentication is configured
   */
  async hasAuth(): Promise<boolean> {
    return await this.authValidator.hasAuth();
  }

  /**
   * Emit a text chunk to the renderer
   */
  private emitChunk(chunk: string): void {
    this.send(IPC_CHANNELS.CLAUDE_CHUNK, chunk);
  }

  /**
   * Emit a tool use event to the renderer for permission request
   */
  private emitToolUse(action: PendingAction): void {
    this.send(IPC_CHANNELS.CLAUDE_TOOL_USE, action);
  }

  /**
   * Emit an error to the renderer
   */
  private emitError(error: string): void {
    this.send(IPC_CHANNELS.CLAUDE_ERROR, error);
  }

  /**
   * Emit done event to the renderer
   */
  private emitDone(): void {
    this.send(IPC_CHANNELS.CLAUDE_DONE);
  }

  /**
   * Emit slash commands to the renderer
   */
  private emitSlashCommands(commands: SlashCommandInfo[]): void {
    this.send(IPC_CHANNELS.CLAUDE_SLASH_COMMANDS, commands);
  }

  /**
   * Get available slash commands
   * Returns cached commands from the last SDK init message
   */
  getSlashCommands(): SlashCommandInfo[] {
    return this.messageHandler.getSlashCommands();
  }

  /**
   * Fetch full slash command details from the SDK
   * This provides descriptions and argument hints
   */
  async fetchSlashCommandDetails(): Promise<SlashCommandInfo[]> {
    if (!this.currentQuery) {
      return this.messageHandler.getSlashCommands();
    }

    try {
      const commands = await this.currentQuery.supportedCommands();
      const slashCommands = commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        argumentHint: cmd.argumentHint,
      }));
      logger.info('Fetched slash command details', { count: commands.length });
      return slashCommands;
    } catch (error) {
      logger.warn('Failed to fetch slash command details', error);
      return this.messageHandler.getSlashCommands();
    }
  }
}

export default ClaudeCodeService;
