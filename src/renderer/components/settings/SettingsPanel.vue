<script setup lang="ts">
/**
 * Settings panel component
 */

import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '../../stores/settings';
import Button from '../shared/Button.vue';
import Modal from '../shared/Modal.vue';

interface Props {
  open: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const settingsStore = useSettingsStore();
const { config, isSaving, hasApiKey, theme } = storeToRefs(settingsStore);

// Local form state
const localApiKey = ref('');
const localTheme = ref<'light' | 'dark' | 'system'>('system');
const localFontSize = ref(14);
const showApiKey = ref(false);

// Sync with store when modal opens
watch(
  () => config.value,
  (newConfig) => {
    // Don't overwrite API key if user is editing
    if (!localApiKey.value) {
      localApiKey.value = newConfig.apiKey;
    }
    localTheme.value = newConfig.theme;
    localFontSize.value = newConfig.fontSize;
  },
  { immediate: true }
);

async function saveSettings() {
  await settingsStore.saveConfig({
    apiKey: localApiKey.value,
    theme: localTheme.value,
    fontSize: localFontSize.value,
  });
  emit('close');
}

function cancel() {
  // Reset local state
  localApiKey.value = config.value.apiKey;
  localTheme.value = config.value.theme;
  localFontSize.value = config.value.fontSize;
  showApiKey.value = false;
  emit('close');
}
</script>

<template>
  <Modal
    :open="open"
    title="Settings"
    size="md"
    @close="cancel"
  >
    <div class="space-y-6">
      <!-- API Key -->
      <div>
        <label
          for="api-key"
          class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
        >
          Anthropic API Key
        </label>
        <div class="relative">
          <input
            id="api-key"
            v-model="localApiKey"
            :type="showApiKey ? 'text' : 'password'"
            class="input-base pr-10"
            placeholder="sk-ant-..."
          >
          <button
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 btn-icon p-1"
            @click="showApiKey = !showApiKey"
          >
            <svg
              v-if="showApiKey"
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
            <svg
              v-else
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
        </div>
        <p class="mt-1 text-xs text-surface-500 dark:text-surface-400">
          Your API key is encrypted and stored securely.
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            class="text-primary-500 hover:underline"
          >
            Get your API key
          </a>
        </p>
      </div>

      <!-- Theme -->
      <div>
        <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">
          Theme
        </label>
        <div class="flex gap-2">
          <button
            v-for="option in ['light', 'dark', 'system'] as const"
            :key="option"
            :class="[
              'flex-1 px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors',
              localTheme === option
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                : 'border-surface-300 dark:border-surface-600 text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700',
            ]"
            @click="localTheme = option"
          >
            {{ option }}
          </button>
        </div>
      </div>

      <!-- Font Size -->
      <div>
        <label
          for="font-size"
          class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2"
        >
          Font Size: {{ localFontSize }}px
        </label>
        <input
          id="font-size"
          v-model.number="localFontSize"
          type="range"
          min="12"
          max="20"
          step="1"
          class="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-lg appearance-none cursor-pointer"
        >
        <div class="flex justify-between text-xs text-surface-400 mt-1">
          <span>12px</span>
          <span>20px</span>
        </div>
      </div>

      <!-- Status -->
      <div class="pt-4 border-t border-surface-200 dark:border-surface-700">
        <div class="flex items-center gap-2 text-sm">
          <div
            :class="[
              'w-2 h-2 rounded-full',
              hasApiKey ? 'bg-green-500' : 'bg-red-500',
            ]"
          />
          <span class="text-surface-600 dark:text-surface-400">
            {{ hasApiKey ? 'API key configured' : 'API key not configured' }}
          </span>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        variant="ghost"
        @click="cancel"
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        :loading="isSaving"
        @click="saveSettings"
      >
        Save Changes
      </Button>
    </template>
  </Modal>
</template>
