<script setup lang="ts">
/**
 * Command autocomplete dropdown component
 * Shows filtered slash commands with descriptions and argument hints
 */

import { computed, ref, watch } from 'vue';

import type { SlashCommandInfo } from '@shared/types';
import TransitionFade from '../shared/TransitionFade.vue';

interface Props {
  /** Available slash commands */
  commands: SlashCommandInfo[];
  /** Current input value (used for filtering) */
  inputValue: string;
  /** Whether to show the autocomplete dropdown */
  show: boolean;
  /** Whether a conversation has been started (affects hint display) */
  hasConversation?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** Emitted when a command is selected */
  (e: 'select', command: SlashCommandInfo): void;
}>();

/** Currently selected index in the filtered list */
const selectedIndex = ref(0);

/**
 * Filter commands based on user input.
 * Matches command names that contain the typed text (after /).
 */
const filteredCommands = computed((): SlashCommandInfo[] => {
  if (!props.show) return [];

  // Extract the query after the /
  const trimmed = props.inputValue.trim();
  if (!trimmed.startsWith('/')) return [];

  const query = trimmed.slice(1).toLowerCase().split(' ')[0]; // Only match command name part
  if (!query) return props.commands;

  return props.commands.filter((cmd) =>
    cmd.name.toLowerCase().includes(query)
  );
});

// Reset selection when input changes
watch(() => props.inputValue, () => {
  selectedIndex.value = 0;
});

// Reset selection when filtered list changes
watch(filteredCommands, () => {
  selectedIndex.value = 0;
});

/**
 * Handle keyboard navigation within the autocomplete.
 * Returns true if the event was handled.
 */
function handleKeydown(e: KeyboardEvent): boolean {
  if (!props.show || filteredCommands.value.length === 0) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(
      selectedIndex.value + 1,
      filteredCommands.value.length - 1
    );
    return true;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
    return true;
  } else if (e.key === 'Tab') {
    // Only Tab completes - Enter should submit the message normally
    const selected = filteredCommands.value[selectedIndex.value];
    if (selected) {
      e.preventDefault();
      emit('select', selected);
      return true;
    }
  } else if (e.key === 'Escape') {
    // Let parent handle escape to close autocomplete
    return false;
  }

  return false;
}

/**
 * Select a command by clicking on it
 */
function selectCommand(cmd: SlashCommandInfo): void {
  emit('select', cmd);
}

// Expose handleKeydown for parent component
defineExpose({ handleKeydown });
</script>

<template>
  <TransitionFade type="slideUp">
    <div
      v-if="show && filteredCommands.length > 0"
      class="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50"
      role="listbox"
      :aria-label="'Slash commands'"
    >
      <!-- Hint when no conversation started -->
      <div
        v-if="!hasConversation"
        class="px-4 py-2 text-xs text-surface-500 dark:text-surface-400 bg-surface-50 dark:bg-surface-700/50 border-b border-surface-200 dark:border-surface-600"
      >
        Showing built-in commands only. Start a conversation to see project-specific commands.
      </div>
      <div
        v-for="(cmd, index) in filteredCommands"
        :key="cmd.name"
        :class="[
          'px-4 py-3 cursor-pointer transition-colors',
          index === selectedIndex
            ? 'bg-primary-50 dark:bg-primary-900/20'
            : 'hover:bg-surface-50 dark:hover:bg-surface-700/50',
        ]"
        role="option"
        :aria-selected="index === selectedIndex"
        @click="selectCommand(cmd)"
        @mouseenter="selectedIndex = index"
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
        <div
          v-else
          class="text-sm text-surface-400 dark:text-surface-500 mt-1 italic"
        >
          No description available
        </div>
      </div>
    </div>
  </TransitionFade>
</template>
