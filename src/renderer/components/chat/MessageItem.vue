<script setup lang="ts">
/**
 * Single message display component
 * Note: v-html usage is safe - content is sanitized with DOMPurify in renderMarkdown
 */

import { computed } from 'vue';

import type { ChatMessage } from '@shared/types';

import { formatTime } from '../../utils/date';
import { renderMarkdown } from '../../utils/markdown';
import Spinner from '../shared/Spinner.vue';

interface Props {
  /** The chat message to display */
  message: ChatMessage;
}

const props = defineProps<Props>();

const isUser = computed(() => props.message.role === 'user');
const isSystem = computed(() => props.message.role === 'system');

const formattedTime = computed(() => formatTime(props.message.timestamp));

const renderedContent = computed(() => renderMarkdown(props.message.content));
</script>

<template>
  <!-- System message (e.g. model change notification) -->
  <div
    v-if="isSystem"
    class="flex items-center gap-3 py-2 px-4 animate-fade-in"
  >
    <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
    <span class="text-xs text-surface-400 dark:text-surface-500 whitespace-nowrap">
      {{ message.content }}
    </span>
    <div class="flex-1 h-px bg-surface-200 dark:bg-surface-700" />
  </div>

  <!-- User / Assistant message -->
  <div
    v-else
    :class="[
      'p-4 rounded-lg animate-fade-in',
      isUser ? 'message-user' : 'message-assistant',
    ]"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <div
        :class="[
          'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
          isUser
            ? 'bg-primary-500 text-white'
            : 'bg-surface-300 dark:bg-surface-600 text-surface-700 dark:text-surface-200',
        ]"
      >
        {{ isUser ? 'U' : 'C' }}
      </div>
      <span class="font-medium text-sm text-surface-700 dark:text-surface-300">
        {{ isUser ? 'You' : 'Claude' }}
      </span>
      <span class="text-xs text-surface-400 dark:text-surface-500">
        {{ formattedTime }}
      </span>
      <Spinner
        v-if="message.isStreaming"
        size="sm"
        class="ml-2 text-primary-500"
      />
    </div>

    <!-- Content -->
    <div
      class="prose prose-sm dark:prose-invert max-w-none text-surface-800 dark:text-surface-200 message-content"
      v-html="renderedContent"
    />
  </div>
</template>

<style scoped>
.message-content {
  font-size: var(--chat-font-size, 14px) !important;
  line-height: 1.6;
}

/* Override prose-sm font sizes for all elements */
.message-content :deep(*) {
  font-size: inherit;
}
</style>
