<script setup lang="ts">
/**
 * Chat input box component
 */

import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';

import { useChatStore } from '../../stores/chat';
import { useFilesStore } from '../../stores/files';
import { useSettingsStore } from '../../stores/settings';
import Button from '../shared/Button.vue';

const emit = defineEmits<{
  (e: 'send', message: string): void;
  (e: 'abort'): void;
}>();

const chatStore = useChatStore();
const filesStore = useFilesStore();
const settingsStore = useSettingsStore();

const { isLoading } = storeToRefs(chatStore);
const { hasApiKey } = storeToRefs(settingsStore);
const { hasWorkingDirectory } = storeToRefs(filesStore);

const inputRef = ref<HTMLTextAreaElement | null>(null);
const message = ref('');

const canSend = computed(() => {
  return message.value.trim().length > 0 && hasApiKey.value && hasWorkingDirectory.value && !isLoading.value;
});

const placeholder = computed(() => {
  if (!hasApiKey.value) {
    return 'Please configure your API key in Settings...';
  }
  if (!hasWorkingDirectory.value) {
    return 'Please select a working directory first...';
  }
  return 'Ask Claude anything... (Shift+Enter for new line)';
});

function handleSubmit() {
  if (canSend.value) {
    emit('send', message.value.trim());
    message.value = '';
    // Reset textarea height
    if (inputRef.value) {
      inputRef.value.style.height = 'auto';
    }
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }
}

function handleAbort() {
  emit('abort');
}

// Auto-resize textarea
function handleInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}
</script>

<template>
  <div class="border-t border-surface-200 dark:border-surface-700 p-4 bg-white dark:bg-surface-800">
    <div class="flex gap-3 items-end">
      <div class="flex-1 relative">
        <textarea
          ref="inputRef"
          v-model="message"
          :placeholder="placeholder"
          :disabled="isLoading"
          class="input-base resize-none min-h-[44px] max-h-[200px] pr-4"
          rows="1"
          @keydown="handleKeydown"
          @input="handleInput"
        />
      </div>

      <div class="flex gap-2">
        <Button
          v-if="isLoading"
          variant="danger"
          size="md"
          @click="handleAbort"
        >
          <svg
            class="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Stop
        </Button>

        <Button
          v-else
          variant="primary"
          size="md"
          :disabled="!canSend"
          @click="handleSubmit"
        >
          <svg
            class="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
          Send
        </Button>
      </div>
    </div>

    <!-- Hints -->
    <div class="flex items-center justify-between mt-2 text-xs text-surface-400 dark:text-surface-500">
      <span>Press Enter to send, Shift+Enter for new line</span>
      <span v-if="message.length > 0">{{ message.length }} characters</span>
    </div>
  </div>
</template>
