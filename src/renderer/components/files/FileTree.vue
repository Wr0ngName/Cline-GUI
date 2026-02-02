<script setup lang="ts">
/**
 * File tree component - displays project structure
 */

import { storeToRefs } from 'pinia';

import { useFilesStore } from '../../stores/files';
import FileTreeItem from './FileTreeItem.vue';
import Spinner from '../shared/Spinner.vue';
import Icon from '../shared/Icon.vue';
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
        <Icon
          name="refresh"
          size="sm"
          :class="isLoading ? 'animate-spin' : ''"
        />
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
        <Icon
          name="warning"
          size="lg"
          class="text-red-500 mb-2"
        />
        <p class="text-sm text-surface-500 dark:text-surface-400">
          {{ error }}
        </p>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!hasFiles"
        class="flex flex-col items-center justify-center h-full px-4 text-center"
      >
        <Icon
          name="folder"
          size="lg"
          class="text-surface-300 dark:text-surface-600 mb-2"
        />
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
