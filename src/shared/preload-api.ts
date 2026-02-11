/**
 * Type definitions for the preload API exposed to the renderer
 */

import type {
  ActionResponse,
  AppConfig,
  AuthStatus,
  Conversation,
  FileChange,
  FileNode,
  ModelInfo,
  PendingAction,
  SessionUsage,
  SlashCommandInfo,
  TaskNotification,
  UpdateInfo,
  UpdateProgress,
} from './types';

/** Active query status info */
export interface ActiveQueryStatus {
  count: number;
  maxCount: number;
  activeConversationIds: string[];
}

export interface ElectronAPI {
  // Claude operations
  claude: {
    /** Send a message to Claude for a specific conversation */
    send: (conversationId: string, message: string, workingDir: string, resumeSessionId?: string) => Promise<void>;
    /** Approve a pending action for a specific conversation */
    approve: (
      conversationId: string,
      actionId: string,
      updatedInput?: Record<string, unknown>,
      alwaysAllow?: boolean
    ) => Promise<void>;
    /** Reject a pending action for a specific conversation */
    reject: (conversationId: string, actionId: string, message?: string) => Promise<void>;
    /** Send full action response (includes conversationId in response object) */
    respondToAction: (response: ActionResponse) => Promise<void>;
    /** Abort the request for a specific conversation */
    abort: (conversationId: string) => Promise<void>;
    /** Get available slash commands */
    getCommands: () => Promise<SlashCommandInfo[]>;
    /** Get available models */
    getModels: () => Promise<ModelInfo[]>;
    /** Get current active query status */
    getActiveQueries: () => Promise<ActiveQueryStatus>;
    /** Message chunk received for a conversation */
    onChunk: (callback: (conversationId: string, chunk: string) => void) => () => void;
    /** Tool use requested for a conversation */
    onToolUse: (callback: (conversationId: string, action: PendingAction) => void) => () => void;
    /** Error occurred for a conversation */
    onError: (callback: (conversationId: string, error: string) => void) => () => void;
    /** Request completed for a conversation */
    onDone: (callback: (conversationId: string) => void) => () => void;
    /** Slash commands updated for a conversation */
    onSlashCommands: (callback: (conversationId: string, commands: SlashCommandInfo[]) => void) => () => void;
    /** Command action triggered for a conversation */
    onCommandAction: (callback: (conversationId: string, action: string) => void) => () => void;
    /** Models changed */
    onModelsChanged: (callback: (models: ModelInfo[]) => void) => () => void;
    /** Background task notification for a conversation */
    onTaskNotification: (callback: (conversationId: string, notification: TaskNotification) => void) => () => void;
    /** Session usage updated for a conversation */
    onUsageUpdate: (callback: (conversationId: string, usage: SessionUsage) => void) => () => void;
    /** Active query count changed */
    onActiveQueriesChange: (callback: (count: number, maxCount: number) => void) => () => void;
    /** SDK session ID received for a conversation (for resume support) */
    onSessionId: (callback: (conversationId: string, sessionId: string) => void) => () => void;
  };

  // File operations
  files: {
    selectDirectory: () => Promise<string | null>;
    getTree: (directory: string) => Promise<FileNode[]>;
    read: (filePath: string) => Promise<string>;
    onChange: (callback: (changes: FileChange[]) => void) => () => void;
  };

  // Config operations
  config: {
    get: () => Promise<AppConfig>;
    set: (config: Partial<AppConfig>) => Promise<void>;
    onChange: (callback: (config: Partial<AppConfig>) => void) => () => void;
  };

  // Auth operations
  auth: {
    getStatus: () => Promise<AuthStatus>;
    startOAuth: () => Promise<{ authUrl: string; error?: string }>;
    completeOAuth: (code: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<void>;
  };

  // Conversation operations
  conversation: {
    list: () => Promise<Conversation[]>;
    get: (id: string) => Promise<Conversation | null>;
    save: (conversation: Conversation) => Promise<void>;
    rename: (id: string, newTitle: string) => Promise<void>;
    delete: (id: string) => Promise<void>;
  };

  // Update operations
  update: {
    check: () => Promise<UpdateInfo | null>;
    download: () => Promise<void>;
    install: () => void;
    onAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onProgress: (callback: (progress: UpdateProgress) => void) => () => void;
    onDownloaded: (callback: () => void) => () => void;
  };

  // Window operations
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };

  // Platform info
  platform: string;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
