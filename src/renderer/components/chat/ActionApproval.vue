<script setup lang="ts">
/**
 * Action approval component - shows pending actions for user approval
 */

import { computed, onMounted, onUnmounted, ref } from 'vue';

import type { PendingAction, FileEditDetails, BashCommandDetails } from '@shared/types';
import type { IconName } from '../shared/Icon.vue';

import Button from '../shared/Button.vue';
import Icon from '../shared/Icon.vue';

interface Props {
  /** The pending action requiring user approval */
  action: PendingAction;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'approve', actionId: string, alwaysAllow?: boolean): void;
  (e: 'reject', actionId: string): void;
}>();

// For focus management
const cardRef = ref<HTMLElement | null>(null);

/**
 * Handle keyboard shortcuts for quick action approval/rejection.
 * Enter or 'a' = approve, Shift+Enter or 'A' = always allow, Escape or 'r' = reject
 */
function handleKeydown(event: KeyboardEvent) {
  // Only handle if this action card is focused or contains focus
  if (!cardRef.value?.contains(document.activeElement) && document.activeElement !== cardRef.value) {
    return;
  }

  if (event.key === 'Enter' && event.shiftKey) {
    // Shift+Enter = approve and always allow
    event.preventDefault();
    emit('approve', props.action.id, true);
  } else if (event.key === 'Enter' || event.key === 'a') {
    event.preventDefault();
    emit('approve', props.action.id, false);
  } else if (event.key === 'A' && !event.shiftKey) {
    // Capital A = always allow
    event.preventDefault();
    emit('approve', props.action.id, true);
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

const actionIcon = computed((): IconName => {
  switch (props.action.type) {
    case 'file-edit':
      return 'edit';
    case 'file-create':
      return 'document';
    case 'file-delete':
      return 'trash';
    case 'bash-command':
      return 'terminal';
    default:
      return 'info';
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

/** Dynamic label for the "always allow" button based on SDK permission suggestions */
const alwaysAllowLabel = computed(() => {
  return props.action.permissionInfo?.alwaysAllowLabel ?? 'Always Allow';
});

/** Tooltip for the "always allow" button showing full permission details */
const alwaysAllowTooltip = computed(() => {
  return props.action.permissionInfo?.description
    ?? 'Approve this action and allow similar actions automatically in the future';
});

/** Scope badge for the "always allow" button */
const permissionScope = computed(() => {
  return props.action.permissionInfo?.scope;
});

/** Keyboard shortcut hint text */
const shortcutHint = computed(() => {
  const alwaysLabel = alwaysAllowLabel.value;
  return `Action requires approval. Keys: Enter/a=allow once, Shift+Enter/A=${alwaysLabel}, Esc/r=deny`;
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
        <Icon
          :name="actionIcon"
          size="sm"
          aria-hidden="true"
        />
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
          {{ shortcutHint }}
        </p>
      </div>
    </div>

    <!-- Details -->
    <div class="bg-surface-50 dark:bg-surface-900 rounded-lg p-3 mb-3">
      <!-- File details -->
      <template v-if="fileDetails">
        <div class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400 mb-2">
          <Icon
            name="document"
            size="sm"
          />
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
    <div class="flex gap-2 justify-end items-center">
      <Button
        variant="ghost"
        size="sm"
        @click="emit('reject', action.id)"
      >
        Deny
      </Button>
      <Button
        variant="success"
        size="sm"
        @click="emit('approve', action.id, false)"
      >
        Allow Once
      </Button>
      <Button
        variant="secondary"
        size="sm"
        :title="alwaysAllowTooltip"
        :aria-label="`${alwaysAllowLabel} - ${alwaysAllowTooltip}`"
        @click="emit('approve', action.id, true)"
      >
        <span
          v-if="permissionScope"
          :class="[
            'inline-block w-2 h-2 rounded-full mr-1.5',
            permissionScope === 'session' ? 'bg-blue-400' :
            permissionScope === 'project' ? 'bg-yellow-400' :
            'bg-green-400'
          ]"
          :title="permissionScope === 'session' ? 'Session only' :
                  permissionScope === 'project' ? 'Project scope' :
                  'Global scope'"
        />
        {{ alwaysAllowLabel }}
      </Button>
    </div>
  </div>
</template>
