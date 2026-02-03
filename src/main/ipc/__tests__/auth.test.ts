/**
 * Comprehensive tests for Auth IPC handlers.
 *
 * Tests cover:
 * - AUTH_GET_STATUS handler for OAuth and API key authentication
 * - AUTH_START_OAUTH handler for OAuth flow initiation
 * - AUTH_COMPLETE_OAUTH handler for OAuth completion
 * - AUTH_LOGOUT handler for clearing credentials
 * - Service validation for all handlers
 * - Error propagation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before vi.mock is called
const { mockIpcMainHandle, mockIpcMain } = vi.hoisted(() => {
  const mockIpcMainHandle = vi.fn();
  return {
    mockIpcMainHandle,
    mockIpcMain: {
      handle: mockIpcMainHandle,
      on: vi.fn(),
      removeHandler: vi.fn(),
      removeAllListeners: vi.fn(),
    },
  };
});

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
  BrowserWindow: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockAuthService = {
  startOAuthFlow: vi.fn(),
  completeOAuthFlow: vi.fn(),
  openAuthUrl: vi.fn(),
  cleanupOAuthFlow: vi.fn(),
};

const mockConfigService = {
  getConfig: vi.fn(),
  setConfig: vi.fn(),
};

const mockMainWindow = {
  webContents: {
    send: vi.fn(),
  },
  isDestroyed: vi.fn().mockReturnValue(false),
};

const mockGetMainWindow = vi.fn(() => mockMainWindow);

// Import after mocks
import { IPC_CHANNELS, AuthStatus } from '../../../shared/types';
import { AuthenticationError } from '../../errors';
import { setupAuthHandlers } from '../auth';

describe('Auth IPC handlers', () => {
  let handlers: Map<string, (...args: unknown[]) => unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();

    // Capture registered handlers
    mockIpcMainHandle.mockImplementation((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    });

    // Default mock implementations
    mockAuthService.startOAuthFlow.mockResolvedValue({ authUrl: 'https://auth.example.com/oauth' });
    mockAuthService.completeOAuthFlow.mockResolvedValue({ success: true, token: 'oauth_token_123' });
    mockAuthService.openAuthUrl.mockReturnValue(undefined);
    mockAuthService.cleanupOAuthFlow.mockReturnValue(undefined);

    mockConfigService.getConfig.mockResolvedValue({
      oauthToken: '',
      apiKey: '',
      authMethod: 'none',
    });
    mockConfigService.setConfig.mockResolvedValue(undefined);

    // Register handlers
    setupAuthHandlers(
      mockAuthService as any,
      mockConfigService as any,
      mockGetMainWindow as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Handler Registration
  // ===========================================================================
  describe('handler registration', () => {
    it('should register all auth handlers', () => {
      expect(handlers.has(IPC_CHANNELS.AUTH_GET_STATUS)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.AUTH_START_OAUTH)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.AUTH_COMPLETE_OAUTH)).toBe(true);
      expect(handlers.has(IPC_CHANNELS.AUTH_LOGOUT)).toBe(true);
    });
  });

  // ===========================================================================
  // AUTH_GET_STATUS
  // ===========================================================================
  describe('AUTH_GET_STATUS handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.AUTH_GET_STATUS)!;
    });

    it('should return OAuth authenticated status when oauthToken exists', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        oauthToken: 'valid_oauth_token',
        apiKey: '',
        authMethod: 'oauth',
      });

      const result = await handler({});

      expect(result).toEqual({
        isAuthenticated: true,
        method: 'oauth',
        displayName: 'Claude Pro/Max Account',
      });
    });

    it('should return API key authenticated status when apiKey exists', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        oauthToken: '',
        apiKey: 'sk-ant-api-key',
        authMethod: 'api-key',
      });

      const result = await handler({});

      expect(result).toEqual({
        isAuthenticated: true,
        method: 'api-key',
        displayName: 'API Key',
      });
    });

    it('should prefer OAuth over API key if both are present', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        oauthToken: 'valid_oauth_token',
        apiKey: 'sk-ant-api-key',
        authMethod: 'oauth',
      });

      const result = await handler({}) as AuthStatus;

      expect(result.method).toBe('oauth');
      expect(result.isAuthenticated).toBe(true);
    });

    it('should return not authenticated when no credentials exist', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        oauthToken: '',
        apiKey: '',
        authMethod: 'none',
      });

      const result = await handler({});

      expect(result).toEqual({
        isAuthenticated: false,
        method: 'none',
      });
    });

    it('should throw when auth service is not initialized', async () => {
      handlers.clear();
      setupAuthHandlers(null as any, mockConfigService as any, mockGetMainWindow as any);
      const nullHandler = handlers.get(IPC_CHANNELS.AUTH_GET_STATUS)!;

      await expect(nullHandler({})).rejects.toThrow(AuthenticationError);
    });

    it('should throw when config service is not initialized', async () => {
      handlers.clear();
      setupAuthHandlers(mockAuthService as any, null as any, mockGetMainWindow as any);
      const nullHandler = handlers.get(IPC_CHANNELS.AUTH_GET_STATUS)!;

      await expect(nullHandler({})).rejects.toThrow(AuthenticationError);
    });

    it('should throw when config returns null', async () => {
      mockConfigService.getConfig.mockResolvedValue(null);

      await expect(handler({})).rejects.toThrow(AuthenticationError);
    });

    it('should propagate config service errors', async () => {
      mockConfigService.getConfig.mockRejectedValue(new Error('Storage error'));

      await expect(handler({})).rejects.toThrow(AuthenticationError);
    });
  });

  // ===========================================================================
  // AUTH_START_OAUTH
  // ===========================================================================
  describe('AUTH_START_OAUTH handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.AUTH_START_OAUTH)!;
    });

    it('should start OAuth flow and return auth URL', async () => {
      const result = await handler({});

      expect(mockAuthService.startOAuthFlow).toHaveBeenCalled();
      expect(mockAuthService.openAuthUrl).toHaveBeenCalledWith('https://auth.example.com/oauth');
      expect(result).toEqual({ authUrl: 'https://auth.example.com/oauth' });
    });

    it('should not open URL if authUrl is empty', async () => {
      mockAuthService.startOAuthFlow.mockResolvedValue({ authUrl: '' });

      const result = await handler({});

      expect(mockAuthService.openAuthUrl).not.toHaveBeenCalled();
      expect(result).toEqual({ authUrl: '' });
    });

    it('should return error object when OAuth flow fails', async () => {
      mockAuthService.startOAuthFlow.mockRejectedValue(new Error('CLI not found'));

      const result = await handler({});

      expect(result).toEqual({
        authUrl: '',
        error: expect.stringContaining('CLI not found'),
      });
    });

    it('should return error when startOAuthFlow returns null', async () => {
      mockAuthService.startOAuthFlow.mockResolvedValue(null);

      const result = await handler({});

      expect(result).toEqual({
        authUrl: '',
        error: expect.stringContaining('OAuth flow initialization returned no result'),
      });
    });

    it('should throw when auth service is not initialized', async () => {
      handlers.clear();
      setupAuthHandlers(null as any, mockConfigService as any, mockGetMainWindow as any);
      const nullHandler = handlers.get(IPC_CHANNELS.AUTH_START_OAUTH)!;

      const result = await nullHandler({});

      expect(result).toEqual({
        authUrl: '',
        error: expect.stringContaining('Auth service not initialized'),
      });
    });
  });

  // ===========================================================================
  // AUTH_COMPLETE_OAUTH
  // ===========================================================================
  describe('AUTH_COMPLETE_OAUTH handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.AUTH_COMPLETE_OAUTH)!;
    });

    it('should complete OAuth flow with valid code', async () => {
      const result = await handler({}, 'valid_oauth_code_12345');

      expect(mockAuthService.completeOAuthFlow).toHaveBeenCalledWith('valid_oauth_code_12345');
      expect(mockConfigService.setConfig).toHaveBeenCalledWith({
        oauthToken: 'oauth_token_123',
        authMethod: 'oauth',
      });
      expect(result).toEqual({ success: true });
    });

    it('should notify renderer of config change on success', async () => {
      await handler({}, 'valid_code');

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.CONFIG_CHANGED,
        { oauthToken: 'oauth_token_123', authMethod: 'oauth' }
      );
    });

    it('should return error for invalid code format (too short)', async () => {
      const result = await handler({}, 'abc');

      expect(mockAuthService.completeOAuthFlow).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Invalid code length'),
      });
    });

    it('should return error for code that is too long', async () => {
      const longCode = 'a'.repeat(1000);
      const result = await handler({}, longCode);

      expect(mockAuthService.completeOAuthFlow).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Invalid code length'),
      });
    });

    it('should return error for empty code', async () => {
      const result = await handler({}, '');

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Please enter the code'),
      });
    });

    it('should return error for non-string code', async () => {
      const result = await handler({}, 123);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Please enter the code'),
      });
    });

    it('should return error for null code', async () => {
      const result = await handler({}, null);

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Please enter the code'),
      });
    });

    it('should trim whitespace from code', async () => {
      await handler({}, '  valid_oauth_code_12345  ');

      expect(mockAuthService.completeOAuthFlow).toHaveBeenCalledWith('valid_oauth_code_12345');
    });

    it('should return error when OAuth completion fails', async () => {
      mockAuthService.completeOAuthFlow.mockResolvedValue({
        success: false,
        error: 'Invalid code',
      });

      const result = await handler({}, 'invalid_code_12345');

      expect(result).toEqual({
        success: false,
        error: 'Invalid code',
      });
    });

    it('should return error when completeOAuthFlow returns null', async () => {
      mockAuthService.completeOAuthFlow.mockResolvedValue(null);

      const result = await handler({}, 'some_code_12345');

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('OAuth completion returned no result'),
      });
    });

    it('should return error when auth service throws', async () => {
      mockAuthService.completeOAuthFlow.mockRejectedValue(new Error('Network timeout'));

      const result = await handler({}, 'valid_code_12345');

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Network timeout'),
      });
    });

    it('should handle OAuth success without token', async () => {
      mockAuthService.completeOAuthFlow.mockResolvedValue({
        success: true,
        token: '',
      });

      const result = await handler({}, 'valid_code_12345');

      // success without token should fall through to failure path
      expect(result).toEqual({
        success: false,
        error: 'OAuth completion failed',
      });
    });
  });

  // ===========================================================================
  // AUTH_LOGOUT
  // ===========================================================================
  describe('AUTH_LOGOUT handler', () => {
    let handler: (...args: unknown[]) => unknown;

    beforeEach(() => {
      handler = handlers.get(IPC_CHANNELS.AUTH_LOGOUT)!;
    });

    it('should clear all credentials', async () => {
      await handler({});

      expect(mockConfigService.setConfig).toHaveBeenCalledWith({
        oauthToken: '',
        apiKey: '',
        authMethod: 'none',
      });
    });

    it('should cleanup pending OAuth flows', async () => {
      await handler({});

      expect(mockAuthService.cleanupOAuthFlow).toHaveBeenCalled();
    });

    it('should notify renderer of config change', async () => {
      await handler({});

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        IPC_CHANNELS.CONFIG_CHANGED,
        { oauthToken: '', apiKey: '', authMethod: 'none' }
      );
    });

    it('should throw when auth service is not initialized', async () => {
      handlers.clear();
      setupAuthHandlers(null as any, mockConfigService as any, mockGetMainWindow as any);
      const nullHandler = handlers.get(IPC_CHANNELS.AUTH_LOGOUT)!;

      await expect(nullHandler({})).rejects.toThrow(AuthenticationError);
    });

    it('should throw when config service is not initialized', async () => {
      handlers.clear();
      setupAuthHandlers(mockAuthService as any, null as any, mockGetMainWindow as any);
      const nullHandler = handlers.get(IPC_CHANNELS.AUTH_LOGOUT)!;

      await expect(nullHandler({})).rejects.toThrow(AuthenticationError);
    });

    it('should propagate config service errors', async () => {
      mockConfigService.setConfig.mockRejectedValue(new Error('Storage full'));

      await expect(handler({})).rejects.toThrow(AuthenticationError);
    });
  });

  // ===========================================================================
  // Window Notification Edge Cases
  // ===========================================================================
  describe('window notification edge cases', () => {
    it('should handle null main window gracefully', async () => {
      mockGetMainWindow.mockReturnValue(null as any);
      const handler = handlers.get(IPC_CHANNELS.AUTH_COMPLETE_OAUTH)!;

      // Should not throw even if window is null
      const result = await handler({}, 'valid_code_12345') as { success: boolean; error?: string };

      expect(result.success).toBe(true);
    });

    it('should handle destroyed window gracefully', async () => {
      mockMainWindow.isDestroyed.mockReturnValue(true);
      const handler = handlers.get(IPC_CHANNELS.AUTH_LOGOUT)!;

      // Should not throw even if window is destroyed
      await expect(handler({})).resolves.toBeUndefined();
    });
  });
});
