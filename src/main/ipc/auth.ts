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
    try {
      logger.debug('IPC: auth:get-status');

      // Validate services
      if (!authService || !configService) {
        throw new Error('Auth or Config service not initialized');
      }

      const config = await configService.getConfig();

      if (!config) {
        throw new Error('Failed to load configuration');
      }

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
    } catch (error) {
      logger.error('Failed to get auth status', { error });
      throw new Error(`Failed to get authentication status: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Start OAuth login flow - returns URL for user to click
  ipcMain.handle(
    IPC_CHANNELS.AUTH_START_OAUTH,
    async (): Promise<{ authUrl: string; error?: string }> => {
      try {
        logger.info('IPC: auth:start-oauth');

        // Validate service
        if (!authService) {
          throw new Error('Auth service not initialized');
        }

        const result = await authService.startOAuthFlow();

        if (!result) {
          throw new Error('OAuth flow initialization returned no result');
        }

        if (result.authUrl) {
          // Open the URL in the user's browser
          authService.openAuthUrl(result.authUrl);
          logger.info('OAuth URL opened in browser');
        }

        return result;
      } catch (error) {
        logger.error('Failed to start OAuth flow', { error });
        return {
          authUrl: '',
          error: `Failed to start OAuth flow: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  );

  // Complete OAuth flow with the code from browser
  ipcMain.handle(
    IPC_CHANNELS.AUTH_COMPLETE_OAUTH,
    async (_event, code: string): Promise<{ success: boolean; error?: string }> => {
      try {
        logger.info('IPC: auth:complete-oauth');

        // Validate services
        if (!authService || !configService) {
          throw new Error('Auth or Config service not initialized');
        }

        // Validate input
        if (typeof code !== 'string') {
          return { success: false, error: 'Invalid code type: must be a string' };
        }

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

        if (!result) {
          throw new Error('OAuth completion returned no result');
        }

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

        return { success: false, error: result.error || 'OAuth completion failed' };
      } catch (error) {
        logger.error('Failed to complete OAuth flow', { error });
        return {
          success: false,
          error: `Failed to complete OAuth flow: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  );

  // Logout - clear all auth credentials
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (): Promise<void> => {
    try {
      logger.info('IPC: auth:logout');

      // Validate services
      if (!authService || !configService) {
        throw new Error('Auth or Config service not initialized');
      }

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
    } catch (error) {
      logger.error('Failed to logout', { error });
      throw new Error(`Failed to logout: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  logger.info('Auth IPC handlers registered');
}
