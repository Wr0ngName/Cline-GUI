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
  PendingAction,
  SlashCommandInfo,
  UpdateInfo,
  UpdateProgress,
} from './types';

export interface ElectronAPI {
  // Claude operations
  claude: {
    send: (message: string, workingDir: string) => Promise<void>;
    approve: (
      actionId: string,
      updatedInput?: Record<string, unknown>,
      alwaysAllow?: boolean
    ) => Promise<void>;
    reject: (actionId: string, message?: string) => Promise<void>;
    respondToAction: (response: ActionResponse) => Promise<void>;
    abort: () => Promise<void>;
    getCommands: () => Promise<SlashCommandInfo[]>;
    onChunk: (callback: (chunk: string) => void) => () => void;
    onToolUse: (callback: (action: PendingAction) => void) => () => void;
    onError: (callback: (error: string) => void) => () => void;
    onDone: (callback: () => void) => () => void;
    onSlashCommands: (callback: (commands: SlashCommandInfo[]) => void) => () => void;
    onCommandAction: (callback: (action: string) => void) => () => void;
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
