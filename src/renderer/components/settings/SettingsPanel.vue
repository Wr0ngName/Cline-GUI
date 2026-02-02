<script setup lang="ts">
/**
 * Settings panel component with OAuth login support
 */

import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '../../stores/settings';
import Button from '../shared/Button.vue';
import Modal from '../shared/Modal.vue';
import AuthForm from '../shared/AuthForm.vue';

interface Props {
  open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const settingsStore = useSettingsStore();
const { config, isSaving } = storeToRefs(settingsStore);

// Local form state
const localTheme = ref<'light' | 'dark' | 'system'>('system');
const localFontSize = ref(14);
const authFormRef = ref<InstanceType<typeof AuthForm>>();

// Sync with store when modal opens
watch(
  () => config.value,
  (newConfig) => {
    localTheme.value = newConfig.theme;
    localFontSize.value = newConfig.fontSize;
  },
  { immediate: true }
);

// Refresh auth status when modal opens
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await authFormRef.value?.refreshAuthStatus();
      authFormRef.value?.resetState();
    }
  }
);

async function saveSettings() {
  // Always save theme and font size
  await settingsStore.saveConfig({
    theme: localTheme.value,
    fontSize: localFontSize.value,
  });

  emit('close');
}

function cancel() {
  // Reset local state
  localTheme.value = config.value.theme;
  localFontSize.value = config.value.fontSize;
  authFormRef.value?.resetState();
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
      <!-- Authentication Section -->
      <AuthForm
        ref="authFormRef"
        :show-title="true"
      />

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
