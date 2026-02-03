<script setup lang="ts">
/**
 * Conversation history sidebar component
 * Displays list of past conversations with load/delete functionality
 */

import { storeToRefs } from 'pinia';
import { ref } from 'vue';

import { useConversationsStore } from '../../stores/conversations';
import { formatRelativeDate } from '../../utils/date';
import Spinner from '../shared/Spinner.vue';
import Icon from '../shared/Icon.vue';

const conversationsStore = useConversationsStore();
const {
  sortedConversations,
  currentConversationId,
  isLoading,
  isSaving,
} = storeToRefs(conversationsStore);

const deletingId = ref<string | null>(null);
const confirmDeleteId = ref<string | null>(null);

async function handleNewConversation() {
  // Save current conversation before creating new one
  await conversationsStore.saveCurrentConversation();
  conversationsStore.createNewConversation();
}

async function handleLoadConversation(id: string) {
  if (id === currentConversationId.value) {
    return;
  }
  // Save current conversation before switching
  await conversationsStore.saveCurrentConversation();
  await conversationsStore.loadConversation(id);
}

function handleDeleteClick(id: string, event: Event) {
  event.stopPropagation();
  confirmDeleteId.value = id;
}

async function handleConfirmDelete(id: string) {
  deletingId.value = id;
  await conversationsStore.deleteConversation(id);
  deletingId.value = null;
  confirmDeleteId.value = null;
}

function handleCancelDelete() {
  confirmDeleteId.value = null;
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between p-3 border-b border-surface-200 dark:border-surface-700">
      <h2 class="text-sm font-semibold text-surface-700 dark:text-surface-300">
        History
      </h2>
      <div class="flex items-center gap-2">
        <Spinner
          v-if="isSaving"
          size="sm"
          class="text-surface-400"
        />
        <button
          class="p-1.5 rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400 transition-colors"
          title="New conversation"
          @click="handleNewConversation"
        >
          <Icon
            name="plus"
            size="sm"
          />
        </button>
      </div>
    </div>

    <!-- Conversation List -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading state -->
      <div
        v-if="isLoading && sortedConversations.length === 0"
        class="flex items-center justify-center py-8"
      >
        <Spinner size="md" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="sortedConversations.length === 0"
        class="flex flex-col items-center justify-center py-8 px-4 text-center"
      >
        <Icon
          name="chat"
          size="xl"
          class="text-surface-300 dark:text-surface-600 mb-3"
          style="width: 3rem; height: 3rem;"
        />
        <p class="text-sm text-surface-500 dark:text-surface-400">
          No conversations yet
        </p>
        <p class="text-xs text-surface-400 dark:text-surface-500 mt-1">
          Start chatting to create your first conversation
        </p>
      </div>

      <!-- Conversations -->
      <div
        v-else
        class="divide-y divide-surface-100 dark:divide-surface-700"
      >
        <div
          v-for="conversation in sortedConversations"
          :key="conversation.id"
          class="group relative"
        >
          <!-- Confirmation overlay -->
          <div
            v-if="confirmDeleteId === conversation.id"
            class="absolute inset-0 bg-red-50 dark:bg-red-900/20 flex items-center justify-center gap-2 z-10"
          >
            <button
              class="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors"
              :disabled="deletingId === conversation.id"
              @click="handleConfirmDelete(conversation.id)"
            >
              <span v-if="deletingId === conversation.id">
                <Spinner size="xs" />
              </span>
              <span v-else>Delete</span>
            </button>
            <button
              class="px-2 py-1 text-xs font-medium text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 rounded transition-colors"
              @click="handleCancelDelete"
            >
              Cancel
            </button>
          </div>

          <!-- Conversation item -->
          <button
            class="w-full text-left px-3 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors"
            :class="{
              'bg-primary-50 dark:bg-primary-900/20': currentConversationId === conversation.id,
            }"
            @click="handleLoadConversation(conversation.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <p
                  class="text-sm font-medium truncate"
                  :class="
                    currentConversationId === conversation.id
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-surface-800 dark:text-surface-200'
                  "
                >
                  {{ conversation.title || 'New Conversation' }}
                </p>
                <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5 truncate">
                  {{ conversation.workingDirectory }}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-xs text-surface-400 dark:text-surface-500 whitespace-nowrap">
                  {{ formatRelativeDate(conversation.updatedAt) }}
                </span>
                <!-- Delete button -->
                <button
                  class="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-400 hover:text-red-500 dark:hover:text-red-400 transition-all"
                  title="Delete conversation"
                  @click="handleDeleteClick(conversation.id, $event)"
                >
                  <Icon
                    name="trash"
                    size="xs"
                  />
                </button>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
