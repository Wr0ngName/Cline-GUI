# Slash Commands UX Improvements

## Problem Statement

When using slash commands in the cline-gui application:

1. **No command details shown**: The UI only shows command names (e.g., `/help`, `/compact`) but not their descriptions or argument hints like Claude Code CLI does
2. **Empty command responses**: Return messages from commands like `/help` are not displayed - users see nothing happen
3. **Poor autocomplete UX**: The command list in InputBox.vue only shows names, making it hard to know what each command does
4. **Incomplete SDK integration**: The app has `fetchSlashCommandDetails()` method but it's never called

## Current State Analysis

### Data Flow (SDK → Service → IPC → Renderer)

1. **SDK Level** (`@anthropic-ai/claude-agent-sdk@0.2.29`)
   - `Query.supportedCommands()`: Returns `SlashCommand[]` with full details:
     ```typescript
     type SlashCommand = {
       name: string;           // e.g., "help"
       description: string;    // e.g., "Show available commands"
       argumentHint: string;   // e.g., "<command>"
     }
     ```

2. **Service Level** (`src/main/services/ClaudeCodeService.ts`)
   - **Current behavior**: 
     - `getSlashCommands()` (lines 432-434): Returns cached commands from init message (names only)
     - `fetchSlashCommandDetails()` (lines 440-458): **UNUSED** - Can fetch full details via `supportedCommands()`
   - **SDKMessageHandler** (`src/main/services/claude/SDKMessageHandler.ts`):
     - Line 182-196: Processes init message, extracts command names, creates stub objects with empty description/argumentHint
     - Line 189: Comment acknowledges "The init message only has names, we'll get full details via supportedCommands()"

3. **IPC Level** (`src/main/ipc/claude.ts`)
   - Line 154-166: Handler for `CLAUDE_GET_COMMANDS` calls `claudeService.getSlashCommands()`
   - Returns only the stub commands with empty descriptions

4. **Renderer Level** (`src/renderer/composables/useClaudeChat.ts`)
   - Line 53-61: `loadSlashCommands()` calls `window.electron.claude.getCommands()`
   - Line 204-207: Receives command updates via `onSlashCommands` event
   - **Problem**: Only receives stub data (names only)

5. **UI Level** (`src/renderer/components/chat/InputBox.vue`)
   - Line 133-134: Shows command names in a truncated list
   - Line 45: Placeholder mentions commands but no descriptions shown
   - **No autocomplete dropdown** with descriptions

### Why Command Responses Are Not Shown

Looking at `SDKMessageHandler.ts`:

- Line 104-129: `processAssistantMessage()` does NOT emit text chunks for assistant messages
- Line 205-207: System messages ARE emitted to UI via `onChunk`
- **Issue**: Slash commands may return their output as assistant messages (not system messages)
- The current code relies on streaming events (`content_block_delta`) which may not fire for slash commands

### Current SlashCommandInfo Type

```typescript
// src/shared/types.ts lines 14-23
export interface SlashCommandInfo {
  name: string;           // Always populated
  description: string;    // Currently empty ""
  argumentHint: string;   // Currently empty ""
}
```

## Root Causes

1. **SDK data not fetched**: `fetchSlashCommandDetails()` exists but is never called
2. **Timing issue**: Can only call `supportedCommands()` when `currentQuery` exists (during active conversation)
3. **Init message limitation**: The init message only contains command names, not full details
4. **Missing UI component**: No autocomplete dropdown to show command descriptions
5. **Message handling gap**: Command output may come as assistant messages which aren't being displayed properly

## Proposed Solution

### Phase 1: Fetch and Store Full Command Details

**Goal**: Get full command information with descriptions and argument hints

#### Backend Changes

1. **Modify SDKMessageHandler** (`src/main/services/claude/SDKMessageHandler.ts`)
   - When processing init message, mark commands as "pending details"
   - Add method to update commands with full details

2. **Modify ClaudeCodeService** (`src/main/services/ClaudeCodeService.ts`)
   - After successful query initialization (when currentQuery is available), call `fetchSlashCommandDetails()`
   - Update cached commands and emit to renderer
   - Handle case where query ends before we can fetch details

#### Implementation Steps

```typescript
// src/main/services/ClaudeCodeService.ts

async sendMessage(message: string, workingDirectory: string): Promise<void> {
  // ... existing setup ...
  
  this.currentQuery = queryIterator;
  
  // Fetch command details now that we have a query object
  this.fetchAndEmitSlashCommandDetails();
  
  // ... existing message processing ...
}

private async fetchAndEmitSlashCommandDetails(): Promise<void> {
  try {
    const commands = await this.fetchSlashCommandDetails();
    // Update cached commands in message handler
    this.messageHandler.updateSlashCommands(commands);
    // Emit to renderer
    this.emitSlashCommands(commands);
  } catch (error) {
    logger.warn('Failed to fetch slash command details', error);
  }
}
```

```typescript
// src/main/services/claude/SDKMessageHandler.ts

updateSlashCommands(commands: SlashCommandInfo[]): void {
  this.cachedSlashCommands = commands;
  this.callbacks.onSlashCommands(commands);
}
```

### Phase 2: Improve UI Display

**Goal**: Show command descriptions in an autocomplete dropdown

#### Frontend Changes

1. **Create new component**: `src/renderer/components/chat/CommandAutocomplete.vue`
   - Dropdown positioned above input
   - Shows filtered commands as user types
   - Displays: `/<name>` `<argumentHint>` - `<description>`
   - Keyboard navigation (up/down arrows, enter to select)
   - Triggered when user types `/`

2. **Update InputBox.vue** (`src/renderer/components/chat/InputBox.vue`)
   - Replace simple hint text with CommandAutocomplete component
   - Add filtering logic based on user input
   - Handle command selection

#### Implementation Steps

```vue
<!-- src/renderer/components/chat/CommandAutocomplete.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SlashCommandInfo } from '@shared/types';

const props = defineProps<{
  commands: SlashCommandInfo[];
  inputValue: string;
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', command: SlashCommandInfo): void;
}>();

const selectedIndex = ref(0);

const filteredCommands = computed(() => {
  if (!props.show) return [];
  
  const query = props.inputValue.trim().slice(1).toLowerCase(); // Remove /
  if (!query) return props.commands;
  
  return props.commands.filter(cmd => 
    cmd.name.toLowerCase().includes(query)
  );
});

watch(() => props.inputValue, () => {
  selectedIndex.value = 0;
});

function handleKeydown(e: KeyboardEvent) {
  if (!props.show) return;
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredCommands.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    if (filteredCommands.value[selectedIndex.value]) {
      e.preventDefault();
      emit('select', filteredCommands.value[selectedIndex.value]);
    }
  }
}

defineExpose({ handleKeydown });
</script>

<template>
  <div 
    v-if="show && filteredCommands.length > 0"
    class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-64 overflow-y-auto"
  >
    <div
      v-for="(cmd, index) in filteredCommands"
      :key="cmd.name"
      :class="[
        'px-4 py-3 cursor-pointer transition-colors',
        index === selectedIndex 
          ? 'bg-primary-50 dark:bg-primary-900/20' 
          : 'hover:bg-surface-50 dark:hover:bg-surface-700/50'
      ]"
      @click="emit('select', cmd)"
    >
      <div class="flex items-baseline gap-2">
        <span class="font-mono font-semibold text-primary-600 dark:text-primary-400">
          /{{ cmd.name }}
        </span>
        <span 
          v-if="cmd.argumentHint" 
          class="font-mono text-sm text-surface-500 dark:text-surface-400"
        >
          {{ cmd.argumentHint }}
        </span>
      </div>
      <div 
        v-if="cmd.description"
        class="text-sm text-surface-600 dark:text-surface-300 mt-1"
      >
        {{ cmd.description }}
      </div>
    </div>
  </div>
</template>
```

```vue
<!-- src/renderer/components/chat/InputBox.vue - modifications -->
<script setup lang="ts">
// ... existing imports ...
import CommandAutocomplete from './CommandAutocomplete.vue';

const autocompleteRef = ref<InstanceType<typeof CommandAutocomplete> | null>(null);
const showAutocomplete = computed(() => {
  return isTypingCommand.value && slashCommands.value.length > 0;
});

function handleKeydown(event: KeyboardEvent) {
  // Let autocomplete handle navigation when shown
  if (showAutocomplete.value && ['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) {
    autocompleteRef.value?.handleKeydown(event);
    return;
  }
  
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }
}

function handleCommandSelect(command: SlashCommandInfo) {
  // Replace input with selected command
  message.value = `/${command.name} `;
  inputRef.value?.focus();
}
</script>

<template>
  <div class="border-t border-surface-200 dark:border-surface-700 p-4 bg-white dark:bg-surface-800">
    <div class="flex gap-3 items-end relative">
      <div class="flex-1 relative">
        <CommandAutocomplete
          ref="autocompleteRef"
          :commands="slashCommands"
          :input-value="message"
          :show="showAutocomplete"
          @select="handleCommandSelect"
        />
        
        <textarea
          ref="inputRef"
          v-model="message"
          :placeholder="placeholder"
          :disabled="isLoading"
          class="input-base resize-none min-h-[44px] max-h-[200px] pr-4"
          rows="1"
          @keydown="handleKeydown"
          @input="handleInput"
        />
      </div>
      
      <!-- ... existing buttons ... -->
    </div>
    
    <!-- Simplified hints - autocomplete shows details now -->
    <div class="flex items-center justify-between mt-2 text-xs text-surface-400 dark:text-surface-500">
      <span v-if="!isTypingCommand">Press Enter to send, Shift+Enter for new line</span>
      <span v-else class="text-primary-500 dark:text-primary-400">
        Use ↑↓ to navigate, Tab/Enter to select
      </span>
      <span v-if="message.length > 0">{{ message.length }} characters</span>
    </div>
  </div>
</template>
```

### Phase 3: Fix Command Output Display

**Goal**: Ensure command responses are visible in the chat

#### Analysis of Output Handling

Commands like `/help` may return output in different ways:
1. As system messages (already handled - line 205-207 in SDKMessageHandler)
2. As assistant message text (currently not emitted due to streaming design)
3. As result messages

#### Backend Changes

1. **Investigate command output format** by adding debug logging
2. **Update SDKMessageHandler** to handle command output specially
3. Consider adding a flag to track when last message was a slash command

#### Implementation Steps

```typescript
// src/main/services/claude/SDKMessageHandler.ts

export class SDKMessageHandler {
  private lastMessageWasSlashCommand = false;
  
  // Add method to mark slash command sent
  markSlashCommandSent(): void {
    this.lastMessageWasSlashCommand = true;
  }
  
  reset(): void {
    this.querySucceeded = false;
    this.lastMessageWasSlashCommand = false;
  }
  
  private async processAssistantMessage(message: SDKAssistantMessage): Promise<void> {
    const content = message.message.content;
    
    // Special handling for slash command responses
    // If the last message was a slash command and we get a text response,
    // we should emit it (it's likely the command output)
    if (this.lastMessageWasSlashCommand) {
      for (const block of content) {
        if (block.type === 'text' && block.text.trim()) {
          this.callbacks.onChunk(block.text);
        }
      }
      this.lastMessageWasSlashCommand = false;
      return;
    }
    
    // ... existing logic ...
  }
}
```

```typescript
// src/main/services/ClaudeCodeService.ts

async sendMessage(message: string, workingDirectory: string): Promise<void> {
  // ... existing setup ...
  
  // Check if this is a slash command
  const isSlashCommand = message.trim().startsWith('/');
  if (isSlashCommand) {
    this.messageHandler.markSlashCommandSent();
  }
  
  // ... rest of method ...
}
```

### Phase 4: Testing Strategy

#### Backend Tests

1. **Test ClaudeCodeService.fetchSlashCommandDetails()**
   - Should call `currentQuery.supportedCommands()`
   - Should map SDK SlashCommand to SlashCommandInfo
   - Should handle errors gracefully

2. **Test SDKMessageHandler command caching**
   - Should start with stub commands from init
   - Should update with full details when provided
   - Should emit updates to callbacks

3. **Integration test for command flow**
   - Send `/help` command
   - Verify command details are fetched
   - Verify command output is emitted

#### Frontend Tests

1. **Test CommandAutocomplete.vue**
   - Should filter commands by input
   - Should handle keyboard navigation
   - Should emit select event
   - Should highlight selected item

2. **Test InputBox.vue integration**
   - Should show autocomplete when typing `/`
   - Should hide autocomplete when not typing command
   - Should insert selected command

3. **E2E test**
   - Type `/he` → see filtered commands with descriptions
   - Select `/help` → see help output in chat
   - Verify descriptions are visible

## File Changes Summary

### Backend Changes

1. **src/main/services/ClaudeCodeService.ts**
   - Add call to `fetchSlashCommandDetails()` after query initialization
   - Add `fetchAndEmitSlashCommandDetails()` helper method
   - Track when slash commands are sent

2. **src/main/services/claude/SDKMessageHandler.ts**
   - Add `updateSlashCommands()` method
   - Add `markSlashCommandSent()` method
   - Modify `processAssistantMessage()` to handle command output
   - Update `reset()` to clear slash command flag

3. **src/main/ipc/claude.ts**
   - No changes needed (already has handler)

### Frontend Changes

4. **src/renderer/components/chat/CommandAutocomplete.vue** (NEW FILE)
   - Create dropdown component with filtering
   - Keyboard navigation support
   - Rich display of commands with descriptions

5. **src/renderer/components/chat/InputBox.vue**
   - Import and use CommandAutocomplete
   - Add command selection handler
   - Update keyboard event handling
   - Simplify hints (details now in autocomplete)

6. **src/renderer/composables/useClaudeChat.ts**
   - No changes needed (already receives updates)

### Test Files

7. **src/main/services/__tests__/ClaudeCodeService.test.ts**
   - Add tests for `fetchAndEmitSlashCommandDetails()`
   - Test slash command detection

8. **src/main/services/claude/__tests__/SDKMessageHandler.test.ts** (may need creation)
   - Test command caching and updates
   - Test slash command output handling

9. **src/renderer/components/chat/__tests__/CommandAutocomplete.test.ts** (NEW FILE)
   - Test filtering logic
   - Test keyboard navigation
   - Test selection events

10. **src/renderer/components/chat/__tests__/InputBox.test.ts** (update existing)
    - Test autocomplete integration
    - Test command selection flow

## Implementation Order

1. **Step 1**: Backend - Fetch command details
   - Modify `ClaudeCodeService.sendMessage()` to call `fetchAndEmitSlashCommandDetails()`
   - Add `updateSlashCommands()` to `SDKMessageHandler`
   - Test that full commands are emitted

2. **Step 2**: Backend - Fix command output
   - Add slash command tracking to `SDKMessageHandler`
   - Modify `processAssistantMessage()` to emit command responses
   - Test with `/help` command

3. **Step 3**: Frontend - Create autocomplete component
   - Build `CommandAutocomplete.vue`
   - Add unit tests
   - Verify filtering and keyboard nav work

4. **Step 4**: Frontend - Integrate autocomplete
   - Update `InputBox.vue` to use autocomplete
   - Test command selection flow
   - Verify UX improvements

5. **Step 5**: Polish and documentation
   - Update user-facing docs about slash commands
   - Add inline code comments
   - Create demo video/screenshots

## Potential Issues and Mitigations

### Issue 1: Timing - supportedCommands() called too early
- **Risk**: `currentQuery` might not be ready when we try to call `supportedCommands()`
- **Mitigation**: 
  - Call after `queryIterator` is assigned
  - Wrap in try-catch with warning log
  - Fall back to stub commands if fails
  - Consider retry with exponential backoff

### Issue 2: Command output format varies
- **Risk**: Different commands may return output in different formats (system msg, assistant msg, etc.)
- **Mitigation**:
  - Add extensive logging to understand actual behavior
  - Test with multiple commands (`/help`, `/compact`, `/cost`)
  - Make output handling flexible enough for different formats

### Issue 3: Autocomplete positioning issues
- **Risk**: Dropdown may overflow container or be clipped
- **Mitigation**:
  - Use `absolute` positioning with proper z-index
  - Add max-height with scroll
  - Test in different window sizes
  - Consider using floating-ui library for robust positioning

### Issue 4: Performance with many commands
- **Risk**: Filtering commands on every keystroke could be slow
- **Mitigation**:
  - Commands list is small (typically <20 items)
  - Use computed property (cached)
  - If needed, debounce filtering
  - Only show autocomplete when focused

### Issue 5: Race condition in command detail fetching
- **Risk**: Multiple rapid queries could cause overlapping fetch requests
- **Mitigation**:
  - Only fetch once per query session
  - Cancel previous fetch if new query starts
  - Cache results globally (commands don't change often)

## Success Criteria

1. **Command details visible**: Users can see descriptions and argument hints for all commands
2. **Autocomplete works**: Typing `/` shows filtered commands with full information
3. **Command output shown**: Running `/help` displays the help text in chat
4. **Keyboard navigation**: Users can navigate autocomplete with arrow keys and select with Enter/Tab
5. **No regressions**: Existing chat functionality continues to work
6. **Performance**: UI remains responsive during command typing and selection

## Complexity Estimate

- **Backend**: Medium (2-3 hours)
  - Straightforward API integration
  - Some complexity in timing/lifecycle management
  - Need to understand SDK message flow

- **Frontend**: Medium-High (4-5 hours)
  - New component creation
  - Keyboard interaction handling
  - Styling and positioning
  - Integration testing

- **Overall**: Medium-High (6-8 hours)
  - Well-defined problem
  - Clear SDK API to use
  - Main complexity in UX polish and edge cases

## Dependencies

- **Requires**: None (all APIs already available)
- **Blocks**: None (nice-to-have feature, not blocking other work)
- **Related**: Could enhance this later with:
  - Command history/suggestions
  - Command parameter validation
  - Inline command documentation panel
