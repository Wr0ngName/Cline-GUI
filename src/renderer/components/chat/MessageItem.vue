<script setup lang="ts">
/**
 * Single message display component
 */

import DOMPurify from 'dompurify';
import { computed } from 'vue';

import type { ChatMessage } from '@shared/types';

import { formatTime } from '../../utils/date';
import Spinner from '../shared/Spinner.vue';

interface Props {
  /** The chat message to display */
  message: ChatMessage;
}

const props = defineProps<Props>();

const isUser = computed(() => props.message.role === 'user');

const formattedTime = computed(() => formatTime(props.message.timestamp));

// Simple markdown-like rendering for code blocks
const renderedContent = computed(() => {
  let content = props.message.content;

  // Replace code blocks with styled divs
  content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre class="code-block"><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Replace inline code (escape HTML to prevent XSS)
  content = content.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code class="px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded text-sm font-mono">${escapeHtml(code)}</code>`;
  });

  // Replace newlines with br tags (outside of pre blocks)
  content = content.replace(/\n/g, '<br>');

  // Sanitize HTML to prevent XSS attacks
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['pre', 'code', 'br', 'span'],
    ALLOWED_ATTR: ['class'],
  });
});

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
</script>

<template>
  <div
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
      class="prose prose-sm dark:prose-invert max-w-none text-surface-800 dark:text-surface-200"
      v-html="renderedContent"
    />
  </div>
</template>
