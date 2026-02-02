/**
 * IPC handlers for authentication operations
 */

import { ipcMain, BrowserWindow } from 'electron';

import { IPC_CHANNELS, AuthStatus } from '../../shared/types';
import AuthService from '../services/AuthService';
import ConfigService from '../services/ConfigService';
import logger from '../utils/logger';

export function setupAuthHandlers(
  authService: AuthService,
  configService: ConfigService,
  getMainWindow: () => BrowserWindow | null
): void {
  // Get current authentication status
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_STATUS, async (): Promise<AuthStatus> => {
    logger.debug('IPC: auth:get-status');

    const config = await configService.getConfig();

    if (config.oauthToken) {
      return {
        isAuthenticated: true,
        method: 'oauth',
        displayName: 'Claude Pro/Max Account',
      };
    }

    if (config.apiKey) {
      return {
        isAuthenticated: true,
        method: 'api-key',
        displayName: 'API Key',
      };
    }

    return {
      isAuthenticated: false,
      method: 'none',
    };
  });

  // Start OAuth login flow - returns URL for user to click
  ipcMain.handle(
    IPC_CHANNELS.AUTH_START_OAUTH,
    async (): Promise<{ authUrl: string; error?: string }> => {
      logger.info('IPC: auth:start-oauth');

      const result = await authService.startOAuthFlow();

      if (result.authUrl) {
        // Open the URL in the user's browser
        authService.openAuthUrl(result.authUrl);
        logger.info('OAuth URL opened in browser');
      }

      return result;
    }
  );

  // Complete OAuth flow with the code from browser
  ipcMain.handle(
    IPC_CHANNELS.AUTH_COMPLETE_OAUTH,
    async (_event, code: string): Promise<{ success: boolean; error?: string }> => {
      logger.info('IPC: auth:complete-oauth');

      if (!code || !code.trim()) {
        return { success: false, error: 'Please enter the code from your browser' };
      }

      const trimmedCode = code.trim();

      // Basic length validation only - let the CLI validate the actual format
      // OAuth codes can contain various characters depending on the provider
      if (trimmedCode.length < 10 || trimmedCode.length > 500) {
        logger.warn('OAuth code length out of range', { codeLength: trimmedCode.length });
        return { success: false, error: 'Invalid code length. Please copy the complete code from your browser.' };
      }

      const result = await authService.completeOAuthFlow(trimmedCode);

      if (result.success && result.token) {
        // Save the OAuth token
        const configUpdate = {
          oauthToken: result.token,
          authMethod: 'oauth' as const,
        };
        await configService.setConfig(configUpdate);

        // Notify renderer of config change so UI updates
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, configUpdate);
        }

        logger.info('OAuth token saved successfully');
        return { success: true };
      }

      return { success: false, error: result.error };
    }
  );

  // Logout - clear all auth credentials
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<void> => {
    logger.info('IPC: auth:logout');

    // Clear both OAuth token and API key
    const configUpdate = {
      oauthToken: '',
      apiKey: '',
      authMethod: 'none' as const,
    };
    await configService.setConfig(configUpdate);

    // Notify renderer of config change so UI updates
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, configUpdate);
    }

    // Clean up any pending OAuth flows
    authService.cleanupOAuthFlow();

    logger.info('Logged out successfully');
  });

  logger.info('Auth IPC handlers registered');
}
