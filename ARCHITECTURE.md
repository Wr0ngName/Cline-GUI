# Cline GUI - Architecture Reference

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLINE GUI APPLICATION                           │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      RENDERER PROCESS                             │   │
│  │                    (Chromium + Vue 3)                             │   │
│  │                                                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │                     UI LAYER (Vue Components)             │   │   │
│  │  │                                                            │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐     │   │   │
│  │  │  │ ChatWindow  │  │  FileTree   │  │   Settings   │     │   │   │
│  │  │  └─────────────┘  └─────────────┘  └──────────────┘     │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐     │   │   │
│  │  │  │ MessageList │  │  FileDiff   │  │   History    │     │   │   │
│  │  │  └─────────────┘  └─────────────┘  └──────────────┘     │   │   │
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐     │   │   │
│  │  │  │  InputBox   │  │WorkingDir   │  │ActionApproval│     │   │   │
│  │  │  └─────────────┘  └─────────────┘  └──────────────┘     │   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  │                            │                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │              STATE MANAGEMENT (Pinia Stores)              │   │   │
│  │  │                                                            │   │   │
│  │  │    chatStore  │  filesStore  │  settingsStore            │   │   │
│  │  └────────────────────────────────────────────────────────────┘   │   │
│  │                            │                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │              COMPOSABLES (Business Logic)                 │   │   │
│  │  │                                                            │   │   │
│  │  │  useClaudeChat  │  useFileSystem  │  useSettings         │   │   │
│  │  └────────────────────────────────────────────────────────────┘   │   │
│  │                            │                                   │   │
│  │                            │ IPC Calls                         │   │
│  └────────────────────────────┼───────────────────────────────────┘   │
│                               │                                       │
│                    ┌──────────┴───────────┐                          │
│                    │   CONTEXT BRIDGE      │                          │
│                    │   (Preload Script)    │                          │
│                    │                       │                          │
│                    │  window.electron.* API│                          │
│                    └──────────┬────────────┘                          │
│                               │ Secure IPC                            │
│  ┌────────────────────────────┼───────────────────────────────────┐   │
│  │                      MAIN PROCESS                               │   │
│  │                      (Node.js)                                  │   │
│  │                            │                                    │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │                   IPC HANDLERS                            │  │   │
│  │  │                                                            │  │   │
│  │  │  claude.ts  │  files.ts  │  config.ts                    │  │   │
│  │  └─────────┬──────────┬──────────┬──────────────────────────┘  │   │
│  │            │          │          │                             │   │
│  │  ┌─────────┴──────────┴──────────┴──────────────────────────┐  │   │
│  │  │                     SERVICES                              │  │   │
│  │  │                                                            │  │   │
│  │  │  ┌──────────────────┐  ┌─────────────────────────┐       │  │   │
│  │  │  │ClaudeCodeService │  │  FileWatcherService     │       │  │   │
│  │  │  │                  │  │                         │       │  │   │
│  │  │  │ - sendMessage()  │  │  - watchDirectory()     │       │  │   │
│  │  │  │ - streamChunks() │  │  - getFileTree()        │       │  │   │
│  │  │  │ - parseToolUse() │  │  - emitChanges()        │       │  │   │
│  │  │  │ - approveAction()│  │  - readFile()           │       │  │   │
│  │  │  └──────────────────┘  └─────────────────────────┘       │  │   │
│  │  │                                                            │  │   │
│  │  │  ┌──────────────────┐  ┌─────────────────────────┐       │  │   │
│  │  │  │  ConfigService   │  │    UpdateService        │       │  │   │
│  │  │  │                  │  │                         │       │  │   │
│  │  │  │ - getApiKey()    │  │  - checkForUpdates()    │       │  │   │
│  │  │  │ - setApiKey()    │  │  - downloadUpdate()     │       │  │   │
│  │  │  │ - getPrefs()     │  │  - installUpdate()      │       │  │   │
│  │  │  │ - saveWorkDir()  │  │  - notifyUser()         │       │  │   │
│  │  │  └──────────────────┘  └─────────────────────────┘       │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  │                            │                                    │   │
│  │  ┌─────────────────────────┴──────────────────────────────────┐  │   │
│  │  │                  WINDOW MANAGEMENT                          │  │   │
│  │  │                                                              │  │   │
│  │  │  - createWindow()  - minimize()  - close()                 │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        BUNDLED RUNTIME                            │  │
│  │                                                                    │  │
│  │   Node.js 20 LTS  │  npm/npx  │  Chromium  │  V8 Engine          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS
                                │
                   ┌────────────▼─────────────┐
                   │                          │
                   │    Anthropic API         │
                   │                          │
                   │  - Claude 4.5 Model      │
                   │  - Streaming Responses   │
                   │  - Tool Use (Files/Bash) │
                   │                          │
                   └──────────────────────────┘
```

## Component Interaction Flow

### 1. User Sends Message

```
User types in InputBox
         │
         ▼
  Click Send Button
         │
         ▼
  useClaudeChat.sendMessage()
         │
         ▼
  window.electron.sendMessage() ──IPC──▶ IPC Handler: claude.ts
                                             │
                                             ▼
                                    ClaudeCodeService.sendMessage()
                                             │
                                             ▼
                                    @anthropic-ai/claude-code
                                             │
                                             ▼
                                    Anthropic API (HTTP)
                                             │
                                             ▼
                            ┌────────────────┴────────────────┐
                            │                                 │
                     Stream chunks back              Tool use detected
                            │                                 │
                            ▼                                 ▼
              IPC: claude:chunk              IPC: claude:tool-use
                            │                                 │
                            ▼                                 ▼
              Display in MessageList          Show ActionApproval UI
```

### 2. File Edit Approval Flow

```
Claude proposes file edit
         │
         ▼
ClaudeCodeService parses tool_use
         │
         ▼
Emit IPC: claude:tool-use {type: 'file-edit', ...}
         │
         ▼
Renderer receives event
         │
         ▼
Show ActionApproval component
         │
    ┌────┴────┐
    │         │
Approve   Reject
    │         │
    ▼         ▼
IPC: approve  IPC: reject
    │         │
    ▼         ▼
Execute    Skip action
    │
    ▼
Apply file changes
    │
    ▼
FileWatcherService detects change
    │
    ▼
IPC: files:changed
    │
    ▼
Update FileTree UI
```

### 3. Configuration Flow

```
User opens Settings
         │
         ▼
Load current config ──IPC──▶ config:get
         │                        │
         ▼                        ▼
Display in form          ConfigService.getAll()
                                 │
User edits API key               │
         │                       ▼
         ▼               electron-store.get('apiKey')
IPC: config:set                  │
         │                       ▼
         ▼               safeStorage.decryptString()
ConfigService.set()              │
         │                       ▼
         ▼               Return to renderer
safeStorage.encryptString()
         │
         ▼
electron-store.set('apiKey', encrypted)
         │
         ▼
Emit IPC: config:changed
         │
         ▼
Renderer updates UI
```

## Data Flow Patterns

### State Management (Pinia)

```typescript
// stores/chat.ts
export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [] as Message[],
    isLoading: false,
    currentWorkingDir: '',
  }),
  
  actions: {
    async sendMessage(text: string) {
      // Add user message
      this.messages.push({ role: 'user', content: text });
      this.isLoading = true;
      
      // Call IPC
      await window.electron.sendMessage(text);
    },
    
    addAssistantMessage(chunk: string) {
      // Stream chunks into latest message
      const lastMsg = this.messages[this.messages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.content += chunk;
      } else {
        this.messages.push({ role: 'assistant', content: chunk });
      }
    },
  },
});
```

### IPC Type Safety

```typescript
// types/ipc.ts
export interface ElectronAPI {
  // Claude operations
  sendMessage: (message: string) => Promise<void>;
  onMessageChunk: (callback: (chunk: string) => void) => void;
  approveAction: (actionId: string) => Promise<void>;
  rejectAction: (actionId: string) => Promise<void>;
  
  // File operations
  selectDirectory: () => Promise<string | null>;
  getFileTree: () => Promise<FileNode[]>;
  readFile: (path: string) => Promise<string>;
  
  // Config operations
  getConfig: () => Promise<AppConfig>;
  setConfig: (config: Partial<AppConfig>) => Promise<void>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
```

## Security Boundaries

```
┌─────────────────────────────────────────┐
│         UNTRUSTED ZONE                   │
│       (Renderer Process)                 │
│                                          │
│  - No direct Node.js access              │
│  - No file system access                 │
│  - No native modules                     │
│  - contextIsolation: true                │
│  - nodeIntegration: false                │
│                                          │
└──────────────┬───────────────────────────┘
               │
               │ IPC via contextBridge
               │ (Whitelisted API only)
               │
┌──────────────▼───────────────────────────┐
│         TRUSTED ZONE                     │
│       (Main Process)                     │
│                                          │
│  - Full Node.js access                   │
│  - File system operations                │
│  - Native modules                        │
│  - Anthropic API calls                   │
│  - Secure storage (safeStorage)          │
│                                          │
└──────────────────────────────────────────┘
```

## File System Access Pattern

```
Renderer                    Main Process
   │                            │
   │ Select Directory           │
   │───────────────────────────▶│
   │                            │ dialog.showOpenDialog()
   │                            ├─────────────────────────▶
   │                            │
   │ ◀──────path: string────────│
   │                            │
   │ Request File Tree          │
   │───────────────────────────▶│
   │                            │ fs.readdir() recursive
   │                            │ Filter: ignore .git, node_modules
   │                            ├─────────────────────────▶
   │                            │
   │ ◀────FileNode[]────────────│
   │                            │
   │ Read File Content          │
   │───path: string────────────▶│
   │                            │ Validate path is in workingDir
   │                            │ fs.readFile()
   │                            ├─────────────────────────▶
   │                            │
   │ ◀────content: string───────│
```

## Build & Package Process

```
Source Code (TypeScript + Vue)
         │
         ▼
┌────────────────────────┐
│   Vite Build Process   │
│                        │
│  Renderer: Bundle Vue  │
│  Main: Bundle TS       │
│  Preload: Bundle TS    │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Electron Forge        │
│                        │
│  - Package app         │
│  - Create ASAR         │
│  - Bundle Node.js      │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Platform Makers       │
│                        │
│  - Windows: Squirrel   │
│  - macOS: DMG          │
│  - Linux: DEB/RPM/AppImage │
└────────┬───────────────┘
         │
         ▼
    Installers
```

## Auto-Update Architecture

```
App Startup
     │
     ▼
Check for updates (GitLab Releases API)
     │
     ├─────────────┬─────────────┐
     │             │             │
No update    New version   Error/Offline
     │          available        │
     │             │             │
Continue      Download      Continue
             (background)        │
                 │               │
                 ▼               │
           Verify signature      │
                 │               │
                 ▼               │
           Prompt user           │
                 │               │
         ┌───────┴────────┐     │
         │                │     │
     Install         Skip      │
         │                │     │
         ▼                │     │
    Restart app    Continue    │
                        │       │
                        ▼       ▼
                   Normal operation
```

---

## Key Architectural Decisions

### 1. Why Electron?
- Cross-platform with single codebase
- Bundles Node.js runtime (no user installation)
- Mature ecosystem for desktop apps
- Built-in auto-update support
- Security model (context isolation)

### 2. Why Vue 3 over React?
- Lighter bundle size (~40KB vs ~100KB)
- Simpler syntax for rapid development
- Composition API matches modern React patterns
- Better TypeScript integration (vue-tsc)
- Lower complexity for simple UI

### 3. Why Electron Forge over electron-builder?
- Official Electron tooling
- Better Vite integration
- Simpler configuration
- Active maintenance
- Good documentation

### 4. Why Pinia over Vuex?
- Simpler API (less boilerplate)
- Better TypeScript support
- Composition API compatible
- Smaller bundle size
- Recommended by Vue team

### 5. Why Not Web-Based?
- Need Node.js runtime for @anthropic-ai/claude-code
- File system access (reading/writing project files)
- Better offline support
- Native OS integration (notifications, menus)
- More control over security

---

## Performance Considerations

### Renderer Process Optimization
- Virtual scrolling for long message lists (vue-virtual-scroller)
- Debounce file watcher events (300ms)
- Lazy load conversation history
- Code splitting for routes (if multi-page)
- Memoize expensive computations (computed properties)

### Main Process Optimization
- Stream large file reads (don't load entirely into memory)
- Use worker threads for CPU-intensive tasks
- Cache file tree structure
- Batch IPC messages when possible
- Use native modules where performance critical

### IPC Communication
- Minimize data transfer (send IDs, not full objects)
- Use MessagePort for high-frequency communication
- Batch updates (e.g., multiple file changes)
- Avoid synchronous IPC (always use invoke/on)

---

This architecture is designed to be:
- **Secure**: Strict separation between trusted/untrusted code
- **Performant**: Optimized for large projects and long conversations
- **Maintainable**: Clear separation of concerns
- **Extensible**: Easy to add new features post-MVP
- **Cross-Platform**: Single codebase for Windows, macOS, Linux
