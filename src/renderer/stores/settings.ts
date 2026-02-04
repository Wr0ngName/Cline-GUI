/**
 * Settings store - manages app configuration
 */

import type { AppConfig, LogLevel } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import { useEventCleanup } from '../composables/useEventCleanup';
import { logger } from '../utils/logger';

export const useSettingsStore = defineStore('settings', () => {
  // State
  const config = ref<AppConfig>({ ...DEFAULT_CONFIG });
  const isLoading = ref(true);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  // Use centralized cleanup management
  const { addCleanup, cleanup } = useEventCleanup();

  // Getters
  const hasApiKey = computed(() => !!config.value.apiKey);
  const hasOAuthToken = computed(() => !!config.value.oauthToken);
  const hasAuth = computed(() => hasApiKey.value || hasOAuthToken.value);
  const workingDirectory = computed(() => config.value.workingDirectory);
  const recentProjects = computed(() => config.value.recentProjects);
  const theme = computed(() => config.value.theme);
  const needsSetup = computed(() => !workingDirectory.value || !hasAuth.value);
  const isDarkMode = computed(() => {
    if (config.value.theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return config.value.theme === 'dark';
  });

  // Actions
  async function loadConfig(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const loadedConfig = await window.electron.config.get();
      config.value = loadedConfig;
    } catch (err) {
      logger.error('Failed to load config', err);
      error.value = 'Failed to load configuration';
    } finally {
      isLoading.value = false;
    }
  }

  async function saveConfig(updates: Partial<AppConfig>): Promise<void> {
    isSaving.value = true;
    error.value = null;
    try {
      await window.electron.config.set(updates);
      // Update local state
      Object.assign(config.value, updates);
    } catch (err) {
      logger.error('Failed to save config', err);
      error.value = 'Failed to save configuration';
      throw err;
    } finally {
      isSaving.value = false;
    }
  }

  async function setApiKey(apiKey: string): Promise<void> {
    await saveConfig({ apiKey });
  }

  async function setWorkingDirectory(directory: string): Promise<void> {
    await saveConfig({ workingDirectory: directory });
  }

  async function setTheme(newTheme: 'light' | 'dark' | 'system'): Promise<void> {
    await saveConfig({ theme: newTheme });
    applyTheme(newTheme);
  }

  async function setFontSize(fontSize: number): Promise<void> {
    await saveConfig({ fontSize });
    applyFontSize(fontSize);
  }

  async function setLogLevel(logLevel: LogLevel): Promise<void> {
    await saveConfig({ logLevel });
  }

  function applyFontSize(size: number): void {
    if (typeof document !== 'undefined' && document.documentElement?.style) {
      document.documentElement.style.setProperty('--chat-font-size', `${size}px`);
    }
  }

  function applyTheme(themeToApply: 'light' | 'dark' | 'system'): void {
    const html = document.documentElement;

    if (themeToApply === 'dark') {
      html.classList.add('dark');
    } else if (themeToApply === 'light') {
      html.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }
  }

  function clearError(): void {
    error.value = null;
  }

  // Initialize
  function initialize(): void {
    loadConfig().then(() => {
      applyTheme(config.value.theme);
      applyFontSize(config.value.fontSize);
    });

    // Listen for config changes from main process
    addCleanup(window.electron.config.onChange((updates) => {
      Object.assign(config.value, updates);
      if (updates.theme) {
        applyTheme(updates.theme);
      }
      if (updates.fontSize !== undefined) {
        applyFontSize(updates.fontSize);
      }
    }));

    // Listen for system theme changes
    const systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemThemeHandler = (): void => {
      if (config.value.theme === 'system') {
        applyTheme('system');
      }
    };
    systemThemeMediaQuery.addEventListener('change', systemThemeHandler);
    addCleanup(() => systemThemeMediaQuery.removeEventListener('change', systemThemeHandler));
  }

  return {
    // State
    config,
    isLoading,
    isSaving,
    error,

    // Getters
    hasApiKey,
    hasOAuthToken,
    hasAuth,
    workingDirectory,
    recentProjects,
    theme,
    isDarkMode,
    needsSetup,

    // Actions
    loadConfig,
    saveConfig,
    setApiKey,
    setWorkingDirectory,
    setTheme,
    setFontSize,
    setLogLevel,
    applyTheme,
    applyFontSize,
    clearError,
    initialize,
    cleanup,
  };
});
