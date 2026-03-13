/**
 * Permission Manager for Claude Code SDK
 *
 * Handles tool permission requests and user approval flow.
 * Extracted from ClaudeCodeService for better separation of concerns.
 */

import type {
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
} from '@anthropic-ai/claude-agent-sdk';

import { generateId, ID_PREFIXES } from '../../../shared/id';
import { PendingAction, ActionResponse, PermissionSuggestionInfo, PermissionScope } from '../../../shared/types';
import { MAIN_CONSTANTS } from '../../constants/app';
import logger from '../../utils/logger';
import type ConfigService from '../ConfigService';

/**
 * Internal representation of a pending permission request
 */
interface PendingPermission {
  actionId: string;
  toolName: string;
  input: Record<string, unknown>;
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  suggestions?: PermissionUpdate[];
  /** Cleanup function to remove the abort event listener */
  cleanupAbortHandler?: () => void;
}

/**
 * Callback for emitting tool use events to the renderer
 */
type ToolUseEmitter = (action: PendingAction) => void;

/**
 * Manages tool permission requests and user approval flow
 */
export class PermissionManager {
  private configService: ConfigService;
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private emitToolUse: ToolUseEmitter;

  constructor(configService: ConfigService, emitToolUse: ToolUseEmitter) {
    this.configService = configService;
    this.emitToolUse = emitToolUse;
  }

  /**
   * Create the canUseTool callback for custom permission handling
   * This is called by the SDK when Claude wants to use a tool
   */
  createCanUseToolCallback(): CanUseTool {
    return async (toolName, input, options): Promise<PermissionResult> => {
      const actionId = generateId(ID_PREFIXES.ACTION);

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

      // Create pending action for UI (include permission info from SDK suggestions)
      const permissionInfo = this.describePermissionSuggestions(toolName, options.suggestions);
      const action = this.createPendingAction(actionId, toolName, input, permissionInfo);
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

        // Set up named abort handler so it can be removed after resolution
        const abortHandler = () => {
          const pending = this.pendingPermissions.get(actionId);
          if (pending) {
            this.pendingPermissions.delete(actionId);
            resolve({
              behavior: 'deny',
              message: 'Operation was cancelled',
              interrupt: true,
            });
          }
        };

        pendingPermission.cleanupAbortHandler = () => {
          // Guard: signal may not support removeEventListener in test environments
          if (typeof options.signal.removeEventListener === 'function') {
            options.signal.removeEventListener('abort', abortHandler);
          }
        };

        this.pendingPermissions.set(actionId, pendingPermission);
        options.signal.addEventListener('abort', abortHandler);

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
   * Map SDK PermissionUpdateDestination to our PermissionScope.
   * Defaults to 'session' for unknown destinations (defensive).
   */
  private mapDestinationToScope(destination: string): PermissionScope {
    switch (destination) {
      case 'userSettings':
        return 'global';
      case 'projectSettings':
      case 'localSettings':
        return 'project';
      case 'session':
      case 'cliArg':
      default:
        return 'session';
    }
  }

  /**
   * Parse SDK permission suggestions into a human-readable description
   * for display in the action approval UI.
   *
   * Maps SDK PermissionUpdateDestination to user-facing scope labels:
   * - 'session' → session scope (temporary, this session only)
   * - 'projectSettings' / 'localSettings' → project scope (stored per project)
   * - 'userSettings' → global scope (stored in user settings, applies everywhere)
   */
  private describePermissionSuggestions(
    toolName: string,
    suggestions?: PermissionUpdate[]
  ): PermissionSuggestionInfo | undefined {
    if (!suggestions || suggestions.length === 0) {
      return undefined;
    }

    // Collect unique tool names and determine the broadest scope from all suggestions
    const toolNames = new Set<string>();
    let broadestScope: PermissionScope = 'session';
    const SCOPE_PRIORITY: Record<PermissionScope, number> = { session: 0, project: 1, global: 2 };
    const SCOPE_LABELS: Record<PermissionScope, string> = {
      session: 'for this session',
      project: 'for this project',
      global: 'globally',
    };
    const descriptions: string[] = [];

    for (const suggestion of suggestions) {
      // Map SDK destination to our scope
      const scope = this.mapDestinationToScope(suggestion.destination);

      if (SCOPE_PRIORITY[scope] > SCOPE_PRIORITY[broadestScope]) {
        broadestScope = scope;
      }

      // Collect tool names from rules-based suggestions using proper type discrimination
      if (suggestion.type === 'addRules' || suggestion.type === 'replaceRules' || suggestion.type === 'removeRules') {
        for (const rule of suggestion.rules) {
          toolNames.add(rule.toolName);
        }
        // Build description for addRules
        if (suggestion.type === 'addRules') {
          const ruleToolNames = suggestion.rules.map((r) => r.toolName).join(', ');
          descriptions.push(`Allow ${ruleToolNames} ${SCOPE_LABELS[scope]}`);
        }
      } else if (suggestion.type === 'addDirectories') {
        const dirs = suggestion.directories.join(', ');
        descriptions.push(`Add allowed directories: ${dirs}`);
      }
    }

    // If no tool names were found in rules, use the requesting tool name
    if (toolNames.size === 0) {
      toolNames.add(toolName);
    }

    // Generate the button label based on scope and tool names
    const toolLabel = toolNames.size === 1 ? [...toolNames][0] : `${toolNames.size} tools`;
    let alwaysAllowLabel: string;

    switch (broadestScope) {
      case 'session':
        alwaysAllowLabel = `Allow ${toolLabel} this session`;
        break;
      case 'project':
        alwaysAllowLabel = `Allow ${toolLabel} in this project`;
        break;
      case 'global':
        alwaysAllowLabel = `Always allow ${toolLabel}`;
        break;
    }

    const description = descriptions.length > 0
      ? descriptions.join('; ')
      : `Allow ${toolLabel} (${broadestScope} scope)`;

    return {
      alwaysAllowLabel,
      description,
      scope: broadestScope,
    };
  }

  /**
   * Create a PendingAction from tool info for UI display
   */
  private createPendingAction(
    actionId: string,
    toolName: string,
    input: Record<string, unknown>,
    permissionInfo?: PermissionSuggestionInfo
  ): PendingAction | null {
    const baseFields = {
      id: actionId,
      toolName,
      input,
      status: 'pending' as const,
      timestamp: Date.now(),
      ...(permissionInfo ? { permissionInfo } : {}),
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

    // Clean up the abort event listener to prevent memory leaks
    pending.cleanupAbortHandler?.();

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
   * Clear all pending permissions (e.g., on abort)
   */
  clearPendingPermissions(): void {
    for (const [, pending] of this.pendingPermissions) {
      pending.cleanupAbortHandler?.();
      pending.resolve({
        behavior: 'deny',
        message: 'Operation was cancelled',
        interrupt: true,
      });
    }
    this.pendingPermissions.clear();
  }

  /**
   * Get the number of pending permissions
   */
  getPendingCount(): number {
    return this.pendingPermissions.size;
  }
}

export default PermissionManager;
