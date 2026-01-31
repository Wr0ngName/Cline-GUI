/**
 * IPC setup - registers all IPC handlers
 */

import { BrowserWindow } from 'electron';

import ClaudeCodeService from '../services/ClaudeCodeService';
import ConfigService from '../services/ConfigService';
import ConversationService from '../services/ConversationService';
import FileWatcherService from '../services/FileWatcherService';
import UpdateService from '../services/UpdateService';
import logger from '../utils/logger';

import { setupClaudeIPC } from './claude';
import { setupConfigIPC } from './config';
import { setupConversationIPC } from './conversations';
import { setupFilesIPC } from './files';
import { setupUpdateIPC } from './update';
import { setupWindowIPC } from './window';

interface Services {
  configService: ConfigService;
  claudeService: ClaudeCodeService;
  fileWatcher: FileWatcherService;
  conversationService: ConversationService;
  updateService: UpdateService;
}

export function setupIPC(
  services: Services,
  getMainWindow: () => BrowserWindow | null
): void {
  const {
    configService,
    claudeService,
    fileWatcher,
    conversationService,
    updateService,
  } = services;

  setupClaudeIPC(claudeService);
  setupFilesIPC(fileWatcher, configService, getMainWindow);
  setupConfigIPC(configService, getMainWindow);
  setupConversationIPC(conversationService);
  setupUpdateIPC(updateService);
  setupWindowIPC();

  logger.info('All IPC handlers registered');
}
