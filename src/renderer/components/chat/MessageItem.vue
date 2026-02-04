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

// Simple markdown rendering
const renderedContent = computed(() => {
  let content = props.message.content;

  // Replace code blocks first (before other processing)
  content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, lang, code) => {
    return `<pre class="code-block"><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`;
  });

  // Replace inline code (escape HTML to prevent XSS)
  content = content.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code class="px-1 py-0.5 bg-surface-100 dark:bg-surface-700 rounded text-sm font-mono">${escapeHtml(code)}</code>`;
  });

  // Replace headers (## Header)
  content = content.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>');
  content = content.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>');
  content = content.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');

  // Replace bold (**text** or __text__)
  content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  content = content.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Replace italic (*text* or _text_) - but not inside URLs or already processed
  content = content.replace(/(?<![*_])\*([^*]+)\*(?![*_])/g, '<em>$1</em>');
  content = content.replace(/(?<![*_])_([^_]+)_(?![*_])/g, '<em>$1</em>');

  // Replace bullet lists (- item)
  content = content.replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>');

  // Wrap consecutive li elements in ul
  content = content.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, (match) => {
    return `<ul class="list-disc list-inside my-2">${match}</ul>`;
  });

  // Replace links [text](url)
  content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary-500 hover:underline" target="_blank" rel="noopener">$1</a>');

  // Replace newlines with br tags (but not inside pre/ul blocks)
  content = content.replace(/\n/g, '<br>');

  // Clean up br tags that shouldn't be there
  content = content.replace(/<br>\s*<(h[1-6]|ul|li|pre)/g, '<$1');
  content = content.replace(/<\/(h[1-6]|ul|li|pre)>\s*<br>/g, '</$1>');

  // Sanitize HTML to prevent XSS attacks
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['pre', 'code', 'br', 'span', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'li', 'a'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
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
