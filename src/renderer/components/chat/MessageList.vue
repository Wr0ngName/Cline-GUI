<script setup lang="ts">
/**
 * Message list component - displays chat messages
 */

import { ref, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';

import { useChatStore } from '../../stores/chat';
import MessageItem from './MessageItem.vue';
import Icon from '../shared/Icon.vue';

const chatStore = useChatStore();
const { messages, hasMessages } = storeToRefs(chatStore);

const listRef = ref<HTMLDivElement | null>(null);

// Auto-scroll to bottom when new messages arrive
watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      if (listRef.value) {
        listRef.value.scrollTop = listRef.value.scrollHeight;
      }
    });
  }
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
        <Icon
          name="chat"
          size="lg"
          class="text-primary-500"
        />
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
