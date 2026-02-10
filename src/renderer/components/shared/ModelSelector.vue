<script setup lang="ts">
/**
 * Model selector dropdown component
 * Displays available Claude models and allows the user to switch between them
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';

import type { ModelInfo } from '@shared/types';
import { useAsyncOperation } from '../../composables/useAsyncOperation';
import { useSettingsStore } from '../../stores/settings';
import { logger } from '../../utils/logger';
import Icon from './Icon.vue';
import Spinner from './Spinner.vue';
import TransitionFade from './TransitionFade.vue';

const settingsStore = useSettingsStore();
const { selectedModel } = storeToRefs(settingsStore);

const models = ref<ModelInfo[]>([]);
const { isLoading, execute } = useAsyncOperation();
const isOpen = ref(false);
const dropdownRef = ref<HTMLDivElement | null>(null);

// Cleanup function for models listener
let cleanupModelsListener: (() => void) | null = null;

// Current model display name
const currentModelDisplay = computed(() => {
  if (!selectedModel.value) {
    return 'Default';
  }
  const model = models.value.find(m => m.value === selectedModel.value);
  return model?.displayName || formatModelId(selectedModel.value);
});

// Format model ID for display if no display name available
function formatModelId(modelId: string): string {
  // Extract the model family from the ID (e.g., "claude-sonnet-4-5-20250929" -> "Sonnet 4.5")
  const match = modelId.match(/claude-(\w+)-(\d+)-?(\d+)?/);
  if (match) {
    const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    const version = match[3] ? `${match[2]}.${match[3]}` : match[2];
    return `${family} ${version}`;
  }
  return modelId;
}

// Load available models
async function loadModels(): Promise<void> {
  await execute(async () => {
    const loadedModels = await window.electron.claude.getModels();
    models.value = loadedModels;
    logger.debug('Loaded models', { count: loadedModels.length });
  }, 'Failed to load models');
}

// Select a model
async function selectModel(modelValue: string): Promise<void> {
  isOpen.value = false;
  if (modelValue === selectedModel.value) return;

  try {
    await settingsStore.setSelectedModel(modelValue);
    logger.info('Model changed', { model: modelValue || '(default)' });
  } catch (err) {
    logger.error('Failed to change model', err);
  }
}

// Toggle dropdown
function toggleDropdown(): void {
  isOpen.value = !isOpen.value;
  // Load models when opening if not yet loaded
  if (isOpen.value && models.value.length === 0) {
    loadModels();
  }
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent): void {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  // Load models initially
  loadModels();

  // Listen for model updates from the SDK
  cleanupModelsListener = window.electron.claude.onModelsChanged((newModels) => {
    models.value = newModels;
    logger.debug('Models updated from SDK', { count: newModels.length });
  });

  // Add click outside listener
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (cleanupModelsListener) {
    cleanupModelsListener();
  }
  document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
  <div
    ref="dropdownRef"
    class="relative"
  >
    <!-- Selector Button -->
    <button
      class="flex items-center gap-1.5 px-2 py-1 text-sm rounded-md hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-600 dark:text-surface-400 transition-colors"
      :class="{ 'bg-surface-100 dark:bg-surface-700': isOpen }"
      title="Select AI model"
      @click.stop="toggleDropdown"
    >
      <Icon
        name="cpu"
        size="sm"
        class="flex-shrink-0"
      />
      <span class="max-w-[100px] truncate">{{ currentModelDisplay }}</span>
      <Icon
        :name="isOpen ? 'chevron-up' : 'chevron-down'"
        size="xs"
        class="flex-shrink-0 opacity-60"
      />
    </button>

    <!-- Dropdown Menu -->
    <TransitionFade type="scale">
      <div
        v-if="isOpen"
        class="absolute right-0 top-full mt-1 z-50 min-w-[200px] max-w-[280px] rounded-lg shadow-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 py-1 overflow-hidden"
      >
        <!-- Loading state -->
        <div
          v-if="isLoading"
          class="flex items-center justify-center py-4"
        >
          <Spinner size="sm" />
        </div>

        <!-- Empty state -->
        <div
          v-else-if="models.length === 0"
          class="px-3 py-2 text-sm text-surface-500 dark:text-surface-400 text-center"
        >
          <p>No models available</p>
          <p class="text-xs mt-1">Start a conversation to load models</p>
        </div>

        <!-- Model list -->
        <template v-else>
          <!-- Default option -->
          <button
            class="w-full px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            :class="{ 'bg-primary-50 dark:bg-primary-900/20': !selectedModel }"
            @click="selectModel('')"
          >
            <div class="flex items-center gap-2">
              <span
                class="flex-shrink-0 w-4 h-4 flex items-center justify-center"
              >
                <Icon
                  v-if="!selectedModel"
                  name="check"
                  size="sm"
                  class="text-primary-500"
                />
              </span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-surface-800 dark:text-surface-200">
                  Default
                </div>
                <div class="text-xs text-surface-500 dark:text-surface-400 truncate">
                  Use SDK default model
                </div>
              </div>
            </div>
          </button>

          <div class="h-px bg-surface-200 dark:bg-surface-700 my-1" />

          <!-- Available models -->
          <button
            v-for="model in models"
            :key="model.value"
            class="w-full px-3 py-2 text-left text-sm hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            :class="{ 'bg-primary-50 dark:bg-primary-900/20': selectedModel === model.value }"
            @click="selectModel(model.value)"
          >
            <div class="flex items-center gap-2">
              <span
                class="flex-shrink-0 w-4 h-4 flex items-center justify-center"
              >
                <Icon
                  v-if="selectedModel === model.value"
                  name="check"
                  size="sm"
                  class="text-primary-500"
                />
              </span>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-surface-800 dark:text-surface-200">
                  {{ model.displayName }}
                </div>
                <div
                  v-if="model.description"
                  class="text-xs text-surface-500 dark:text-surface-400 truncate"
                >
                  {{ model.description }}
                </div>
              </div>
            </div>
          </button>
        </template>
      </div>
    </TransitionFade>
  </div>
</template>
