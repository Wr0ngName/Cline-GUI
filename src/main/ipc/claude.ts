/**
 * IPC handlers for Claude Code SDK integration.
 *
 * This module handles all communication between the renderer process
 * and the Claude Code Agent SDK, including:
 * - Sending user messages to Claude
 * - Tool use approval/rejection
 * - Aborting ongoing requests
 * - Retrieving available slash commands
 *
 * @module ipc/claude
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS, ActionResponse } from '../../shared/types';
import { IpcError, ValidationError, AppError, ERROR_CODES } from '../errors';
import ClaudeCodeService from '../services/ClaudeCodeService';
import { validateString, validateObject, validateBoolean, formatErrorMessage, ensureService } from '../utils/ipc-helpers';
import logger from '../utils/logger';

/**
 * Register IPC handlers for Claude Code operations.
 *
 * @param claudeService - The ClaudeCodeService instance to use for SDK operations
 */
export function setupClaudeIPC(claudeService: ClaudeCodeService): void {
  // Send message to Claude
  ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND, async (_event, message: string, workingDir: string) => {
    try {
      logger.debug('IPC: claude:send', { messageLength: message?.length || 0 });

      // Validate service
      ensureService(claudeService, 'ClaudeCodeService');

      // Validate inputs
      validateString(message, 'Message');
      validateString(workingDir, 'Working directory');

      await claudeService.sendMessage(message, workingDir);
    } catch (error) {
      logger.error('Failed to send message to Claude', { error, messageLength: message?.length });
      throw new IpcError(formatErrorMessage('Failed to send message', error), IPC_CHANNELS.CLAUDE_SEND, ERROR_CODES.CLAUDE_SEND_FAILED, error);
    }
  });

  // Approve a pending action with optional parameters
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_APPROVE,
    async (
      _event,
      actionId: string,
      updatedInput?: Record<string, unknown>,
      alwaysAllow?: boolean
    ) => {
      try {
        logger.debug('IPC: claude:approve', { actionId, alwaysAllow });

        // Validate service
        ensureService(claudeService, 'ClaudeCodeService');

        // Validate inputs
        validateString(actionId, 'Action ID');

        if (updatedInput !== undefined) {
          validateObject(updatedInput, 'Updated input');
        }

        if (alwaysAllow !== undefined) {
          validateBoolean(alwaysAllow, 'alwaysAllow');
        }

        await claudeService.approveAction(actionId, updatedInput, alwaysAllow);
      } catch (error) {
        logger.error('Failed to approve action', { error, actionId });
        throw new IpcError(formatErrorMessage('Failed to approve action', error), IPC_CHANNELS.CLAUDE_APPROVE, ERROR_CODES.IPC_HANDLER_FAILED, error);
      }
    }
  );

  // Reject a pending action with optional denial message
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_REJECT,
    async (_event, actionId: string, message?: string) => {
      try {
        logger.debug('IPC: claude:reject', { actionId, message });

        // Validate service
        ensureService(claudeService, 'ClaudeCodeService');

        // Validate inputs
        validateString(actionId, 'Action ID');

        if (message !== undefined && typeof message !== 'string') {
          throw new ValidationError('Invalid message type: must be a string', 'message', ERROR_CODES.VALIDATION_TYPE_MISMATCH);
        }

        await claudeService.rejectAction(actionId, message);
      } catch (error) {
        logger.error('Failed to reject action', { error, actionId });
        throw new IpcError(formatErrorMessage('Failed to reject action', error), IPC_CHANNELS.CLAUDE_REJECT, ERROR_CODES.IPC_HANDLER_FAILED, error);
      }
    }
  );

  // Handle full action response (alternative to approve/reject)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_ACTION_RESPONSE,
    async (_event, response: ActionResponse) => {
      try {
        logger.debug('IPC: claude:action-response', {
          actionId: response?.actionId,
          approved: response?.approved,
        });

        // Validate service
        ensureService(claudeService, 'ClaudeCodeService');

        // Validate input
        validateObject(response, 'Response');

        if (typeof response.actionId !== 'string' || !response.actionId.trim()) {
          throw new ValidationError('Invalid action ID in response', 'actionId', ERROR_CODES.VALIDATION_REQUIRED);
        }

        if (typeof response.approved !== 'boolean') {
          throw new ValidationError('Invalid approved status: must be a boolean', 'approved', ERROR_CODES.VALIDATION_TYPE_MISMATCH);
        }

        claudeService.handleActionResponse(response);
      } catch (error) {
        logger.error('Failed to handle action response', { error, response });
        throw new IpcError(formatErrorMessage('Failed to handle action response', error), IPC_CHANNELS.CLAUDE_ACTION_RESPONSE, ERROR_CODES.IPC_HANDLER_FAILED, error);
      }
    }
  );

  // Abort current request
  ipcMain.handle(IPC_CHANNELS.CLAUDE_ABORT, async () => {
    try {
      logger.debug('IPC: claude:abort');

      // Validate service
      ensureService(claudeService, 'ClaudeCodeService');

      await claudeService.abort();
    } catch (error) {
      logger.error('Failed to abort Claude request', { error });
      throw new AppError(formatErrorMessage('Failed to abort request', error), ERROR_CODES.CLAUDE_ABORT_FAILED, error);
    }
  });

  // Get available slash commands
  ipcMain.handle(IPC_CHANNELS.CLAUDE_GET_COMMANDS, async () => {
    try {
      logger.debug('IPC: claude:get-commands');

      // Validate service
      ensureService(claudeService, 'ClaudeCodeService');

      return claudeService.getSlashCommands();
    } catch (error) {
      logger.error('Failed to get slash commands', { error });
      throw new IpcError(formatErrorMessage('Failed to get slash commands', error), IPC_CHANNELS.CLAUDE_GET_COMMANDS, ERROR_CODES.IPC_HANDLER_FAILED, error);
    }
  });

  // Get available models from SDK
  ipcMain.handle(IPC_CHANNELS.CLAUDE_GET_MODELS, async () => {
    try {
      logger.debug('IPC: claude:get-models');

      // Validate service
      ensureService(claudeService, 'ClaudeCodeService');

      return await claudeService.getModels();
    } catch (error) {
      logger.error('Failed to get models', { error });
      throw new IpcError(formatErrorMessage('Failed to get models', error), IPC_CHANNELS.CLAUDE_GET_MODELS, ERROR_CODES.IPC_HANDLER_FAILED, error);
    }
  });

  logger.info('Claude IPC handlers registered');
}
