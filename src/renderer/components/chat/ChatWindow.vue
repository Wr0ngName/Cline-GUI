<script setup lang="ts">
/**
 * Main chat window component
 */

import { storeToRefs } from 'pinia';

import { useChatStore } from '../../stores/chat';
import { useClaudeChat } from '../../composables/useClaudeChat';
import MessageList from './MessageList.vue';
import InputBox from './InputBox.vue';
import ActionApproval from './ActionApproval.vue';
import Toast from '../shared/Toast.vue';

const chatStore = useChatStore();
const { pendingActions, error, hasPendingActions } = storeToRefs(chatStore);

const { sendMessage, approveAction, rejectAction, abort } = useClaudeChat();

function handleSend(message: string) {
  sendMessage(message);
}

function handleAbort() {
  abort();
}

function handleApprove(actionId: string, alwaysAllow?: boolean) {
  approveAction(actionId, alwaysAllow);
}

function handleReject(actionId: string) {
  rejectAction(actionId);
}

function clearError() {
  chatStore.clearError();
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Error toast -->
    <Transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="error"
        class="absolute top-0 left-0 right-0 z-10 p-4"
      >
        <Toast
          type="error"
          :message="error"
          @dismiss="clearError"
        />
      </div>
    </Transition>

    <!-- Messages -->
    <MessageList />

    <!-- Pending actions -->
    <div
      v-if="hasPendingActions"
      class="border-t border-surface-200 dark:border-surface-700 p-4 space-y-3 max-h-[40%] overflow-y-auto"
    >
      <TransitionGroup
        name="action"
        tag="div"
        class="space-y-3"
      >
        <ActionApproval
          v-for="action in pendingActions"
          :key="action.id"
          :action="action"
          @approve="handleApprove"
          @reject="handleReject"
        />
      </TransitionGroup>
    </div>

    <!-- Input -->
    <InputBox
      @send="handleSend"
      @abort="handleAbort"
    />
  </div>
</template>

<style scoped>
.action-enter-active,
.action-leave-active {
  transition: all 0.2s ease;
}

.action-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.action-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
