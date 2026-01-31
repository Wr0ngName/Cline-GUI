<script setup lang="ts">
/**
 * File tree item component - recursive file/directory display
 */

import { computed } from 'vue';

import type { FileNode } from '@shared/types';

import { useFilesStore } from '../../stores/files';

interface Props {
  node: FileNode;
  depth?: number;
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
});

const emit = defineEmits<{
  (e: 'select', path: string): void;
}>();

const filesStore = useFilesStore();

const isDirectory = computed(() => props.node.type === 'directory');
const isExpanded = computed(() => filesStore.isDirectoryExpanded(props.node.path));
const isSelected = computed(() => filesStore.selectedFile === props.node.path);

const icon = computed(() => {
  if (isDirectory.value) {
    return isExpanded.value
      ? 'M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z'
      : 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z';
  }

  // File icons based on extension
  const ext = props.node.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253';
    case 'vue':
      return 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01';
    case 'json':
      return 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4';
    case 'md':
      return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
    default:
      return 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z';
  }
});

function handleClick() {
  if (isDirectory.value) {
    filesStore.toggleDirectory(props.node.path);
  } else {
    filesStore.selectFile(props.node.path);
    emit('select', props.node.path);
  }
}
</script>

<template>
  <div>
    <button
      :class="[
        'w-full flex items-center gap-2 px-2 py-1 text-left text-sm rounded hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors',
        isSelected && !isDirectory ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-surface-700 dark:text-surface-300',
      ]"
      :style="{ paddingLeft: `${depth * 12 + 8}px` }"
      @click="handleClick"
    >
      <!-- Expand/collapse chevron for directories -->
      <svg
        v-if="isDirectory"
        :class="[
          'w-3 h-3 transition-transform flex-shrink-0',
          isExpanded ? 'rotate-90' : '',
        ]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5l7 7-7 7"
        />
      </svg>
      <span
        v-else
        class="w-3"
      />

      <!-- Icon -->
      <svg
        :class="[
          'w-4 h-4 flex-shrink-0',
          isDirectory ? 'text-yellow-500' : 'text-surface-400',
        ]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          :d="icon"
        />
      </svg>

      <!-- Name -->
      <span class="truncate">{{ node.name }}</span>
    </button>

    <!-- Children (recursive) -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isDirectory && isExpanded && node.children"
        class="overflow-hidden"
      >
        <FileTreeItem
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
          @select="emit('select', $event)"
        />
      </div>
    </Transition>
  </div>
</template>
