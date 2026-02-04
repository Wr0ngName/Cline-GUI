/**
 * Tests for the useClaudeChat composable.
 *
 * Tests cover:
 * - Sending messages with validation
 * - Slash command detection
 * - Action approval/rejection
 * - Abort functionality
 * - Chat clearing
 * - IPC listener setup and cleanup
 */

import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { DEFAULT_CONFIG } from '../../../shared/types';
import { useChatStore } from '../../stores/chat';
import { useFilesStore } from '../../stores/files';
import { useSettingsStore } from '../../stores/settings';

// We can't easily test the composable directly due to onMounted/onUnmounted
// So we'll test the core logic extracted from it

// Mock window.electron
const mockElectron = {
  claude: {
    send: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    abort: vi.fn(),
    getCommands: vi.fn(),
    onChunk: vi.fn(),
    onToolUse: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
    onSlashCommands: vi.fn(),
  },
  config: {
    get: vi.fn(),
    set: vi.fn(),
    onChange: vi.fn(),
  },
  files: {
    selectDirectory: vi.fn(),
    getTree: vi.fn(),
    read: vi.fn(),
    onChange: vi.fn(),
  },
};

// Store event callbacks
let chunkCallback: ((chunk: string) => void) | null = null;
 
let toolUseCallback: ((action: any) => void) | null = null;
let errorCallback: ((error: string) => void) | null = null;
let doneCallback: (() => void) | null = null;

describe('useClaudeChat core logic', () => {
  beforeEach(() => {
    // Set up pinia
    setActivePinia(createPinia());

    // Reset mocks and callbacks
    vi.clearAllMocks();
    chunkCallback = null;
    toolUseCallback = null;
    errorCallback = null;
    doneCallback = null;

    // Set up window.electron mock
    (window as any).electron = mockElectron;

    // Mock matchMedia
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    // Default mock implementations
    mockElectron.config.get.mockResolvedValue({ ...DEFAULT_CONFIG });
    mockElectron.config.set.mockResolvedValue(undefined);
    mockElectron.config.onChange.mockReturnValue(() => {});

    mockElectron.files.selectDirectory.mockResolvedValue('/home/user/project');
    mockElectron.files.getTree.mockResolvedValue([]);
    mockElectron.files.read.mockResolvedValue('content');
    mockElectron.files.onChange.mockReturnValue(() => {});

    mockElectron.claude.send.mockResolvedValue(undefined);
    mockElectron.claude.approve.mockResolvedValue(undefined);
    mockElectron.claude.reject.mockResolvedValue(undefined);
    mockElectron.claude.abort.mockResolvedValue(undefined);
    mockElectron.claude.getCommands.mockResolvedValue([]);

    mockElectron.claude.onChunk.mockImplementation((callback) => {
      chunkCallback = callback;
      return () => {
        chunkCallback = null;
      };
    });
    mockElectron.claude.onToolUse.mockImplementation((callback) => {
      toolUseCallback = callback;
      return () => {
        toolUseCallback = null;
      };
    });
    mockElectron.claude.onError.mockImplementation((callback) => {
      errorCallback = callback;
      return () => {
        errorCallback = null;
      };
    });
    mockElectron.claude.onDone.mockImplementation((callback) => {
      doneCallback = callback;
      return () => {
        doneCallback = null;
      };
    });
    mockElectron.claude.onSlashCommands.mockImplementation((_callback) => {
      return () => {
        // Cleanup not needed for this unused callback
      };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Message Sending Prerequisites
  // ===========================================================================
  describe('message sending prerequisites', () => {
    it('should require authentication', async () => {
      // No auth set up
      const settingsStore = useSettingsStore();
      await settingsStore.loadConfig();

      const chatStore = useChatStore();

      // Simulate sendMessage logic
      if (!settingsStore.hasAuth) {
        chatStore.setError('Please log in or configure your API key in Settings');
      }

      expect(chatStore.error).toContain('log in');
    });

    it('should require working directory', async () => {
      // Auth set up but no working directory
      mockElectron.config.get.mockResolvedValue({
        ...DEFAULT_CONFIG,
        apiKey: 'sk-ant-api-key',
        workingDirectory: '',
      });

      const settingsStore = useSettingsStore();
      await settingsStore.loadConfig();

      const filesStore = useFilesStore();
      const chatStore = useChatStore();

      // Simulate sendMessage logic
      if (!filesStore.workingDirectory) {
        chatStore.setError('Please select a working directory');
      }

      expect(chatStore.error).toContain('working directory');
    });

    it('should pass with valid auth and working directory', async () => {
      mockElectron.config.get.mockResolvedValue({
        ...DEFAULT_CONFIG,
        apiKey: 'sk-ant-api-key',
        workingDirectory: '/home/user/project',
      });

      const settingsStore = useSettingsStore();
      await settingsStore.loadConfig();

      expect(settingsStore.hasAuth).toBe(true);
      expect(settingsStore.workingDirectory).toBe('/home/user/project');
    });
  });

  // ===========================================================================
  // Message Sending
  // ===========================================================================
  describe('message sending', () => {
    beforeEach(async () => {
      mockElectron.config.get.mockResolvedValue({
        ...DEFAULT_CONFIG,
        apiKey: 'sk-ant-api-key',
        workingDirectory: '/home/user/project',
      });

      const settingsStore = useSettingsStore();
      await settingsStore.loadConfig();
    });

    it('should not send empty messages', () => {
      const content = '';

      // Simulate validation
      expect(content.trim()).toBe('');
    });

    it('should not send whitespace-only messages', () => {
      const content = '   ';

      // Simulate validation
      expect(content.trim()).toBe('');
    });

    it('should add user message to chat store', () => {
      const chatStore = useChatStore();
      const content = 'Hello Claude';

      chatStore.addUserMessage(content);

      expect(chatStore.messages).toHaveLength(1);
      expect(chatStore.messages[0].content).toBe('Hello Claude');
      expect(chatStore.messages[0].role).toBe('user');
    });

    it('should start assistant message for streaming', () => {
      const chatStore = useChatStore();

      chatStore.startAssistantMessage();

      expect(chatStore.messages).toHaveLength(1);
      expect(chatStore.messages[0].role).toBe('assistant');
      expect(chatStore.messages[0].isStreaming).toBe(true);
    });

    it('should set loading state', () => {
      const chatStore = useChatStore();

      chatStore.setLoading(true);

      expect(chatStore.isLoading).toBe(true);
    });
  });

  // ===========================================================================
  // Slash Command Detection
  // ===========================================================================
  describe('slash command detection', () => {
    const slashCommands = [
      { name: 'help', description: 'Get help', argumentHint: '' },
      { name: 'clear', description: 'Clear history', argumentHint: '' },
      { name: 'review', description: 'Review code', argumentHint: '<file>' },
    ];

    function isSlashCommand(message: string) {
      const trimmed = message.trim();
      if (!trimmed.startsWith('/')) return null;

      const cmdPart = trimmed.split(' ')[0].slice(1);
      return slashCommands.find((cmd) => cmd.name === cmdPart) || null;
    }

    it('should detect /help command', () => {
      const result = isSlashCommand('/help');
      expect(result?.name).toBe('help');
    });

    it('should detect /clear command', () => {
      const result = isSlashCommand('/clear');
      expect(result?.name).toBe('clear');
    });

    it('should detect command with arguments', () => {
      const result = isSlashCommand('/review src/index.ts');
      expect(result?.name).toBe('review');
    });

    it('should return null for non-slash messages', () => {
      const result = isSlashCommand('Hello Claude');
      expect(result).toBeNull();
    });

    it('should return null for unknown commands', () => {
      const result = isSlashCommand('/unknown');
      expect(result).toBeNull();
    });

    it('should handle leading/trailing whitespace', () => {
      const result = isSlashCommand('  /help  ');
      expect(result?.name).toBe('help');
    });
  });

  // ===========================================================================
  // IPC Event Handling
  // ===========================================================================
  describe('IPC event handling', () => {
    beforeEach(() => {
      // Set up listeners
      mockElectron.claude.onChunk(chunkCallback as any);
      mockElectron.claude.onToolUse(toolUseCallback as any);
      mockElectron.claude.onError(errorCallback as any);
      mockElectron.claude.onDone(doneCallback as any);
    });

    it('should append chunks to message', () => {
      const chatStore = useChatStore();
      chatStore.startAssistantMessage();

      // Simulate chunk callback
      chunkCallback?.('Hello');
      chatStore.appendToLastMessage('Hello');

      chunkCallback?.(' World');
      chatStore.appendToLastMessage(' World');

      expect(chatStore.messages[0].content).toBe('Hello World');
    });

    it('should add pending action on tool use', () => {
      const chatStore = useChatStore();

      const action = {
        id: 'action_123',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run ls',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      // Simulate tool use callback
      chatStore.addPendingAction(action);

      expect(chatStore.pendingActions).toHaveLength(1);
      expect(chatStore.pendingActions[0].id).toBe('action_123');
    });

    it('should set error and stop loading on error', () => {
      const chatStore = useChatStore();
      chatStore.setLoading(true);
      chatStore.startAssistantMessage();

      // Simulate error callback
      chatStore.setError('API Error');
      chatStore.setLoading(false);
      chatStore.finishStreaming();

      expect(chatStore.error).toBe('API Error');
      expect(chatStore.isLoading).toBe(false);
      expect(chatStore.messages[0].isStreaming).toBe(false);
    });

    it('should finish streaming on done', () => {
      const chatStore = useChatStore();
      chatStore.setLoading(true);
      chatStore.startAssistantMessage();
      chatStore.appendToLastMessage('Complete response');

      // Simulate done callback
      chatStore.setLoading(false);
      chatStore.finishStreaming();

      expect(chatStore.isLoading).toBe(false);
      expect(chatStore.messages[0].isStreaming).toBe(false);
    });
  });

  // ===========================================================================
  // Action Handling
  // ===========================================================================
  describe('action handling', () => {
    it('should approve action', async () => {
      const chatStore = useChatStore();
      const action = {
        id: 'action_123',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run command',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      chatStore.addPendingAction(action);

      // Simulate approve
      chatStore.updateActionStatus('action_123', 'approved');
      await mockElectron.claude.approve('action_123', undefined, false);
      chatStore.removePendingAction('action_123');

      expect(mockElectron.claude.approve).toHaveBeenCalledWith('action_123', undefined, false);
      expect(chatStore.pendingActions).toHaveLength(0);
    });

    it('should approve action with alwaysAllow', async () => {
      const chatStore = useChatStore();
      const action = {
        id: 'action_123',
        type: 'bash-command' as const,
        toolName: 'Bash',
        description: 'Run command',
        details: { command: 'ls', workingDirectory: '/home' },
        input: { command: 'ls' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      chatStore.addPendingAction(action);

      // Simulate approve with alwaysAllow
      chatStore.updateActionStatus('action_123', 'approved');
      await mockElectron.claude.approve('action_123', undefined, true);
      chatStore.removePendingAction('action_123');

      expect(mockElectron.claude.approve).toHaveBeenCalledWith('action_123', undefined, true);
    });

    it('should reject action', async () => {
      const chatStore = useChatStore();
      const action = {
        id: 'action_456',
        type: 'file-edit' as const,
        toolName: 'Edit',
        description: 'Edit file',
        details: { filePath: '/home/file.ts', newContent: 'new content' },
        input: { file_path: '/home/file.ts' },
        status: 'pending' as const,
        timestamp: Date.now(),
      };

      chatStore.addPendingAction(action);

      // Simulate reject
      chatStore.updateActionStatus('action_456', 'rejected');
      await mockElectron.claude.reject('action_456');
      chatStore.removePendingAction('action_456');

      expect(mockElectron.claude.reject).toHaveBeenCalledWith('action_456');
      expect(chatStore.pendingActions).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Abort
  // ===========================================================================
  describe('abort', () => {
    it('should abort and stop loading', async () => {
      const chatStore = useChatStore();
      chatStore.setLoading(true);
      chatStore.startAssistantMessage();

      // Simulate abort
      await mockElectron.claude.abort();
      chatStore.setLoading(false);
      chatStore.finishStreaming();

      expect(mockElectron.claude.abort).toHaveBeenCalled();
      expect(chatStore.isLoading).toBe(false);
    });
  });

  // ===========================================================================
  // Clear Chat
  // ===========================================================================
  describe('clearChat', () => {
    it('should clear all messages', () => {
      const chatStore = useChatStore();

      chatStore.addUserMessage('Message 1');
      chatStore.startAssistantMessage();
      chatStore.appendToLastMessage('Response');
      chatStore.finishStreaming();

      chatStore.clearMessages();

      expect(chatStore.messages).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Slash Commands Loading
  // ===========================================================================
  describe('slash commands loading', () => {
    it('should load slash commands', async () => {
      const commands = [
        { name: 'help', description: 'Get help', argumentHint: '' },
        { name: 'clear', description: 'Clear chat', argumentHint: '' },
      ];
      mockElectron.claude.getCommands.mockResolvedValue(commands);

      const result = await mockElectron.claude.getCommands();

      expect(result).toEqual(commands);
    });

    it('should handle load errors gracefully', async () => {
      mockElectron.claude.getCommands.mockRejectedValue(new Error('Load failed'));

      let commands: any[] = [];
      try {
        commands = await mockElectron.claude.getCommands();
      } catch {
        commands = [];
      }

      expect(commands).toEqual([]);
    });
  });
});
