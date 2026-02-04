# Feature: Multiple Concurrent Conversations Support

## Executive Summary

Currently, cline-gui supports only **one active SDK query at a time**. When a user switches to a different conversation while a query is streaming in the first one, they cannot send messages in the new conversation - they see a "Cancel" button instead of "Send" because the global `isLoading` state prevents interaction.

This plan outlines a comprehensive refactoring to support **multiple concurrent SDK instances** (one per active conversation), enabling users to:
- Send messages in any conversation, regardless of streaming status in others
- Switch between conversations seamlessly without losing streaming data
- See per-conversation loading indicators
- Receive warnings when system resources prevent new SDK instances (degraded mode)

**Complexity Assessment:**
- Backend: **HIGH** (requires fundamental service architecture change)
- Frontend: **MEDIUM** (per-conversation state management)
- Overall: **HIGH** (significant architectural refactoring)

---

## Current Architecture Analysis

### 1. ClaudeCodeService (Main Process)
**File:** `/mnt/data/git/cline-gui/src/main/services/ClaudeCodeService.ts`

**Current Design:**
- Single `abortController: AbortController | null` (line 54)
- Single `currentQuery: Query | null` (line 55)
- Singleton service instance shared across all conversations
- `sendMessage()` method creates new query, overwriting any previous one

**Key Issues:**
1. Only one query can be active at a time
2. Starting a new query in conversation B aborts/overwrites query in conversation A
3. No concept of "which conversation owns which query"
4. IPC events (`claude:chunk`, `claude:done`, etc.) have no conversation context

### 2. Chat Store (Renderer)
**File:** `/mnt/data/git/cline-gui/src/renderer/stores/chat.ts`

**Current Design:**
- Global `isLoading: ref<boolean>` (line 16)
- Global `streamingConversationId` and `streamingMessageId` for tracking
- Buffering mechanism for conversation switching (lines 113-134)
- Single message array for current conversation

**Key Issues:**
1. `isLoading` is global - blocks all conversations when one is active
2. Buffering is a workaround, not a proper multi-instance solution
3. No per-conversation loading state

### 3. InputBox Component
**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/InputBox.vue`

**Current Design:**
- Shows "Stop" button when `isLoading` is true (line 144-155)
- Shows "Send" button when `isLoading` is false (line 158-170)
- Disables input during loading (line 134)

**Key Issues:**
1. Relies on global `isLoading` state
2. Cannot distinguish between "this conversation is loading" vs "another conversation is loading"

### 4. IPC Communication
**File:** `/mnt/data/git/cline-gui/src/main/ipc/claude.ts`

**Current Design:**
- `claude:send` handler calls `claudeService.sendMessage()`
- Events (`claude:chunk`, `claude:done`) broadcast to renderer without conversation ID
- Single service instance for all conversations

**Key Issues:**
1. No conversation ID in IPC messages
2. Cannot route events to specific conversations
3. No way to abort specific conversation's query

---

## Proposed Architecture Changes

### Phase 1: Backend - Multi-Instance SDK Management

#### 1.1 New QueryInstance Type
**File:** `/mnt/data/git/cline-gui/src/main/services/ClaudeCodeService.ts`

Create a tracking structure for per-conversation queries:

```typescript
interface QueryInstance {
  conversationId: string;
  query: Query;
  abortController: AbortController;
  workingDirectory: string;
  startedAt: number;
}
```

#### 1.2 Refactor ClaudeCodeService

Replace singleton state with Map-based multi-instance management:

```typescript
export class ClaudeCodeService {
  // OLD (remove):
  // private abortController: AbortController | null = null;
  // private currentQuery: Query | null = null;
  
  // NEW:
  private activeQueries: Map<string, QueryInstance> = new Map();
  private maxConcurrentQueries: number = 5; // RAM limit safeguard
  
  async sendMessage(
    conversationId: string,  // NEW PARAM
    message: string,
    workingDirectory: string
  ): Promise<void>
  
  async abort(conversationId: string): Promise<void>  // Add conversationId param
  
  private cleanupQuery(conversationId: string): void
  
  getActiveQueryCount(): number
  
  isConversationActive(conversationId: string): boolean
}
```

**Key Changes:**
1. Store multiple `QueryInstance` objects in a Map keyed by `conversationId`
2. Each query has its own `AbortController` and lifecycle
3. Add resource limit checks before spawning new SDK instances
4. Emit conversation ID with all IPC events

#### 1.3 Update IPC Event Emissions

Modify all event emissions to include conversation ID:

```typescript
// OLD:
this.send(IPC_CHANNELS.CLAUDE_CHUNK, chunk);

// NEW:
this.send(IPC_CHANNELS.CLAUDE_CHUNK, conversationId, chunk);
```

Apply to all events:
- `CLAUDE_CHUNK`
- `CLAUDE_DONE`
- `CLAUDE_ERROR`
- `CLAUDE_TOOL_USE`
- `CLAUDE_TASK_NOTIFICATION`
- `CLAUDE_USAGE_UPDATE`
- `CLAUDE_SLASH_COMMANDS`

### Phase 2: IPC Layer Updates

#### 2.1 Update IPC Handlers
**File:** `/mnt/data/git/cline-gui/src/main/ipc/claude.ts`

```typescript
// Update handler signature
ipcMain.handle(
  IPC_CHANNELS.CLAUDE_SEND,
  async (_event, conversationId: string, message: string, workingDir: string) => {
    await claudeService.sendMessage(conversationId, message, workingDir);
  }
);

ipcMain.handle(
  IPC_CHANNELS.CLAUDE_ABORT,
  async (_event, conversationId: string) => {
    await claudeService.abort(conversationId);
  }
);
```

#### 2.2 Update Shared Types
**File:** `/mnt/data/git/cline-gui/src/shared/types.ts`

Update event type signatures:

```typescript
export type IpcMainEvents = {
  'claude:chunk': (conversationId: string, chunk: string) => void;
  'claude:tool-use': (conversationId: string, action: PendingAction) => void;
  'claude:error': (conversationId: string, error: string) => void;
  'claude:done': (conversationId: string) => void;
  // ... etc
};
```

### Phase 3: Frontend State Management

#### 3.1 Refactor Chat Store
**File:** `/mnt/data/git/cline-gui/src/renderer/stores/chat.ts`

Replace global state with per-conversation state:

```typescript
// Per-conversation state tracking
interface ConversationState {
  isLoading: boolean;
  messages: ChatMessage[];
  pendingActions: PendingAction[];
  error: string | null;
  streamingMessageId: string | null;
  sessionUsage: SessionUsage | null;
  backgroundTasks: Map<string, BackgroundTask>;
}

export const useChatStore = defineStore('chat', () => {
  // OLD (remove global state):
  // const isLoading = ref(false);
  // const messages = ref<ChatMessage[]>([]);
  
  // NEW:
  const conversationStates = ref<Map<string, ConversationState>>(new Map());
  const currentConversationId = ref<string | null>(null);
  
  // Computed: get current conversation's state
  const currentState = computed(() => {
    if (!currentConversationId.value) return null;
    return conversationStates.value.get(currentConversationId.value);
  });
  
  // Computed properties now delegate to current state
  const isLoading = computed(() => currentState.value?.isLoading ?? false);
  const messages = computed(() => currentState.value?.messages ?? []);
  // ... etc
  
  // Actions now take conversationId parameter
  function setLoading(conversationId: string, loading: boolean): void;
  function appendToMessage(conversationId: string, chunk: string): void;
  // ... etc
});
```

**Key Benefits:**
1. Each conversation has independent loading state
2. Can switch conversations without affecting streaming in others
3. Messages buffered per-conversation, not globally
4. Clean separation of concerns

#### 3.2 Remove Streaming Buffer Workaround

Delete the current buffering mechanism (lines 113-175 in chat.ts):
- `appendToStreamingBuffer()`
- `getAndClearStreamingBuffer()`
- `startSwitchingFromStreaming()`
- `shouldBufferChunks()`

These are no longer needed with per-conversation state.

### Phase 4: Component Updates

#### 4.1 Update useClaudeChat Composable
**File:** `/mnt/data/git/cline-gui/src/renderer/composables/useClaudeChat.ts`

```typescript
// Update IPC listener to handle conversation ID
cleanupChunk = window.electron.claude.onChunk((conversationId, chunk) => {
  chatStore.appendToMessage(conversationId, chunk);
});

cleanupDone = window.electron.claude.onDone(async (conversationId) => {
  chatStore.setLoading(conversationId, false);
  chatStore.finishStreaming(conversationId);
});

// Update sendMessage to pass conversation ID
async function sendMessage(content: string) {
  const currentConvId = conversationsStore.currentConversationId;
  if (!currentConvId) return;
  
  await window.electron.claude.send(currentConvId, content, workingDirectory);
}
```

#### 4.2 Update InputBox
**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/InputBox.vue`

No changes needed - it already uses `isLoading` computed property from store, which now delegates to current conversation's state.

#### 4.3 Add Concurrent Query Indicator

New component to show when multiple conversations are active:

**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/ActiveQueriesIndicator.vue`

```vue
<template>
  <div v-if="activeCount > 1" class="text-xs text-blue-500">
    {{ activeCount }} active conversations
  </div>
</template>
```

### Phase 5: Degraded Mode & Resource Limits

#### 5.1 Add Resource Monitoring
**File:** `/mnt/data/git/cline-gui/src/main/services/ClaudeCodeService.ts`

```typescript
async sendMessage(
  conversationId: string,
  message: string,
  workingDirectory: string
): Promise<void> {
  // Check resource limits
  if (this.activeQueries.size >= this.maxConcurrentQueries) {
    throw new Error(
      `Maximum concurrent conversations (${this.maxConcurrentQueries}) reached. ` +
      `Please wait for another conversation to complete or cancel it.`
    );
  }
  
  // Proceed with query...
}
```

#### 5.2 Add Warning Banner
**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/ResourceLimitWarning.vue`

Display when user hits resource limits:

```vue
<template>
  <div v-if="showWarning" class="bg-orange-50 border-orange-200 p-3">
    <p class="text-sm text-orange-800">
      Maximum concurrent conversations reached ({{ maxCount }}).
      Cancel or wait for another conversation to complete.
    </p>
  </div>
</template>
```

---

## Implementation Steps (Ordered)

### Step 1: Update Shared Types
**File:** `/mnt/data/git/cline-gui/src/shared/types.ts`

- [ ] Add `conversationId` parameter to all IPC event type signatures
- [ ] Update `IpcMainEvents` interface
- [ ] Add `MAX_CONCURRENT_QUERIES` constant (default: 5)

**Dependencies:** None  
**Estimated Time:** 30 minutes

---

### Step 2: Refactor ClaudeCodeService (Backend Core)
**File:** `/mnt/data/git/cline-gui/src/main/services/ClaudeCodeService.ts`

- [ ] Add `QueryInstance` interface
- [ ] Replace `abortController` and `currentQuery` with `activeQueries: Map<string, QueryInstance>`
- [ ] Update `sendMessage(conversationId, message, workingDirectory)` signature
  - [ ] Add conversation ID parameter
  - [ ] Check `activeQueries.size` against `maxConcurrentQueries`
  - [ ] Store new query in Map with conversation ID key
  - [ ] Update cleanup to use conversation ID
- [ ] Update `abort(conversationId)` to target specific query
- [ ] Add `cleanupQuery(conversationId)` to remove from Map
- [ ] Add `getActiveQueryCount()` helper
- [ ] Add `isConversationActive(conversationId)` helper
- [ ] Update all `this.send()` calls to include `conversationId` as first parameter:
  - [ ] `emitChunk(conversationId, chunk)`
  - [ ] `emitToolUse(conversationId, action)`
  - [ ] `emitError(conversationId, error)`
  - [ ] `emitDone(conversationId)`
  - [ ] `emitSlashCommands(conversationId, commands)`
  - [ ] `emitTaskNotification(conversationId, notification)`
  - [ ] `emitUsageUpdate(conversationId, usage)`

**Dependencies:** Step 1  
**Estimated Time:** 3-4 hours

---

### Step 3: Update IPC Handlers
**File:** `/mnt/data/git/cline-gui/src/main/ipc/claude.ts`

- [ ] Update `CLAUDE_SEND` handler to accept `conversationId` parameter
- [ ] Update `CLAUDE_ABORT` handler to accept `conversationId` parameter
- [ ] Validate `conversationId` is non-empty string
- [ ] Handle resource limit errors gracefully

**Dependencies:** Step 2  
**Estimated Time:** 1 hour

---

### Step 4: Update Preload Layer
**File:** `/mnt/data/git/cline-gui/src/preload/index.ts`

- [ ] Update `claude.send(conversationId, message, workingDir)` signature
- [ ] Update `claude.abort(conversationId)` signature
- [ ] Update event listener signatures to receive `conversationId`:
  - [ ] `onChunk((conversationId, chunk) => void)`
  - [ ] `onDone((conversationId) => void)`
  - [ ] `onError((conversationId, error) => void)`
  - [ ] `onToolUse((conversationId, action) => void)`
  - [ ] `onTaskNotification((conversationId, notification) => void)`
  - [ ] `onUsageUpdate((conversationId, usage) => void)`
  - [ ] `onSlashCommands((conversationId, commands) => void)`

**Dependencies:** Step 3  
**Estimated Time:** 1.5 hours

---

### Step 5: Refactor Chat Store (Frontend Core)
**File:** `/mnt/data/git/cline-gui/src/renderer/stores/chat.ts`

- [ ] Add `ConversationState` interface
- [ ] Replace global state with `conversationStates: Map<string, ConversationState>`
- [ ] Add `currentConversationId: ref<string | null>`
- [ ] Add `currentState` computed property
- [ ] Update all computed properties to delegate to `currentState`:
  - [ ] `isLoading`
  - [ ] `hasMessages`
  - [ ] `hasPendingActions`
  - [ ] `lastMessage`
  - [ ] `hasBackgroundTasks`
  - [ ] `runningTasksCount`
  - [ ] `backgroundTasksList`
  - [ ] `hasSessionUsage`
  - [ ] `totalTokensUsed`
  - [ ] `contextWindowSize`
  - [ ] `contextUsagePercent`
- [ ] Update all action functions to accept `conversationId` parameter:
  - [ ] `setLoading(conversationId, loading)`
  - [ ] `addMessage(conversationId, message)`
  - [ ] `addUserMessage(conversationId, content)`
  - [ ] `startAssistantMessage(conversationId)`
  - [ ] `appendToLastMessage(conversationId, chunk)`
  - [ ] `finishStreaming(conversationId)`
  - [ ] `addPendingAction(conversationId, action)`
  - [ ] `removePendingAction(conversationId, actionId)`
  - [ ] `setError(conversationId, error)`
  - [ ] `clearError(conversationId)`
  - [ ] `handleTaskNotification(conversationId, notification)`
  - [ ] `updateSessionUsage(conversationId, usage)`
- [ ] Add `getOrCreateConversationState(conversationId)` helper
- [ ] Add `setCurrentConversation(conversationId)` action
- [ ] Add `loadMessages(conversationId, messages)` for conversation switching
- [ ] **REMOVE** old buffering mechanism:
  - [ ] Remove `streamingConversationId`
  - [ ] Remove `streamingMessageId`
  - [ ] Remove `streamingBuffer`
  - [ ] Remove `isSwitchingFromStreaming`
  - [ ] Remove `appendToStreamingBuffer()`
  - [ ] Remove `getAndClearStreamingBuffer()`
  - [ ] Remove `startSwitchingFromStreaming()`
  - [ ] Remove `shouldBufferChunks()`
  - [ ] Remove `clearStreamingState()`

**Dependencies:** Step 4  
**Estimated Time:** 4-5 hours

---

### Step 6: Update Conversations Store
**File:** `/mnt/data/git/cline-gui/src/renderer/stores/conversations.ts`

- [ ] Update `loadConversation(id)` to call `chatStore.setCurrentConversation(id)`
- [ ] Update `createNewConversation()` to call `chatStore.setCurrentConversation(newId)`
- [ ] Update `saveCurrentConversation()` to save per-conversation state from chatStore
- [ ] **REMOVE** streaming buffer handling from `cleanup()` and watchers (lines 216-258)
- [ ] Simplify conversation switching - no more buffering workarounds

**Dependencies:** Step 5  
**Estimated Time:** 2 hours

---

### Step 7: Update useClaudeChat Composable
**File:** `/mnt/data/git/cline-gui/src/renderer/composables/useClaudeChat.ts`

- [ ] Update `sendMessage()` to pass `currentConversationId` to IPC
- [ ] Update all IPC event listeners to receive `conversationId`:
  - [ ] `onChunk((conversationId, chunk) => chatStore.appendToLastMessage(conversationId, chunk))`
  - [ ] `onDone((conversationId) => { chatStore.setLoading(conversationId, false); chatStore.finishStreaming(conversationId); })`
  - [ ] `onError((conversationId, error) => { chatStore.setError(conversationId, error); chatStore.setLoading(conversationId, false); })`
  - [ ] `onToolUse((conversationId, action) => chatStore.addPendingAction(conversationId, action))`
  - [ ] `onTaskNotification((conversationId, notification) => chatStore.handleTaskNotification(conversationId, notification))`
  - [ ] `onUsageUpdate((conversationId, usage) => chatStore.updateSessionUsage(conversationId, usage))`
- [ ] Update `abort()` to pass conversation ID
- [ ] **REMOVE** buffer handling logic (lines 216-254)

**Dependencies:** Step 6  
**Estimated Time:** 2 hours

---

### Step 8: Update ConversationHistory Component
**File:** `/mnt/data/git/cline-gui/src/renderer/components/conversations/ConversationHistory.vue`

- [ ] **REMOVE** `startSwitchingFromStreaming()` calls (lines 35, 49)
- [ ] Simplify `handleLoadConversation()` - just save and load, no buffering
- [ ] Simplify `handleNewConversation()` - just save and create, no buffering

**Dependencies:** Step 7  
**Estimated Time:** 30 minutes

---

### Step 9: Add Resource Limit Handling

#### 9.1 Create ResourceLimitWarning Component
**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/ResourceLimitWarning.vue`

- [ ] Create new component with warning UI
- [ ] Show when error message contains "Maximum concurrent conversations"
- [ ] Display active query count
- [ ] Show "Cancel" buttons for other active conversations

**Dependencies:** Step 7  
**Estimated Time:** 1.5 hours

#### 9.2 Create ActiveQueriesIndicator Component
**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/ActiveQueriesIndicator.vue`

- [ ] Create component to show active conversation count
- [ ] Add to ChatWindow or main layout
- [ ] Show which conversations are currently active (optional)

**Dependencies:** Step 7  
**Estimated Time:** 1 hour

---

### Step 10: Update InputBox Component
**File:** `/mnt/data/git/cline-gui/src/renderer/components/chat/InputBox.vue`

- [ ] **No changes needed** - already uses `isLoading` from store
- [ ] Verify it now shows per-conversation loading state correctly

**Dependencies:** Step 7  
**Estimated Time:** 15 minutes (testing only)

---

### Step 11: Update Unit Tests

#### 11.1 ClaudeCodeService Tests
**File:** `/mnt/data/git/cline-gui/src/main/services/__tests__/ClaudeCodeService.test.ts`

- [ ] Update all `sendMessage()` calls to include `conversationId`
- [ ] Add tests for concurrent queries
- [ ] Add tests for resource limits
- [ ] Add tests for conversation-specific abort
- [ ] Verify event emissions include conversation ID

**Dependencies:** Step 2  
**Estimated Time:** 3 hours

#### 11.2 Chat Store Tests
**File:** `/mnt/data/git/cline-gui/src/renderer/stores/__tests__/chat.test.ts`

- [ ] Update tests to use per-conversation state
- [ ] Add tests for multiple concurrent conversations
- [ ] Add tests for conversation switching
- [ ] Remove tests for old buffering mechanism

**Dependencies:** Step 5  
**Estimated Time:** 3 hours

#### 11.3 Conversations Store Tests
**File:** `/mnt/data/git/cline-gui/src/renderer/stores/__tests__/conversations.test.ts`

- [ ] Update tests to remove buffering logic
- [ ] Add tests for concurrent conversation loading
- [ ] Verify streaming doesn't block conversation switching

**Dependencies:** Step 6  
**Estimated Time:** 2 hours

---

## Testing Strategy

### Unit Tests
1. **ClaudeCodeService:**
   - Multiple concurrent queries don't interfere
   - Resource limits enforced correctly
   - Conversation-specific abort works
   - Cleanup removes correct query from Map
   
2. **Chat Store:**
   - Per-conversation state isolation
   - Switching conversations preserves individual states
   - Current conversation computed properties work correctly
   
3. **Conversations Store:**
   - Loading conversation switches chat store context
   - Saving works with concurrent queries

### Integration Tests
1. **Concurrent Streaming:**
   - Start query in conversation A
   - Switch to conversation B
   - Start query in conversation B
   - Verify both stream independently
   - Verify conversation A continues streaming in background
   - Switch back to A and verify completed content is visible

2. **Resource Limits:**
   - Start 5 concurrent queries (default limit)
   - Attempt 6th query
   - Verify error message shown
   - Cancel one query
   - Verify new query can now start

3. **Conversation Switching:**
   - Send message in conversation A (starts streaming)
   - Switch to conversation B
   - Verify A's streaming continues
   - Send message in conversation B (starts second stream)
   - Switch back to A
   - Verify A's stream is still active or completed correctly

### Manual Testing Scenarios
1. Send long-running query in conversation A
2. Create new conversation B while A is streaming
3. Send query in conversation B
4. Verify both show independent loading states
5. Switch between A and B multiple times
6. Verify no data loss or state corruption

### Performance Testing
1. Monitor memory usage with 5 concurrent queries
2. Verify cleanup happens when conversation closed
3. Test with large file operations in multiple conversations
4. Ensure no memory leaks from uncleaned queries

---

## Migration & Backward Compatibility

### Data Migration
**No database schema changes needed** - conversation data format remains unchanged.

### Configuration
Add new setting to config:

```typescript
interface AppConfig {
  // ... existing fields
  maxConcurrentQueries: number;  // NEW - default: 5
}
```

**File:** `/mnt/data/git/cline-gui/src/shared/types.ts` (line 302)

### Breaking Changes
**None for users** - this is an internal architecture change. Existing conversations will work seamlessly.

### Rollback Plan
If issues arise:
1. Feature can be disabled via config flag: `enableConcurrentQueries: false`
2. Revert to single-query mode by checking flag in `ClaudeCodeService`
3. Old buffering mechanism can be temporarily re-enabled if needed

---

## Risk Assessment

### High Risk Areas

1. **IPC Message Routing (HIGH RISK)**
   - **Issue:** Events might be routed to wrong conversation
   - **Mitigation:** 
     - Add strict conversation ID validation
     - Add logging to track event routing
     - Write comprehensive integration tests
   
2. **Memory Leaks (HIGH RISK)**
   - **Issue:** Queries not cleaned up properly
   - **Mitigation:**
     - Implement rigorous cleanup in `cleanupQuery()`
     - Add ref counting or weak references if needed
     - Memory profiling during testing
     - Add automatic cleanup on conversation delete
   
3. **Race Conditions (MEDIUM RISK)**
   - **Issue:** Multiple queries completing simultaneously
   - **Mitigation:**
     - Use Map operations (atomic in JS)
     - Add mutex/locks if race conditions detected
     - Extensive concurrent testing

### Medium Risk Areas

4. **State Synchronization (MEDIUM RISK)**
   - **Issue:** Chat store and conversation store out of sync
   - **Mitigation:**
     - Single source of truth for current conversation ID
     - Reactive computed properties
     - Validate state consistency in tests

5. **Resource Exhaustion (MEDIUM RISK)**
   - **Issue:** User opens too many concurrent queries
   - **Mitigation:**
     - Hard limit (5 concurrent queries)
     - Clear error messages
     - UI indicators showing active query count
     - Graceful degradation

### Low Risk Areas

6. **UI State Management (LOW RISK)**
   - **Issue:** Components not updating correctly
   - **Mitigation:**
     - Vue reactivity handles most cases automatically
     - Computed properties ensure consistency

7. **Backward Compatibility (LOW RISK)**
   - **Issue:** Old conversations fail to load
   - **Mitigation:**
     - No data format changes
     - All changes are internal architecture

---

## Performance Considerations

### Memory Usage
- Each SDK query spawns a Node.js child process
- Estimate: ~50-100MB per active query
- 5 concurrent queries = ~250-500MB additional RAM
- **Mitigation:** Hard limit of 5 concurrent queries

### CPU Usage
- Each query runs in separate process (parallel processing)
- Should not block main thread
- **Benefit:** Better utilization of multi-core CPUs

### Network/API Costs
- Multiple concurrent queries = multiple API calls
- Users should be aware of increased API costs
- **Mitigation:** Add usage warning in settings

---

## Open Questions

1. **Should we persist active query state across app restarts?**
   - **Recommendation:** No - clean slate on restart is simpler and safer
   
2. **Should we show streaming progress for background conversations?**
   - **Recommendation:** Yes - add indicator in conversation list showing which are active
   
3. **Should we allow users to configure max concurrent queries?**
   - **Recommendation:** Yes - add to settings with sane default of 5

4. **How to handle SDK crashes in one conversation?**
   - **Recommendation:** Isolate - crash in conversation A shouldn't affect B

---

## Success Criteria

1. [ ] User can send message in conversation A while conversation B is streaming
2. [ ] User can switch between conversations without losing streaming data
3. [ ] Each conversation shows correct independent loading state
4. [ ] Resource limit warning appears when limit reached
5. [ ] No memory leaks after 20+ conversation switches with concurrent queries
6. [ ] All existing tests pass with updated signatures
7. [ ] New concurrent scenario tests pass
8. [ ] UI clearly indicates which conversations are active

---

## Estimated Timeline

| Phase | Description | Time |
|-------|-------------|------|
| 1 | Shared types & setup | 0.5 hours |
| 2 | Backend refactoring (ClaudeCodeService) | 4 hours |
| 3 | IPC layer updates | 2.5 hours |
| 4 | Frontend state (Chat store) | 5 hours |
| 5 | Conversations store updates | 2 hours |
| 6 | Composable & component updates | 3 hours |
| 7 | Resource limit UI | 2.5 hours |
| 8 | Unit tests | 8 hours |
| 9 | Integration testing | 4 hours |
| 10 | Manual QA & bug fixes | 4 hours |

**Total Estimated Time:** ~35-40 hours (1 week of focused work)

---

## Dependencies & Blockers

### External Dependencies
- None - all changes are internal

### Potential Blockers
1. **SDK limitations:** If `@anthropic-ai/claude-agent-sdk` doesn't support multiple concurrent instances
   - **Resolution:** Test early in Phase 2
   
2. **IPC performance:** Large number of events might overwhelm IPC
   - **Resolution:** Add batching if needed

---

## Rollout Strategy

### Phase 1: Internal Testing
1. Implement all steps
2. Test with 2 concurrent conversations
3. Gradually increase to 5

### Phase 2: Beta Release
1. Release to beta testers
2. Monitor for memory leaks, crashes
3. Gather performance metrics

### Phase 3: General Release
1. Document feature in changelog
2. Add usage tips to documentation
3. Monitor issue reports

---

## Alternative Approaches Considered

### Alternative 1: Queue-Based Single Instance
- **Idea:** Queue messages and process one at a time
- **Rejected:** Defeats purpose of concurrent support

### Alternative 2: Web Workers for Isolation
- **Idea:** Run SDK in separate web workers
- **Rejected:** SDK requires Node.js APIs, not available in web workers

### Alternative 3: Limit to 2 Concurrent Queries
- **Idea:** Only allow current + 1 background conversation
- **Consideration:** Could reduce implementation complexity
- **Decision:** Implement full multi-instance with configurable limit

---

## Next Steps

1. **Review this plan with team/stakeholders**
2. **Get approval for timeline and approach**
3. **Begin implementation starting with Step 1**
4. **Set up monitoring/logging for concurrent query tracking**
5. **Create feature branch:** `feature/multi-concurrent-conversations`
6. **Implement in order, testing each step before proceeding**

---

## Appendix: File Change Summary

### Files to Modify (19 files)
1. `/mnt/data/git/cline-gui/src/shared/types.ts` - Add conversation ID to event signatures
2. `/mnt/data/git/cline-gui/src/main/services/ClaudeCodeService.ts` - Multi-instance management
3. `/mnt/data/git/cline-gui/src/main/ipc/claude.ts` - Update IPC handlers
4. `/mnt/data/git/cline-gui/src/preload/index.ts` - Update IPC signatures
5. `/mnt/data/git/cline-gui/src/renderer/stores/chat.ts` - Per-conversation state
6. `/mnt/data/git/cline-gui/src/renderer/stores/conversations.ts` - Remove buffering
7. `/mnt/data/git/cline-gui/src/renderer/composables/useClaudeChat.ts` - Update event handlers
8. `/mnt/data/git/cline-gui/src/renderer/components/conversations/ConversationHistory.vue` - Simplify switching
9. `/mnt/data/git/cline-gui/src/main/services/__tests__/ClaudeCodeService.test.ts` - Add tests
10. `/mnt/data/git/cline-gui/src/renderer/stores/__tests__/chat.test.ts` - Update tests
11. `/mnt/data/git/cline-gui/src/renderer/stores/__tests__/conversations.test.ts` - Update tests

### Files to Create (2 files)
12. `/mnt/data/git/cline-gui/src/renderer/components/chat/ResourceLimitWarning.vue` - New component
13. `/mnt/data/git/cline-gui/src/renderer/components/chat/ActiveQueriesIndicator.vue` - New component

### Files to Review (No Changes Expected) (8 files)
14. `/mnt/data/git/cline-gui/src/renderer/components/chat/InputBox.vue` - Should work as-is
15. `/mnt/data/git/cline-gui/src/renderer/components/chat/ChatWindow.vue` - Add new indicators
16. `/mnt/data/git/cline-gui/src/renderer/components/chat/MessageList.vue` - Should work as-is
17. `/mnt/data/git/cline-gui/src/renderer/components/chat/ActionApproval.vue` - Should work as-is
18. `/mnt/data/git/cline-gui/src/main/index.ts` - No changes needed
19. `/mnt/data/git/cline-gui/src/main/services/ConversationService.ts` - No changes needed
20. `/mnt/data/git/cline-gui/src/main/services/ConfigService.ts` - Add maxConcurrentQueries setting
21. `/mnt/data/git/cline-gui/src/renderer/App.vue` - No changes needed

**Total Files Affected:** 21 files

---

## End of Plan
