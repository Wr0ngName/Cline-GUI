/**
 * IPC handlers for Claude Code integration
 */

import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/types';
import ClaudeCodeService from '../services/ClaudeCodeService';
import logger from '../utils/logger';

export function setupClaudeIPC(claudeService: ClaudeCodeService): void {
  // Send message to Claude
  ipcMain.handle(IPC_CHANNELS.CLAUDE_SEND, async (_event, message: string, workingDir: string) => {
    logger.debug('IPC: claude:send', { messageLength: message.length });
    await claudeService.sendMessage(message, workingDir);
  });

  // Approve a pending action
  ipcMain.handle(IPC_CHANNELS.CLAUDE_APPROVE, async (_event, actionId: string) => {
    logger.debug('IPC: claude:approve', { actionId });
    await claudeService.approveAction(actionId);
  });

  // Reject a pending action
  ipcMain.handle(IPC_CHANNELS.CLAUDE_REJECT, async (_event, actionId: string) => {
    logger.debug('IPC: claude:reject', { actionId });
    await claudeService.rejectAction(actionId);
  });

  // Abort current request
  ipcMain.handle(IPC_CHANNELS.CLAUDE_ABORT, async () => {
    logger.debug('IPC: claude:abort');
    claudeService.abort();
  });

  logger.info('Claude IPC handlers registered');
}
