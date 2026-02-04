/**
 * Authentication Validator for Claude Code
 *
 * Validates OAuth tokens and API keys.
 * Extracted from ClaudeCodeService for better separation of concerns.
 */

import { MAIN_CONSTANTS } from '../../constants/app';
import logger from '../../utils/logger';
import type ConfigService from '../ConfigService';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates authentication credentials
 */
export class AuthValidator {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  /**
   * Check if authentication is configured (OAuth or API key)
   */
  async hasAuth(): Promise<boolean> {
    return await this.configService.hasAuth();
  }

  /**
   * Validate OAuth token format
   * Valid OAuth tokens from Claude setup-token have format: sk-ant-oat01-...
   */
  validateOAuthToken(token: string): ValidationResult {
    if (!token || token.trim().length === 0) {
      return { valid: false, error: 'Token is empty' };
    }

    // OAuth tokens from setup-token should start with sk-ant-oat01-
    if (!token.startsWith('sk-ant-oat01-')) {
      // Could be a different token format, log warning but allow
      logger.warn('OAuth token does not have expected sk-ant-oat01- prefix', {
        prefix: token.substring(0, 12),
        length: token.length,
      });
    }

    // OAuth tokens are typically 80+ characters
    if (token.length < MAIN_CONSTANTS.AUTH.OAUTH_TOKEN_MIN_LENGTH) {
      return { valid: false, error: `Token too short (${token.length} chars, expected 80+)` };
    }

    return { valid: true };
  }

  /**
   * Validate API key format
   * Valid API keys have format: sk-ant-api03-... or sk-...
   */
  validateApiKey(key: string): ValidationResult {
    if (!key || key.trim().length === 0) {
      return { valid: false, error: 'API key is empty' };
    }

    if (!key.startsWith('sk-')) {
      return { valid: false, error: 'API key must start with sk-' };
    }

    if (key.length < MAIN_CONSTANTS.AUTH.API_KEY_MIN_LENGTH) {
      return { valid: false, error: `API key too short (${key.length} chars)` };
    }

    return { valid: true };
  }

  /**
   * Set up environment variables for Claude Code SDK authentication
   * @returns Environment variables to set, or throws if validation fails
   */
  async setupAuthEnv(): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    // Check for OAuth token first (from Claude Pro/Max login)
    const oauthToken = await this.configService.getOAuthToken();
    if (oauthToken) {
      const validation = this.validateOAuthToken(oauthToken);
      if (!validation.valid) {
        logger.error('Invalid OAuth token', { error: validation.error });
        throw new Error(`Invalid OAuth token: ${validation.error}. Please log out and log in again.`);
      }
      env['CLAUDE_CODE_OAUTH_TOKEN'] = oauthToken;
      logger.debug('Using OAuth token for authentication', { tokenLength: oauthToken.length });
      return env;
    }

    // Fall back to API key
    const apiKey = await this.configService.getApiKey();
    if (apiKey) {
      const validation = this.validateApiKey(apiKey);
      if (!validation.valid) {
        logger.error('Invalid API key', { error: validation.error });
        throw new Error(`Invalid API key: ${validation.error}. Please check your API key.`);
      }
      env['ANTHROPIC_API_KEY'] = apiKey;
      logger.debug('Using API key for authentication', { keyLength: apiKey.length });
      return env;
    }

    logger.warn('No authentication credentials configured');
    return env;
  }
}

export default AuthValidator;
