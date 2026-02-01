/**
 * Tests for shared types
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_CONFIG,
  IPC_CHANNELS,
  type AppConfig,
  type ChatMessage,
  type Conversation,
  type PendingAction,
  type ActionStatus,
} from '../types';

describe('DEFAULT_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_CONFIG.apiKey).toBe('');
    expect(DEFAULT_CONFIG.oauthToken).toBe('');
    expect(DEFAULT_CONFIG.authMethod).toBe('none');
    expect(DEFAULT_CONFIG.workingDirectory).toBe('');
    expect(DEFAULT_CONFIG.recentProjects).toEqual([]);
    expect(DEFAULT_CONFIG.theme).toBe('system');
    expect(DEFAULT_CONFIG.fontSize).toBe(14);
    expect(DEFAULT_CONFIG.autoApproveReads).toBe(true);
  });

  it('should be a valid AppConfig', () => {
    const config: AppConfig = DEFAULT_CONFIG;
    expect(config).toBeDefined();
  });
});

describe('IPC_CHANNELS', () => {
  it('should have all Claude channels', () => {
    expect(IPC_CHANNELS.CLAUDE_SEND).toBe('claude:send');
    expect(IPC_CHANNELS.CLAUDE_CHUNK).toBe('claude:chunk');
    expect(IPC_CHANNELS.CLAUDE_TOOL_USE).toBe('claude:tool-use');
    expect(IPC_CHANNELS.CLAUDE_APPROVE).toBe('claude:approve');
    expect(IPC_CHANNELS.CLAUDE_REJECT).toBe('claude:reject');
    expect(IPC_CHANNELS.CLAUDE_ERROR).toBe('claude:error');
    expect(IPC_CHANNELS.CLAUDE_DONE).toBe('claude:done');
    expect(IPC_CHANNELS.CLAUDE_ABORT).toBe('claude:abort');
  });

  it('should have all file channels', () => {
    expect(IPC_CHANNELS.FILES_SELECT_DIR).toBe('files:select-directory');
    expect(IPC_CHANNELS.FILES_GET_TREE).toBe('files:get-tree');
    expect(IPC_CHANNELS.FILES_READ).toBe('files:read');
    expect(IPC_CHANNELS.FILES_CHANGED).toBe('files:changed');
  });

  it('should have all conversation channels', () => {
    expect(IPC_CHANNELS.CONVERSATION_LIST).toBe('conversation:list');
    expect(IPC_CHANNELS.CONVERSATION_GET).toBe('conversation:get');
    expect(IPC_CHANNELS.CONVERSATION_SAVE).toBe('conversation:save');
    expect(IPC_CHANNELS.CONVERSATION_DELETE).toBe('conversation:delete');
  });

  it('should have all auth channels', () => {
    expect(IPC_CHANNELS.AUTH_GET_STATUS).toBe('auth:get-status');
    expect(IPC_CHANNELS.AUTH_START_OAUTH).toBe('auth:start-oauth');
    expect(IPC_CHANNELS.AUTH_COMPLETE_OAUTH).toBe('auth:complete-oauth');
    expect(IPC_CHANNELS.AUTH_LOGOUT).toBe('auth:logout');
  });
});

describe('Type validations', () => {
  it('should allow valid ChatMessage', () => {
    const message: ChatMessage = {
      id: 'msg_123',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
    };
    expect(message.id).toBe('msg_123');
    expect(message.role).toBe('user');
  });

  it('should allow streaming ChatMessage', () => {
    const message: ChatMessage = {
      id: 'msg_456',
      role: 'assistant',
      content: 'Processing...',
      timestamp: Date.now(),
      isStreaming: true,
    };
    expect(message.isStreaming).toBe(true);
  });

  it('should allow valid Conversation', () => {
    const conversation: Conversation = {
      id: 'conv_123',
      title: 'Test conversation',
      workingDirectory: '/home/user/project',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(conversation.id).toBe('conv_123');
    expect(conversation.messages).toEqual([]);
  });

  it('should allow valid PendingAction', () => {
    const action: PendingAction = {
      id: 'action_123',
      type: 'bash-command',
      toolName: 'Bash',
      description: 'Run ls command',
      details: {
        command: 'ls -la',
        workingDirectory: '/home/user',
      },
      input: { command: 'ls -la' },
      status: 'pending',
      timestamp: Date.now(),
    };
    expect(action.type).toBe('bash-command');
    expect(action.status).toBe('pending');
  });

  it('should allow all ActionStatus values', () => {
    const statuses: ActionStatus[] = ['pending', 'approved', 'rejected', 'executed', 'failed'];
    expect(statuses).toHaveLength(5);
  });
});
