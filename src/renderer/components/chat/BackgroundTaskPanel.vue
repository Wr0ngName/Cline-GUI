<script setup lang="ts">
/**
 * Background Task Panel - displays running and completed background tasks/agents
 * Similar to how Claude Code CLI displays background task status
 */

import { computed } from 'vue';

import type { BackgroundTask } from '@shared/types';
import type { IconName } from '../shared/Icon.vue';

import Icon from '../shared/Icon.vue';
import Spinner from '../shared/Spinner.vue';

interface Props {
  /** List of background tasks to display */
  tasks: BackgroundTask[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'dismiss', taskId: string): void;
  (e: 'clear-completed'): void;
}>();

const runningTasks = computed(() =>
  props.tasks.filter(t => t.status === 'running')
);

const completedTasks = computed(() =>
  props.tasks.filter(t => t.status !== 'running')
);

const hasCompletedTasks = computed(() => completedTasks.value.length > 0);

function getStatusIcon(status: BackgroundTask['status']): IconName {
  switch (status) {
    case 'running':
      return 'loading';
    case 'completed':
      return 'check';
    case 'failed':
      return 'error';
    case 'stopped':
      return 'stop';
    default:
      return 'info';
  }
}

function getStatusColor(status: BackgroundTask['status']): string {
  switch (status) {
    case 'running':
      return 'text-blue-500';
    case 'completed':
      return 'text-green-500';
    case 'failed':
      return 'text-red-500';
    case 'stopped':
      return 'text-yellow-500';
    default:
      return 'text-surface-500';
  }
}

function formatDuration(task: BackgroundTask): string {
  const endTime = task.completedAt || Date.now();
  const durationMs = endTime - task.startedAt;
  const seconds = Math.floor(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
</script>

<template>
  <div
    v-if="tasks.length > 0"
    class="background-task-panel"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-surface-200 dark:border-surface-700">
      <div class="flex items-center gap-2">
        <Icon
          name="terminal"
          size="sm"
          class="text-surface-500"
        />
        <span class="text-xs font-medium text-surface-600 dark:text-surface-400">
          Background Tasks
          <span
            v-if="runningTasks.length > 0"
            class="ml-1 text-blue-500"
          >
            ({{ runningTasks.length }} running)
          </span>
        </span>
      </div>
      <button
        v-if="hasCompletedTasks"
        class="text-xs text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        title="Clear completed tasks"
        @click="emit('clear-completed')"
      >
        Clear completed
      </button>
    </div>

    <!-- Task List -->
    <div class="max-h-40 overflow-y-auto">
      <!-- Running tasks first -->
      <div
        v-for="task in runningTasks"
        :key="task.id"
        class="task-item"
      >
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <Spinner
            size="xs"
            class="text-blue-500 flex-shrink-0"
          />
          <span class="text-xs text-surface-700 dark:text-surface-300 truncate">
            {{ task.description }}
          </span>
        </div>
        <span class="text-xs text-surface-400 flex-shrink-0">
          {{ formatDuration(task) }}
        </span>
      </div>

      <!-- Completed/failed/stopped tasks -->
      <div
        v-for="task in completedTasks"
        :key="task.id"
        class="task-item group"
      >
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <Icon
            :name="getStatusIcon(task.status)"
            size="xs"
            :class="[getStatusColor(task.status), 'flex-shrink-0']"
          />
          <span class="text-xs text-surface-600 dark:text-surface-400 truncate">
            {{ task.description }}
          </span>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="text-xs text-surface-400">
            {{ formatDuration(task) }}
          </span>
          <button
            class="opacity-0 group-hover:opacity-100 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-opacity"
            title="Dismiss"
            @click="emit('dismiss', task.id)"
          >
            <Icon
              name="close"
              size="xs"
            />
          </button>
        </div>
        <!-- Error message if failed -->
        <div
          v-if="task.status === 'failed' && task.error"
          class="w-full mt-1 text-xs text-red-500 truncate"
          :title="task.error"
        >
          {{ task.error }}
        </div>
        <!-- Summary if completed -->
        <div
          v-if="task.status === 'completed' && task.summary"
          class="w-full mt-1 text-xs text-surface-500 dark:text-surface-400 truncate"
          :title="task.summary"
        >
          {{ task.summary }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.background-task-panel {
  @apply bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden;
}

.task-item {
  @apply flex flex-wrap items-center gap-2 px-3 py-2 border-b border-surface-100 dark:border-surface-700/50 last:border-b-0;
}
</style>
