<script setup lang="ts">
/**
 * Settings panel component with OAuth login support
 */

import { ref, watch, onMounted } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '../../stores/settings';
import type { AuthStatus } from '../../../shared/types';
import Button from '../shared/Button.vue';
import Modal from '../shared/Modal.vue';
import { logger } from '../../utils/logger';

interface Props {
  open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const settingsStore = useSettingsStore();
const { config, isSaving } = storeToRefs(settingsStore);

// Auth state
const authStatus = ref<AuthStatus>({ isAuthenticated: false, method: 'none' });
const isLoggingIn = ref(false);
const loginError = ref('');
const oauthCode = ref('');
const showCodeInput = ref(false);

// Local form state
const localApiKey = ref('');
const localTheme = ref<'light' | 'dark' | 'system'>('system');
const localFontSize = ref(14);
const showApiKey = ref(false);
const authTab = ref<'oauth' | 'api-key'>('oauth');

// Fetch auth status on mount
onMounted(async () => {
  await refreshAuthStatus();
});

async function refreshAuthStatus() {
  try {
    authStatus.value = await window.electron.auth.getStatus();
  } catch (err) {
    logger.error('Failed to get auth status', err);
  }
}

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

// Refresh auth status when modal opens
watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await refreshAuthStatus();
      loginError.value = '';
      oauthCode.value = '';
      showCodeInput.value = false;
    }
  }
);

async function startOAuthLogin() {
  isLoggingIn.value = true;
  loginError.value = '';
  oauthCode.value = '';

  try {
    const result = await window.electron.auth.startOAuth();

    if (result.error) {
      loginError.value = result.error;
      isLoggingIn.value = false;
      return;
    }

    if (result.authUrl) {
      // URL opened in browser, show code input
      showCodeInput.value = true;
      isLoggingIn.value = false;
    }
  } catch (error) {
    loginError.value = `Failed to start login: ${error}`;
    isLoggingIn.value = false;
  }
}

async function completeOAuthLogin() {
  if (!oauthCode.value.trim()) {
    loginError.value = 'Please enter the code from your browser';
    return;
  }

  isLoggingIn.value = true;
  loginError.value = '';

  try {
    const result = await window.electron.auth.completeOAuth(oauthCode.value.trim());

    if (result.success) {
      await refreshAuthStatus();
      showCodeInput.value = false;
      oauthCode.value = '';
    } else {
      loginError.value = result.error || 'Login failed';
    }
  } catch (error) {
    loginError.value = `Login failed: ${error}`;
  } finally {
    isLoggingIn.value = false;
  }
}

async function logout() {
  try {
    await window.electron.auth.logout();
    await refreshAuthStatus();
    localApiKey.value = '';
  } catch (err) {
    logger.error('Logout failed', err);
  }
}

async function saveSettings() {
  // Save API key if using API key auth
  if (authTab.value === 'api-key' && localApiKey.value) {
    await settingsStore.saveConfig({
      apiKey: localApiKey.value,
      authMethod: 'api-key',
    });
  }

  // Always save theme and font size
  await settingsStore.saveConfig({
    theme: localTheme.value,
    fontSize: localFontSize.value,
  });

  await refreshAuthStatus();
  emit('close');
}

function cancel() {
  // Reset local state
  localApiKey.value = config.value.apiKey;
  localTheme.value = config.value.theme;
  localFontSize.value = config.value.fontSize;
  showApiKey.value = false;
  showCodeInput.value = false;
  oauthCode.value = '';
  loginError.value = '';
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
      <div>
        <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
          Authentication
        </label>

        <!-- Already authenticated -->
        <div
          v-if="authStatus.isAuthenticated"
          class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                <svg
                  class="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p class="font-medium text-green-800 dark:text-green-200">
                  Logged in
                </p>
                <p class="text-sm text-green-600 dark:text-green-400">
                  {{ authStatus.displayName || (authStatus.method === 'oauth' ? 'Claude Pro/Max Account' : 'API Key') }}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              @click="logout"
            >
              Logout
            </Button>
          </div>
        </div>

        <!-- Not authenticated - show login options -->
        <div
          v-else
          class="space-y-4"
        >
          <!-- Auth method tabs -->
          <div class="flex border-b border-surface-200 dark:border-surface-700">
            <button
              :class="[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                authTab === 'oauth'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
              ]"
              @click="authTab = 'oauth'"
            >
              Claude Pro/Max
            </button>
            <button
              :class="[
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                authTab === 'api-key'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300',
              ]"
              @click="authTab = 'api-key'"
            >
              API Key
            </button>
          </div>

          <!-- OAuth Login -->
          <div
            v-if="authTab === 'oauth'"
            class="space-y-4"
          >
            <p class="text-sm text-surface-600 dark:text-surface-400">
              Login with your Claude Pro or Max subscription. A browser window will open for authentication.
            </p>

            <!-- Code input (shown after OAuth URL is opened) -->
            <div
              v-if="showCodeInput"
              class="space-y-3"
            >
              <p class="text-sm text-surface-600 dark:text-surface-400">
                Enter the code shown in your browser after logging in:
              </p>
              <input
                v-model="oauthCode"
                type="text"
                class="input-base font-mono"
                placeholder="Paste the code here..."
                @keyup.enter="completeOAuthLogin"
              >
              <div class="flex gap-2">
                <Button
                  variant="primary"
                  :loading="isLoggingIn"
                  class="flex-1"
                  @click="completeOAuthLogin"
                >
                  Complete Login
                </Button>
                <Button
                  variant="ghost"
                  @click="showCodeInput = false; oauthCode = ''"
                >
                  Cancel
                </Button>
              </div>
            </div>

            <!-- Start OAuth button -->
            <Button
              v-else
              variant="primary"
              :loading="isLoggingIn"
              class="w-full"
              @click="startOAuthLogin"
            >
              <svg
                class="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                />
              </svg>
              Login with Claude Account
            </Button>

            <!-- Error message -->
            <p
              v-if="loginError"
              class="text-sm text-red-600 dark:text-red-400"
            >
              {{ loginError }}
            </p>
          </div>

          <!-- API Key Input -->
          <div
            v-else
            class="space-y-3"
          >
            <p class="text-sm text-surface-600 dark:text-surface-400">
              Enter your Anthropic API key for direct API access.
            </p>
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
            <p class="text-xs text-surface-500 dark:text-surface-400">
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
        </div>
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
