/**
 * Authentication composable - handles OAuth and API key authentication
 */

import { ref } from 'vue';
import type { AuthStatus } from '@shared/types';
import { logger } from '../utils/logger';

export interface UseAuthenticationOptions {
  /**
   * Callback to execute after successful authentication
   */
  onAuthenticated?: () => void;
}

export function useAuthentication(options: UseAuthenticationOptions = {}) {
  // State
  const authStatus = ref<AuthStatus>({ isAuthenticated: false, method: 'none' });
  const isLoggingIn = ref(false);
  const loginError = ref('');
  const oauthCode = ref('');
  const showCodeInput = ref(false);

  /**
   * Fetch current authentication status from main process
   */
  async function refreshAuthStatus() {
    try {
      authStatus.value = await window.electron.auth.getStatus();
    } catch (err) {
      logger.error('Failed to get auth status', err);
    }
  }

  /**
   * Start OAuth login flow - opens browser for authentication
   */
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

  /**
   * Complete OAuth login with the code from browser
   */
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
        options.onAuthenticated?.();
      } else {
        loginError.value = result.error || 'Login failed';
      }
    } catch (error) {
      loginError.value = `Login failed: ${error}`;
    } finally {
      isLoggingIn.value = false;
    }
  }

  /**
   * Save API key for authentication
   */
  async function saveApiKey(apiKey: string) {
    if (!apiKey.trim()) {
      loginError.value = 'Please enter your API key';
      return;
    }

    isLoggingIn.value = true;
    loginError.value = '';

    try {
      await window.electron.config.set({
        apiKey: apiKey.trim(),
        authMethod: 'api-key',
      });
      await refreshAuthStatus();
      options.onAuthenticated?.();
    } catch (error) {
      loginError.value = `Failed to save API key: ${error}`;
      throw error;
    } finally {
      isLoggingIn.value = false;
    }
  }

  /**
   * Logout from current authentication method
   */
  async function logout() {
    try {
      await window.electron.auth.logout();
      await refreshAuthStatus();
    } catch (err) {
      logger.error('Logout failed', err);
      throw err;
    }
  }

  /**
   * Reset the authentication form state
   */
  function resetState() {
    showCodeInput.value = false;
    oauthCode.value = '';
    loginError.value = '';
    isLoggingIn.value = false;
  }

  return {
    // State
    authStatus,
    isLoggingIn,
    loginError,
    oauthCode,
    showCodeInput,

    // Methods
    refreshAuthStatus,
    startOAuthLogin,
    completeOAuthLogin,
    saveApiKey,
    logout,
    resetState,
  };
}
