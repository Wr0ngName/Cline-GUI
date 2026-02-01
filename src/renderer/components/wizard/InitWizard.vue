<script setup lang="ts">
/**
 * Initial setup wizard for first-time users.
 * Guides through folder selection and authentication setup.
 */

import { ref, computed, onMounted } from 'vue';

import Button from '../shared/Button.vue';
import type { AuthStatus } from '../../../shared/types';
import { logger } from '../../utils/logger';

const emit = defineEmits<{
  (e: 'complete'): void;
}>();

// Wizard state
const currentStep = ref(1);
const totalSteps = 3;

// Step 1: Welcome (no state needed)

// Step 2: Folder selection
const selectedFolder = ref('');
const isSelectingFolder = ref(false);

// Step 3: Authentication
const authStatus = ref<AuthStatus>({ isAuthenticated: false, method: 'none' });
const authTab = ref<'oauth' | 'api-key'>('oauth');
const isLoggingIn = ref(false);
const loginError = ref('');
const oauthCode = ref('');
const showCodeInput = ref(false);
const localApiKey = ref('');
const showApiKey = ref(false);

// Computed
const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return true; // Welcome step, always can proceed
    case 2:
      return !!selectedFolder.value;
    case 3:
      return authStatus.value.isAuthenticated;
    default:
      return false;
  }
});

const stepTitle = computed(() => {
  switch (currentStep.value) {
    case 1:
      return 'Welcome to Cline GUI';
    case 2:
      return 'Choose Your Project';
    case 3:
      return 'Connect Your Account';
    default:
      return '';
  }
});

const stepDescription = computed(() => {
  switch (currentStep.value) {
    case 1:
      return 'Your AI-powered coding assistant. Let\'s get you set up in just a few steps.';
    case 2:
      return 'Select the folder where your project lives. Claude will help you work with files in this directory.';
    case 3:
      return 'Login with your Claude account to start chatting with your AI assistant.';
    default:
      return '';
  }
});

// Methods
async function selectFolder() {
  isSelectingFolder.value = true;
  try {
    const folder = await window.electron.files.selectDirectory();
    if (folder) {
      selectedFolder.value = folder;
    }
  } catch (err) {
    logger.error('Failed to select folder', err);
  } finally {
    isSelectingFolder.value = false;
  }
}

async function refreshAuthStatus() {
  try {
    authStatus.value = await window.electron.auth.getStatus();
  } catch (err) {
    logger.error('Failed to get auth status', err);
  }
}

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

async function saveApiKey() {
  if (!localApiKey.value.trim()) {
    loginError.value = 'Please enter your API key';
    return;
  }

  isLoggingIn.value = true;
  loginError.value = '';

  try {
    await window.electron.config.set({
      apiKey: localApiKey.value.trim(),
      authMethod: 'api-key',
    });
    await refreshAuthStatus();
  } catch (error) {
    loginError.value = `Failed to save API key: ${error}`;
  } finally {
    isLoggingIn.value = false;
  }
}

function nextStep() {
  if (currentStep.value < totalSteps) {
    currentStep.value++;
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
    // Reset auth state when going back
    if (currentStep.value === 2) {
      showCodeInput.value = false;
      oauthCode.value = '';
      loginError.value = '';
    }
  }
}

async function finishWizard() {
  // Save the selected folder
  if (selectedFolder.value) {
    await window.electron.config.set({
      workingDirectory: selectedFolder.value,
    });
  }
  emit('complete');
}

function skipAuth() {
  // Allow skipping auth step but still save folder
  finishWizard();
}

// Initialize
onMounted(() => {
  refreshAuthStatus();
});
</script>

<template>
  <div class="fixed inset-0 bg-surface-900/90 flex items-center justify-center z-50">
    <div class="bg-white dark:bg-surface-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
      <!-- Progress bar -->
      <div class="h-1 bg-surface-200 dark:bg-surface-700">
        <div
          class="h-full bg-primary-500 transition-all duration-300"
          :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
        />
      </div>

      <!-- Content -->
      <div class="p-8">
        <!-- Step indicator -->
        <div class="flex items-center justify-center gap-2 mb-6">
          <template
            v-for="step in totalSteps"
            :key="step"
          >
            <div
              :class="[
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                step === currentStep
                  ? 'bg-primary-500 text-white'
                  : step < currentStep
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400'
                    : 'bg-surface-200 dark:bg-surface-700 text-surface-500',
              ]"
            >
              <svg
                v-if="step < currentStep"
                class="w-4 h-4"
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
              <span v-else>{{ step }}</span>
            </div>
            <div
              v-if="step < totalSteps"
              :class="[
                'w-12 h-0.5 transition-colors',
                step < currentStep ? 'bg-primary-500' : 'bg-surface-200 dark:bg-surface-700',
              ]"
            />
          </template>
        </div>

        <!-- Step title -->
        <h2 class="text-2xl font-bold text-center text-surface-900 dark:text-white mb-2">
          {{ stepTitle }}
        </h2>
        <p class="text-center text-surface-600 dark:text-surface-400 mb-8">
          {{ stepDescription }}
        </p>

        <!-- Step 1: Welcome -->
        <div
          v-if="currentStep === 1"
          class="text-center"
        >
          <div class="w-24 h-24 mx-auto mb-6 rounded-2xl bg-primary-500 flex items-center justify-center">
            <svg
              class="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div class="space-y-4 text-left max-w-md mx-auto">
            <div class="flex items-start gap-3">
              <div class="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  class="w-3 h-3 text-primary-600 dark:text-primary-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <p class="text-surface-700 dark:text-surface-300">
                <strong>Write & edit code</strong> with AI assistance
              </p>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  class="w-3 h-3 text-primary-600 dark:text-primary-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <p class="text-surface-700 dark:text-surface-300">
                <strong>Run commands</strong> directly from the chat
              </p>
            </div>
            <div class="flex items-start gap-3">
              <div class="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  class="w-3 h-3 text-primary-600 dark:text-primary-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <p class="text-surface-700 dark:text-surface-300">
                <strong>Review changes</strong> before they're applied
              </p>
            </div>
          </div>
        </div>

        <!-- Step 2: Folder Selection -->
        <div
          v-else-if="currentStep === 2"
          class="text-center"
        >
          <div
            v-if="selectedFolder"
            class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 mb-6"
          >
            <div class="flex items-center justify-center gap-3">
              <svg
                class="w-6 h-6 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <span class="font-mono text-sm text-green-800 dark:text-green-200 truncate max-w-md">
                {{ selectedFolder }}
              </span>
            </div>
          </div>

          <Button
            variant="primary"
            size="lg"
            :loading="isSelectingFolder"
            class="mx-auto"
            @click="selectFolder"
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
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            {{ selectedFolder ? 'Change Folder' : 'Select Folder' }}
          </Button>

          <p class="mt-4 text-sm text-surface-500 dark:text-surface-400">
            You can change this later in Settings
          </p>
        </div>

        <!-- Step 3: Authentication -->
        <div
          v-else-if="currentStep === 3"
          class="max-w-md mx-auto"
        >
          <!-- Already authenticated -->
          <div
            v-if="authStatus.isAuthenticated"
            class="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
          >
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
                  You're logged in!
                </p>
                <p class="text-sm text-green-600 dark:text-green-400">
                  {{ authStatus.displayName || (authStatus.method === 'oauth' ? 'Claude Pro/Max Account' : 'API Key') }}
                </p>
              </div>
            </div>
          </div>

          <!-- Not authenticated -->
          <div
            v-else
            class="space-y-4"
          >
            <!-- Auth method tabs -->
            <div class="flex border-b border-surface-200 dark:border-surface-700">
              <button
                :class="[
                  'flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
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
                  'flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
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
              <p class="text-sm text-surface-600 dark:text-surface-400 text-center">
                Login with your Claude Pro or Max subscription
              </p>

              <!-- Code input -->
              <div
                v-if="showCodeInput"
                class="space-y-3"
              >
                <p class="text-sm text-surface-600 dark:text-surface-400">
                  Enter the code shown in your browser:
                </p>
                <input
                  v-model="oauthCode"
                  type="text"
                  class="input-base font-mono text-center"
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
            </div>

            <!-- API Key Input -->
            <div
              v-else
              class="space-y-3"
            >
              <p class="text-sm text-surface-600 dark:text-surface-400 text-center">
                Enter your Anthropic API key
              </p>
              <div class="relative">
                <input
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
              <Button
                variant="primary"
                :loading="isLoggingIn"
                class="w-full"
                @click="saveApiKey"
              >
                Save API Key
              </Button>
              <p class="text-xs text-center text-surface-500 dark:text-surface-400">
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  class="text-primary-500 hover:underline"
                >
                  Get your API key
                </a>
              </p>
            </div>

            <!-- Error message -->
            <p
              v-if="loginError"
              class="text-sm text-red-600 dark:text-red-400 text-center"
            >
              {{ loginError }}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-8 py-4 bg-surface-50 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700 flex items-center justify-between">
        <Button
          v-if="currentStep > 1"
          variant="ghost"
          @click="prevStep"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </Button>
        <div
          v-else
          class="w-20"
        />

        <div class="flex items-center gap-3">
          <Button
            v-if="currentStep === 3 && !authStatus.isAuthenticated"
            variant="ghost"
            @click="skipAuth"
          >
            Skip for now
          </Button>

          <Button
            v-if="currentStep < totalSteps"
            variant="primary"
            :disabled="!canProceed"
            @click="nextStep"
          >
            Continue
            <svg
              class="w-4 h-4 ml-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </Button>

          <Button
            v-else
            variant="primary"
            :disabled="!authStatus.isAuthenticated"
            @click="finishWizard"
          >
            Get Started
            <svg
              class="w-4 h-4 ml-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
