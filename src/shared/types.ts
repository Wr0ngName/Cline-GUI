/**
 * Shared types used across main, preload, and renderer processes
 */

// Message types for chat
export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

// Tool use / Action types
export type ActionType = 'file-edit' | 'file-create' | 'file-delete' | 'bash-command' | 'read-file';

export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface PendingAction {
  id: string;
  type: ActionType;
  description: string;
  details: ActionDetails;
  status: ActionStatus;
  timestamp: number;
}

export interface FileEditDetails {
  filePath: string;
  originalContent?: string;
  newContent: string;
  diff?: string;
}

export interface BashCommandDetails {
  command: string;
  workingDirectory: string;
}

export interface ReadFileDetails {
  filePath: string;
}

export type ActionDetails = FileEditDetails | BashCommandDetails | ReadFileDetails;

// File system types
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  size?: number;
  modifiedAt?: number;
}

// Configuration types
export interface AppConfig {
  apiKey: string;
  workingDirectory: string;
  recentProjects: string[];
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  autoApproveReads: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  workingDirectory: '',
  recentProjects: [],
  theme: 'system',
  fontSize: 14,
  autoApproveReads: true,
};

// Conversation types
export interface Conversation {
  id: string;
  title: string;
  workingDirectory: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Update types
export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

// IPC Event types
export type IpcMainEvents = {
  'claude:chunk': (chunk: string) => void;
  'claude:tool-use': (action: PendingAction) => void;
  'claude:error': (error: string) => void;
  'claude:done': () => void;
  'files:changed': (changes: FileChange[]) => void;
  'config:changed': (config: Partial<AppConfig>) => void;
  'update:available': (info: UpdateInfo) => void;
  'update:progress': (progress: UpdateProgress) => void;
  'update:downloaded': () => void;
};

export interface FileChange {
  type: 'add' | 'change' | 'unlink';
  path: string;
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Claude operations
  CLAUDE_SEND: 'claude:send',
  CLAUDE_CHUNK: 'claude:chunk',
  CLAUDE_TOOL_USE: 'claude:tool-use',
  CLAUDE_APPROVE: 'claude:approve',
  CLAUDE_REJECT: 'claude:reject',
  CLAUDE_ERROR: 'claude:error',
  CLAUDE_DONE: 'claude:done',
  CLAUDE_ABORT: 'claude:abort',

  // File operations
  FILES_SELECT_DIR: 'files:select-directory',
  FILES_GET_TREE: 'files:get-tree',
  FILES_READ: 'files:read',
  FILES_CHANGED: 'files:changed',

  // Config operations
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_CHANGED: 'config:changed',

  // Conversation operations
  CONVERSATION_LIST: 'conversation:list',
  CONVERSATION_GET: 'conversation:get',
  CONVERSATION_SAVE: 'conversation:save',
  CONVERSATION_DELETE: 'conversation:delete',

  // Update operations
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const;
