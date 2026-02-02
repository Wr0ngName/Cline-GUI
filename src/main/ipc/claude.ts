/**
 * IPC handlers for Claude Code integration
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS, ActionResponse } from '../../shared/types';
import ClaudeCodeService from '../services/ClaudeCodeService';
import logger from '../utils/logger';

export function setupClaudeIPC(claudeService: ClaudeCodeService): void {
  // Send message to Claude
  ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND, async (_event, message: string, workingDir: string) => {
    try {
      logger.debug('IPC: claude:send', { messageLength: message?.length || 0 });

      // Validate service
      if (!claudeService) {
        throw new Error('Claude service not initialized');
      }

      // Validate inputs
      if (typeof message !== 'string') {
        throw new Error('Invalid message type: must be a string');
      }

      if (!message || !message.trim()) {
        throw new Error('Message cannot be empty');
      }

      if (typeof workingDir !== 'string') {
        throw new Error('Invalid working directory type: must be a string');
      }

      if (!workingDir || !workingDir.trim()) {
        throw new Error('Working directory cannot be empty');
      }

      await claudeService.sendMessage(message, workingDir);
    } catch (error) {
      logger.error('Failed to send message to Claude', { error, messageLength: message?.length });
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
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
        if (!claudeService) {
          throw new Error('Claude service not initialized');
        }

        // Validate inputs
        if (typeof actionId !== 'string') {
          throw new Error('Invalid action ID type: must be a string');
        }

        if (!actionId || !actionId.trim()) {
          throw new Error('Action ID cannot be empty');
        }

        if (updatedInput !== undefined && (typeof updatedInput !== 'object' || updatedInput === null || Array.isArray(updatedInput))) {
          throw new Error('Invalid updated input: must be an object');
        }

        if (alwaysAllow !== undefined && typeof alwaysAllow !== 'boolean') {
          throw new Error('Invalid alwaysAllow type: must be a boolean');
        }

        await claudeService.approveAction(actionId, updatedInput, alwaysAllow);
      } catch (error) {
        logger.error('Failed to approve action', { error, actionId });
        throw new Error(`Failed to approve action: ${error instanceof Error ? error.message : String(error)}`);
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
        if (!claudeService) {
          throw new Error('Claude service not initialized');
        }

        // Validate inputs
        if (typeof actionId !== 'string') {
          throw new Error('Invalid action ID type: must be a string');
        }

        if (!actionId || !actionId.trim()) {
          throw new Error('Action ID cannot be empty');
        }

        if (message !== undefined && typeof message !== 'string') {
          throw new Error('Invalid message type: must be a string');
        }

        await claudeService.rejectAction(actionId, message);
      } catch (error) {
        logger.error('Failed to reject action', { error, actionId });
        throw new Error(`Failed to reject action: ${error instanceof Error ? error.message : String(error)}`);
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
        if (!claudeService) {
          throw new Error('Claude service not initialized');
        }

        // Validate input
        if (!response || typeof response !== 'object') {
          throw new Error('Invalid response: must be an object');
        }

        if (typeof response.actionId !== 'string' || !response.actionId.trim()) {
          throw new Error('Invalid action ID in response');
        }

        if (typeof response.approved !== 'boolean') {
          throw new Error('Invalid approved status: must be a boolean');
        }

        claudeService.handleActionResponse(response);
      } catch (error) {
        logger.error('Failed to handle action response', { error, response });
        throw new Error(`Failed to handle action response: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Abort current request
  ipcMain.handle(IPC_CHANNELS.CLAUDE_ABORT, async () => {
    try {
      logger.debug('IPC: claude:abort');

      // Validate service
      if (!claudeService) {
        throw new Error('Claude service not initialized');
      }

      await claudeService.abort();
    } catch (error) {
      logger.error('Failed to abort Claude request', { error });
      throw new Error(`Failed to abort request: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Check prerequisites (Node.js and Claude Code CLI)
  ipcMain.handle(IPC_CHANNELS.CLAUDE_CHECK_PREREQUISITES, async () => {
    try {
      logger.debug('IPC: claude:check-prerequisites');
      const { ClaudeCodeService: ClaudeService } = await import('../services/ClaudeCodeService');
      return ClaudeService.checkPrerequisites();
    } catch (error) {
      logger.error('Failed to check prerequisites', { error });
      throw new Error(`Failed to check prerequisites: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  logger.info('Claude IPC handlers registered');
}
