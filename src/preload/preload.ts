/**
 * Preload script - exposes secure API to renderer via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronAPI } from '../shared/preload-api';
import { IPC_CHANNELS, ActionResponse } from '../shared/types';

// Create the API object that will be exposed to the renderer
const electronAPI: ElectronAPI = {
  // Claude operations
  claude: {
    send: (message: string, workingDir: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SEND, message, workingDir),

    approve: (
      actionId: string,
      updatedInput?: Record<string, unknown>,
      alwaysAllow?: boolean
    ) => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_APPROVE, actionId, updatedInput, alwaysAllow),

    reject: (actionId: string, message?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_REJECT, actionId, message),

    respondToAction: (response: ActionResponse) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_ACTION_RESPONSE, response),

    abort: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_ABORT),

    getCommands: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_GET_COMMANDS),

    getModels: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_GET_MODELS),

    onChunk: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_CHUNK, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_CHUNK, handler);
    },

    onToolUse: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, action: Parameters<typeof callback>[0]) =>
        callback(action);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_TOOL_USE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_TOOL_USE, handler);
    },

    onError: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_ERROR, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_ERROR, handler);
    },

    onDone: (callback) => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_DONE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_DONE, handler);
    },

    onSlashCommands: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        commands: Parameters<typeof callback>[0]
      ) => callback(commands);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_SLASH_COMMANDS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_SLASH_COMMANDS, handler);
    },

    onCommandAction: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        action: Parameters<typeof callback>[0]
      ) => callback(action);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_COMMAND_ACTION, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_COMMAND_ACTION, handler);
    },

    onModelsChanged: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        models: Parameters<typeof callback>[0]
      ) => callback(models);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_MODEL_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_MODEL_CHANGED, handler);
    },
  },

  // File operations
  files: {
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.FILES_SELECT_DIR),

    getTree: (directory: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILES_GET_TREE, directory),

    read: (filePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.FILES_READ, filePath),

    onChange: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        changes: Parameters<typeof callback>[0]
      ) => callback(changes);
      ipcRenderer.on(IPC_CHANNELS.FILES_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.FILES_CHANGED, handler);
    },
  },

  // Config operations
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),

    set: (config) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, config),

    onChange: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        config: Parameters<typeof callback>[0]
      ) => callback(config);
      ipcRenderer.on(IPC_CHANNELS.CONFIG_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CONFIG_CHANGED, handler);
    },
  },

  // Auth operations
  auth: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_STATUS),

    startOAuth: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_START_OAUTH),

    completeOAuth: (code: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_COMPLETE_OAUTH, code),

    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  },

  // Conversation operations
  conversation: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_LIST),

    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_GET, id),

    save: (conversation) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_SAVE, conversation),

    rename: (id: string, newTitle: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_RENAME, id, newTitle),

    delete: (id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION_DELETE, id),
  },

  // Update operations
  update: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),

    download: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),

    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),

    onAvailable: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        info: Parameters<typeof callback>[0]
      ) => callback(info);
      ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_AVAILABLE, handler);
    },

    onProgress: (callback) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: Parameters<typeof callback>[0]
      ) => callback(progress);
      ipcRenderer.on(IPC_CHANNELS.UPDATE_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_PROGRESS, handler);
    },

    onDownloaded: (callback) => {
      const handler = () => callback();
      ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOADED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_DOWNLOADED, handler);
    },
  },

  // Window operations
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),

    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),

    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  },

  // Platform info
  platform: process.platform,
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electron', electronAPI);
