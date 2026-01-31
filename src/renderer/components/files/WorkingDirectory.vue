<script setup lang="ts">
/**
 * Working directory selector component
 */

import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { useFilesStore } from '../../stores/files';
import Button from '../shared/Button.vue';

const filesStore = useFilesStore();
const { workingDirectory, hasWorkingDirectory, isLoading } = storeToRefs(filesStore);

const displayPath = computed(() => {
  if (!workingDirectory.value) {
    return 'No directory selected';
  }
  // Show last 2 path segments for readability
  const parts = workingDirectory.value.split(/[/\\]/);
  if (parts.length > 2) {
    return '.../' + parts.slice(-2).join('/');
  }
  return workingDirectory.value;
});

async function selectDirectory() {
  await filesStore.selectDirectory();
}
</script>

<template>
  <div class="px-3 py-3 border-b border-surface-200 dark:border-surface-700">
    <div class="flex items-center gap-2">
      <div
        class="flex-1 flex items-center gap-2 px-3 py-2 bg-surface-100 dark:bg-surface-700 rounded-lg cursor-pointer hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
        @click="selectDirectory"
      >
        <svg
          class="w-4 h-4 text-surface-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <span
          :class="[
            'text-sm truncate',
            hasWorkingDirectory
              ? 'text-surface-700 dark:text-surface-300'
              : 'text-surface-400 dark:text-surface-500 italic',
          ]"
          :title="workingDirectory"
        >
          {{ displayPath }}
        </span>
      </div>

      <Button
        variant="secondary"
        size="sm"
        :loading="isLoading"
        @click="selectDirectory"
      >
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
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
      </Button>
    </div>
  </div>
</template>
