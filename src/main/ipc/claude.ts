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
    logger.debug('IPC: claude:send', { messageLength: message.length });
    await claudeService.sendMessage(message, workingDir);
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
      logger.debug('IPC: claude:approve', { actionId, alwaysAllow });
      await claudeService.approveAction(actionId, updatedInput, alwaysAllow);
    }
  );

  // Reject a pending action with optional denial message
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_REJECT,
    async (_event, actionId: string, message?: string) => {
      logger.debug('IPC: claude:reject', { actionId, message });
      await claudeService.rejectAction(actionId, message);
    }
  );

  // Handle full action response (alternative to approve/reject)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_ACTION_RESPONSE,
    async (_event, response: ActionResponse) => {
      logger.debug('IPC: claude:action-response', {
        actionId: response.actionId,
        approved: response.approved,
      });
      claudeService.handleActionResponse(response);
    }
  );

  // Abort current request
  ipcMain.handle(IPC_CHANNELS.CLAUDE_ABORT, async () => {
    logger.debug('IPC: claude:abort');
    await claudeService.abort();
  });

  logger.info('Claude IPC handlers registered');
}
