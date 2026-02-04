/**
 * Shared types used across main, preload, and renderer processes
 */

/**
 * Role of a message in the chat conversation
 * - user: Message from the user
 * - assistant: Message from Claude AI
 * - system: System notification or instruction
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Information about a slash command from the Claude SDK
 */
export interface SlashCommandInfo {
  /** Command name (without leading slash) */
  name: string;
  /** Description of what the command does */
  description: string;
  /** Hint for command arguments */
  argumentHint: string;
}

/**
 * Represents a single message in the chat conversation
 */
export interface ChatMessage {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: MessageRole;
  /** Text content of the message */
  content: string;
  /** Unix timestamp when the message was created */
  timestamp: number;
  /** Whether the message is currently being streamed */
  isStreaming?: boolean;
}

// Tool use / Action types

/**
 * Type of action that can be performed by Claude
 * - file-edit: Modify an existing file
 * - file-create: Create a new file
 * - file-delete: Delete an existing file
 * - bash-command: Execute a bash command
 * - read-file: Read the contents of a file
 */
export type ActionType = 'file-edit' | 'file-create' | 'file-delete' | 'bash-command' | 'read-file';

/**
 * Current status of an action in its lifecycle
 * - pending: Waiting for user approval
 * - approved: User has approved the action
 * - rejected: User has rejected the action
 * - executed: Action has been successfully executed
 * - failed: Action execution failed
 */
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

/**
 * Details for editing an existing file
 */
export interface FileEditDetails {
  /** Path to the file to edit */
  filePath: string;
  /** Original content of the file before editing */
  originalContent?: string;
  /** New content to write to the file */
  newContent: string;
  /** Visual diff of the changes */
  diff?: string;
}

/**
 * Details for creating a new file
 */
export interface FileCreateDetails {
  /** Path where the new file will be created */
  filePath: string;
  /** Content to write to the new file */
  content: string;
}

/**
 * Details for deleting a file
 */
export interface FileDeleteDetails {
  /** Path to the file to delete */
  filePath: string;
}

/**
 * Details for executing a bash command
 */
export interface BashCommandDetails {
  /** The bash command to execute */
  command: string;
  /** Directory where the command should be executed */
  workingDirectory: string;
}

/**
 * Details for reading a file
 */
export interface ReadFileDetails {
  /** Path to the file to read */
  filePath: string;
}

/**
 * Union type of all possible action details
 */
export type ActionDetails = FileEditDetails | FileCreateDetails | FileDeleteDetails | BashCommandDetails | ReadFileDetails;

/**
 * Base interface for all action types
 */
interface BaseAction {
  /** Unique identifier for the action */
  id: string;
  /** Name of the tool used for this action */
  toolName: string;
  /** Human-readable description of the action */
  description: string;
  /** Raw input parameters for the action */
  input: Record<string, unknown>;
  /** Current status of the action */
  status: ActionStatus;
  /** Unix timestamp when the action was created */
  timestamp: number;
}

/**
 * Action for editing an existing file
 */
export interface FileEditAction extends BaseAction {
  type: 'file-edit';
  details: FileEditDetails;
}

/**
 * Action for creating a new file
 */
export interface FileCreateAction extends BaseAction {
  type: 'file-create';
  details: FileCreateDetails;
}

/**
 * Action for deleting a file
 */
export interface FileDeleteAction extends BaseAction {
  type: 'file-delete';
  details: FileDeleteDetails;
}

/**
 * Action for executing a bash command
 */
export interface BashCommandAction extends BaseAction {
  type: 'bash-command';
  details: BashCommandDetails;
}

/**
 * Action for reading a file
 */
export interface ReadFileAction extends BaseAction {
  type: 'read-file';
  details: ReadFileDetails;
}

/**
 * Discriminated union of all possible pending actions
 * Allows type-safe narrowing based on the 'type' field
 */
export type PendingAction = FileEditAction | FileCreateAction | FileDeleteAction | BashCommandAction | ReadFileAction;

/**
 * Response from renderer for action approval
 */
export interface ActionResponse {
  /** ID of the action being responded to */
  actionId: string;
  /** Whether the user approved the action */
  approved: boolean;
  /** Modified input parameters if user edited them */
  updatedInput?: Record<string, unknown>;
  /** Whether to automatically approve similar actions in the future */
  alwaysAllow?: boolean;
  /** Optional message explaining why the action was denied */
  denyMessage?: string;
}

// File system types

/**
 * Type of file system node
 * - file: Regular file
 * - directory: Directory/folder
 */
export type FileNodeType = 'file' | 'directory';

/**
 * Represents a node in the file system tree
 */
export interface FileNode {
  /** Name of the file or directory */
  name: string;
  /** Full path to the file or directory */
  path: string;
  /** Type of the node */
  type: FileNodeType;
  /** Child nodes if this is a directory */
  children?: FileNode[];
  /** Size of the file in bytes (only for files) */
  size?: number;
  /** Unix timestamp of last modification */
  modifiedAt?: number;
}

// Authentication types

/**
 * Method used for authenticating with Claude API
 * - oauth: OAuth token from claude CLI
 * - api-key: Direct API key
 * - none: No authentication configured
 */
export type AuthMethod = 'oauth' | 'api-key' | 'none';

/**
 * Current authentication status
 */
export interface AuthStatus {
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** Authentication method being used */
  method: AuthMethod;
  /** Display name for the authenticated account (OAuth only) */
  displayName?: string;
}

// Configuration types

/**
 * Theme mode for the application UI
 * - light: Light theme
 * - dark: Dark theme
 * - system: Follow system preference
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Log level for application logging
 * - error: Only errors
 * - warn: Warnings and errors
 * - info: Info, warnings, and errors
 * - debug: All log messages including debug
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Application configuration settings
 */
export interface AppConfig {
  /** Direct API key for Claude API */
  apiKey: string;
  /** OAuth token from claude CLI setup-token */
  oauthToken: string;
  /** Authentication method being used */
  authMethod: AuthMethod;
  /** Current working directory for file operations */
  workingDirectory: string;
  /** List of recently opened project paths */
  recentProjects: string[];
  /** UI theme mode */
  theme: ThemeMode;
  /** Font size for the chat interface */
  fontSize: number;
  /** Whether to automatically approve read-file actions */
  autoApproveReads: boolean;
  /** Log level for application logging */
  logLevel: LogLevel;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  oauthToken: '',
  authMethod: 'none',
  workingDirectory: '',
  recentProjects: [],
  theme: 'system',
  fontSize: 14,
  autoApproveReads: true,
  logLevel: 'warn',
};

// Conversation types

/**
 * Represents a saved conversation with Claude
 */
export interface Conversation {
  /** Unique identifier for the conversation */
  id: string;
  /** User-facing title of the conversation */
  title: string;
  /** Working directory context for this conversation */
  workingDirectory: string;
  /** All messages in the conversation */
  messages: ChatMessage[];
  /** Unix timestamp when the conversation was created */
  createdAt: number;
  /** Unix timestamp when the conversation was last updated */
  updatedAt: number;
}

// Update types

/**
 * Information about an available application update
 */
export interface UpdateInfo {
  /** Version number of the update */
  version: string;
  /** Release notes for the update */
  releaseNotes?: string;
  /** Date the update was released */
  releaseDate?: string;
}

/**
 * Progress information for downloading an update
 */
export interface UpdateProgress {
  /** Download progress as a percentage (0-100) */
  percent: number;
  /** Current download speed in bytes per second */
  bytesPerSecond: number;
  /** Total size of the download in bytes */
  total: number;
  /** Number of bytes transferred so far */
  transferred: number;
}

// IPC Event types

/**
 * Map of IPC event names to their handler signatures
 * These events are sent from main process to renderer process
 */
export type IpcMainEvents = {
  /** Streaming chunk of text from Claude */
  'claude:chunk': (chunk: string) => void;
  /** Claude is requesting approval for a tool use action */
  'claude:tool-use': (action: PendingAction) => void;
  /** An error occurred during Claude interaction */
  'claude:error': (error: string) => void;
  /** Claude has finished processing the current request */
  'claude:done': () => void;
  /** File system changes detected */
  'files:changed': (changes: FileChange[]) => void;
  /** Application configuration has changed */
  'config:changed': (config: Partial<AppConfig>) => void;
  /** A new application update is available */
  'update:available': (info: UpdateInfo) => void;
  /** Update download progress */
  'update:progress': (progress: UpdateProgress) => void;
  /** Update has been downloaded and is ready to install */
  'update:downloaded': () => void;
};

/**
 * Represents a detected change to a file
 */
export interface FileChange {
  /** Type of change that occurred */
  type: 'add' | 'change' | 'unlink';
  /** Path to the file that changed */
  path: string;
}

/**
 * IPC channel names used for communication between main and renderer processes
 * Using 'as const' ensures type safety and prevents modification
 */
export const IPC_CHANNELS = {
  // Claude operations
  /** Send a message to Claude */
  CLAUDE_SEND: 'claude:send',
  /** Receive streaming chunk from Claude */
  CLAUDE_CHUNK: 'claude:chunk',
  /** Claude is requesting tool use approval */
  CLAUDE_TOOL_USE: 'claude:tool-use',
  /** Approve a pending action */
  CLAUDE_APPROVE: 'claude:approve',
  /** Reject a pending action */
  CLAUDE_REJECT: 'claude:reject',
  /** Error occurred during Claude interaction */
  CLAUDE_ERROR: 'claude:error',
  /** Claude finished processing */
  CLAUDE_DONE: 'claude:done',
  /** Abort current Claude request */
  CLAUDE_ABORT: 'claude:abort',
  /** Send action approval/rejection response */
  CLAUDE_ACTION_RESPONSE: 'claude:action-response',
  /** Available slash commands from SDK */
  CLAUDE_SLASH_COMMANDS: 'claude:slash-commands',
  /** Get available slash commands */
  CLAUDE_GET_COMMANDS: 'claude:get-commands',
  /** Built-in command action (clear, compact, etc.) */
  CLAUDE_COMMAND_ACTION: 'claude:command-action',

  // File operations
  /** Open directory picker dialog */
  FILES_SELECT_DIR: 'files:select-directory',
  /** Get file system tree for a directory */
  FILES_GET_TREE: 'files:get-tree',
  /** Read contents of a file */
  FILES_READ: 'files:read',
  /** File system changes detected */
  FILES_CHANGED: 'files:changed',

  // Config operations
  /** Get current configuration */
  CONFIG_GET: 'config:get',
  /** Update configuration */
  CONFIG_SET: 'config:set',
  /** Configuration changed event */
  CONFIG_CHANGED: 'config:changed',

  // Conversation operations
  /** Get list of all conversations */
  CONVERSATION_LIST: 'conversation:list',
  /** Get a specific conversation */
  CONVERSATION_GET: 'conversation:get',
  /** Save a conversation */
  CONVERSATION_SAVE: 'conversation:save',
  /** Delete a conversation */
  CONVERSATION_DELETE: 'conversation:delete',

  // Update operations
  /** Check for application updates */
  UPDATE_CHECK: 'update:check',
  /** Download available update */
  UPDATE_DOWNLOAD: 'update:download',
  /** Install downloaded update */
  UPDATE_INSTALL: 'update:install',
  /** Update is available */
  UPDATE_AVAILABLE: 'update:available',
  /** Update download progress */
  UPDATE_PROGRESS: 'update:progress',
  /** Update download completed */
  UPDATE_DOWNLOADED: 'update:downloaded',

  // Authentication operations
  /** Get current authentication status */
  AUTH_GET_STATUS: 'auth:get-status',
  /** Start OAuth flow */
  AUTH_START_OAUTH: 'auth:start-oauth',
  /** Complete OAuth flow */
  AUTH_COMPLETE_OAUTH: 'auth:complete-oauth',
  /** Log out and clear credentials */
  AUTH_LOGOUT: 'auth:logout',

  // Window operations
  /** Minimize application window */
  WINDOW_MINIMIZE: 'window:minimize',
  /** Maximize/restore application window */
  WINDOW_MAXIMIZE: 'window:maximize',
  /** Close application window */
  WINDOW_CLOSE: 'window:close',
} as const;

/**
 * Type-safe IPC channel name derived from IPC_CHANNELS constant
 */
export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
