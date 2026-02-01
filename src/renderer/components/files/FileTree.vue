<script setup lang="ts">
/**
 * File tree component - displays project structure
 */

import { storeToRefs } from 'pinia';

import { useFilesStore } from '../../stores/files';
import FileTreeItem from './FileTreeItem.vue';
import Spinner from '../shared/Spinner.vue';
import { logger } from '../../utils/logger';

const filesStore = useFilesStore();
const { fileTree, hasFiles, isLoading, error } = storeToRefs(filesStore);

function handleFileSelect(path: string) {
  logger.debug('File selected', { path });
  // Could open in editor, show preview, etc.
}

function refresh() {
  filesStore.loadFileTree();
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-surface-200 dark:border-surface-700">
      <span class="text-xs font-medium uppercase text-surface-500 dark:text-surface-400">
        Files
      </span>
      <button
        class="btn-icon p-1"
        title="Refresh"
        :disabled="isLoading"
        @click="refresh"
      >
        <svg
          :class="['w-4 h-4', isLoading ? 'animate-spin' : '']"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto py-1">
      <!-- Loading state -->
      <div
        v-if="isLoading && !hasFiles"
        class="flex items-center justify-center h-full"
      >
        <Spinner size="md" />
      </div>

      <!-- Error state -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center h-full px-4 text-center"
      >
        <svg
          class="w-8 h-8 text-red-500 mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p class="text-sm text-surface-500 dark:text-surface-400">
          {{ error }}
        </p>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!hasFiles"
        class="flex flex-col items-center justify-center h-full px-4 text-center"
      >
        <svg
          class="w-8 h-8 text-surface-300 dark:text-surface-600 mb-2"
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
        <p class="text-sm text-surface-500 dark:text-surface-400">
          No working directory selected
        </p>
      </div>

      <!-- File tree -->
      <div v-else>
        <FileTreeItem
          v-for="node in fileTree"
          :key="node.path"
          :node="node"
          @select="handleFileSelect"
        />
      </div>
    </div>
  </div>
</template>
