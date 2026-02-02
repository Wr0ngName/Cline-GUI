<script setup lang="ts">
/**
 * Action approval component - shows pending actions for user approval
 */

import { computed, onMounted, onUnmounted, ref } from 'vue';

import type { PendingAction, FileEditDetails, BashCommandDetails } from '@shared/types';

import Button from '../shared/Button.vue';

interface Props {
  action: PendingAction;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'approve', actionId: string): void;
  (e: 'reject', actionId: string): void;
}>();

// For focus management
const cardRef = ref<HTMLElement | null>(null);

/**
 * Handle keyboard shortcuts for quick action approval/rejection.
 * Enter or 'a' = approve, Escape or 'r' = reject
 */
function handleKeydown(event: KeyboardEvent) {
  // Only handle if this action card is focused or contains focus
  if (!cardRef.value?.contains(document.activeElement) && document.activeElement !== cardRef.value) {
    return;
  }

  if (event.key === 'Enter' || event.key.toLowerCase() === 'a') {
    event.preventDefault();
    emit('approve', props.action.id);
  } else if (event.key === 'Escape' || event.key.toLowerCase() === 'r') {
    event.preventDefault();
    emit('reject', props.action.id);
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  // Focus the card when it appears for keyboard accessibility
  cardRef.value?.focus();
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

const isFileAction = computed(() =>
  ['file-edit', 'file-create', 'file-delete'].includes(props.action.type)
);

const isBashAction = computed(() => props.action.type === 'bash-command');

const fileDetails = computed(() => {
  if (isFileAction.value) {
    return props.action.details as FileEditDetails;
  }
  return null;
});

const bashDetails = computed(() => {
  if (isBashAction.value) {
    return props.action.details as BashCommandDetails;
  }
  return null;
});

const actionIcon = computed(() => {
  switch (props.action.type) {
    case 'file-edit':
      return 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z';
    case 'file-create':
      return 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
    case 'file-delete':
      return 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';
    case 'bash-command':
      return 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z';
    default:
      return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
  }
});

const actionColor = computed(() => {
  switch (props.action.type) {
    case 'file-delete':
      return 'text-red-500';
    case 'bash-command':
      return 'text-yellow-500';
    default:
      return 'text-blue-500';
  }
});
</script>

<template>
  <div
    ref="cardRef"
    class="action-card animate-slide-up outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-surface-800"
    role="alertdialog"
    :aria-labelledby="`action-title-${action.id}`"
    :aria-describedby="`action-desc-${action.id}`"
    tabindex="0"
  >
    <!-- Header -->
    <div class="flex items-start gap-3 mb-3">
      <div
        :class="['flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-yellow-100 dark:bg-yellow-900/30', actionColor]"
        aria-hidden="true"
      >
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="actionIcon"
          />
        </svg>
      </div>
      <div class="flex-1">
        <h4
          :id="`action-title-${action.id}`"
          class="font-medium text-surface-900 dark:text-surface-100"
        >
          {{ action.description }}
        </h4>
        <p
          :id="`action-desc-${action.id}`"
          class="text-xs text-surface-500 dark:text-surface-400 mt-0.5"
        >
          Action requires your approval. Press Enter or 'A' to approve, Escape or 'R' to reject.
        </p>
      </div>
    </div>

    <!-- Details -->
    <div class="bg-surface-50 dark:bg-surface-900 rounded-lg p-3 mb-3">
      <!-- File details -->
      <template v-if="fileDetails">
        <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 mb-2">
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span class="font-mono text-xs truncate">{{ fileDetails.filePath }}</span>
        </div>
        <div
          v-if="fileDetails.diff"
          class="code-block text-xs max-h-40 overflow-y-auto"
        >
          <pre>{{ fileDetails.diff }}</pre>
        </div>
      </template>

      <!-- Bash command details -->
      <template v-if="bashDetails">
        <div class="code-block text-xs font-mono">
          <span class="text-green-500">$</span> {{ bashDetails.command }}
        </div>
        <div
          v-if="bashDetails.workingDirectory"
          class="text-xs text-surface-500 dark:text-surface-400 mt-2"
        >
          Working directory: {{ bashDetails.workingDirectory }}
        </div>
      </template>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 justify-end">
      <Button
        variant="ghost"
        size="sm"
        @click="emit('reject', action.id)"
      >
        Reject
      </Button>
      <Button
        variant="success"
        size="sm"
        @click="emit('approve', action.id)"
      >
        Approve
      </Button>
    </div>
  </div>
</template>
