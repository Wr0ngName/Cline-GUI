<script setup lang="ts">
/**
 * Message list component - displays chat messages
 */

import { ref, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';

import { useChatStore } from '../../stores/chat';
import MessageItem from './MessageItem.vue';

const chatStore = useChatStore();
const { messages, hasMessages } = storeToRefs(chatStore);

const listRef = ref<HTMLDivElement | null>(null);

// Auto-scroll to bottom when new messages arrive
watch(
  messages,
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight;
      }
    });
  },
  { deep: true }
);
</script>

<template>
  <div
    ref="listRef"
    class="flex-1 overflow-y-auto p-4 space-y-4"
  >
    <!-- Empty state -->
    <div
      v-if="!hasMessages"
      class="flex flex-col items-center justify-center h-full text-center"
    >
      <div class="w-16 h-16 mb-4 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
        <svg
          class="w-8 h-8 text-primary-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 class="text-lg font-medium text-surface-700 dark:text-surface-300 mb-2">
        Start a conversation
      </h3>
      <p class="text-sm text-surface-500 dark:text-surface-400 max-w-sm">
        Ask Claude to help you with coding, explain concepts, or make changes to your files.
      </p>
    </div>

    <!-- Messages -->
    <TransitionGroup
      v-else
      name="message"
      tag="div"
      class="space-y-4"
    >
      <MessageItem
        v-for="message in messages"
        :key="message.id"
        :message="message"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.message-enter-active,
.message-leave-active {
  transition: all 0.2s ease;
}

.message-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.message-leave-to {
  opacity: 0;
}
</style>
