/**
 * Authentication service for Claude Code OAuth login.
 *
 * Uses the Claude CLI `setup-token` command to get an OAuth URL,
 * then sends the user's code back to complete authentication.
 *
 * Uses node-pty for cross-platform PTY support.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { shell } from 'electron';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

import logger from '../utils/logger';

export interface OAuthFlowState {
  pty: IPty | null;
  configDir: string;
  createdAt: number;
  output: string;
}

export class AuthService {
  private pendingOAuthFlow: OAuthFlowState | null = null;
  private readonly OAUTH_TIMEOUT = 600000; // 10 minutes

  constructor() {
    logger.info('AuthService initialized');
  }

  /**
   * Find the Claude CLI executable path.
   */
  private findClaudeCli(): string {
    // Try common locations
    const possiblePaths = [
      // npm global install
      path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
      path.join(os.homedir(), 'node_modules', '.bin', 'claude'),
      // System PATH - check common locations
      '/usr/local/bin/claude',
      '/usr/bin/claude',
    ];

    // On Windows, add .cmd extension
    if (process.platform === 'win32') {
      possiblePaths.unshift(
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude'),
      );
    }

    // Check each path
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        logger.info(`Found Claude CLI at: ${p}`);
        return p;
      }
    }

    // Try to find via which/where command
    try {
      const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
      const result = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
      if (result && fs.existsSync(result)) {
        logger.info(`Found Claude CLI via PATH: ${result}`);
        return result;
      }
    } catch {
      // which/where failed
    }

    // Use npx as fallback
    logger.info('Claude CLI not found in common paths, will try npx');
    return 'npx';
  }

  /**
   * Start the OAuth login flow using node-pty.
   * Returns the authorization URL that the user should visit.
   */
  async startOAuthFlow(): Promise<{ authUrl: string; error?: string }> {
    // Clean up any existing flow
    this.cleanupOAuthFlow();

    // Create temp config directory
    const configDir = path.join(os.tmpdir(), `claude-oauth-${Date.now()}`);
    fs.mkdirSync(configDir, { recursive: true });

    const claudeCli = this.findClaudeCli();
    const isNpx = claudeCli === 'npx';

    // Build command and args
    const shell_cmd = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const claudeCmd = isNpx
      ? 'npx @anthropic-ai/claude-code setup-token'
      : `"${claudeCli}" setup-token`;

    logger.info(`Starting OAuth flow with: ${claudeCmd}`);

    // Environment without browser auto-open
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      BROWSER: process.platform === 'win32' ? 'echo' : '/bin/false',
      CLAUDE_CONFIG_DIR: configDir,
      TERM: 'xterm-256color',
      NO_COLOR: '1',
    };
    delete env.DISPLAY; // Prevent X11 browser launch on Linux

    return new Promise((resolve) => {
      try {
        // Create PTY
        const ptyProcess = pty.spawn(shell_cmd, [process.platform === 'win32' ? '/c' : '-c', claudeCmd], {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: os.homedir(),
          env,
        });

        let output = '';
        let authUrl = '';
        const startTime = Date.now();
        let resolved = false;

        const checkForUrl = () => {
          // Remove ANSI escape codes for parsing
          const clean = this.stripAnsi(output);

          // Look for the OAuth URL
          const urlMatch = clean.match(/(https:\/\/claude\.ai\/oauth\/authorize\S+)/);
          if (urlMatch && !authUrl) {
            authUrl = urlMatch[1];
            logger.info(`Found OAuth URL (length=${authUrl.length})`);
          }

          // Check if we have URL and prompt (or enough time has passed after finding URL)
          if (authUrl && !resolved && (clean.includes('Paste') || clean.includes('code') || Date.now() - startTime > 3000)) {
            resolved = true;
            logger.info('OAuth flow ready for code input');
            this.pendingOAuthFlow = {
              pty: ptyProcess,
              configDir,
              createdAt: startTime,
              output,
            };
            resolve({ authUrl });
          }
        };

        // Handle PTY output
        ptyProcess.onData((data: string) => {
          output += data;
          logger.debug(`OAuth pty data: ${data.slice(0, 200)}`);
          checkForUrl();
        });

        // Timeout after 30 seconds
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            logger.error('Timeout waiting for OAuth URL');
            logger.debug(`Output so far: ${this.stripAnsi(output).slice(-500)}`);
            this.cleanupOAuthFlow();
            resolve({ authUrl: '', error: 'Timeout waiting for authentication URL. Is Claude CLI installed?' });
          }
        }, 30000);

        ptyProcess.onExit(({ exitCode }) => {
          clearTimeout(timeoutId);
          // Give time for output to be processed
          setTimeout(() => {
            checkForUrl();
            if (!resolved) {
              logger.error(`PTY exited with code ${exitCode} before getting URL`);
              logger.debug(`Output: ${this.stripAnsi(output).slice(-500)}`);
              this.cleanupOAuthFlow();
              resolve({ authUrl: '', error: 'Authentication process exited unexpectedly. Is Claude CLI installed?' });
            }
          }, 500);
        });
      } catch (error) {
        logger.error('Failed to start OAuth flow:', error);
        fs.rmSync(configDir, { recursive: true, force: true });
        resolve({ authUrl: '', error: `Failed to start authentication: ${error}` });
      }
    });
  }

  /**
   * Complete the OAuth flow by sending the code to the PTY.
   */
  async completeOAuthFlow(code: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.pendingOAuthFlow) {
      return { success: false, error: 'No pending authentication flow. Please start login again.' };
    }

    const { pty: ptyProcess, configDir, createdAt } = this.pendingOAuthFlow;

    // Check expiration
    if (Date.now() - createdAt > this.OAUTH_TIMEOUT) {
      this.cleanupOAuthFlow();
      return { success: false, error: 'Authentication flow expired. Please start again.' };
    }

    if (!ptyProcess) {
      this.cleanupOAuthFlow();
      return { success: false, error: 'Authentication process not running. Please start again.' };
    }

    return new Promise((resolve) => {
      try {
        let output = this.pendingOAuthFlow!.output;
        let resolved = false;

        // Listen for more output
        const dataHandler = ptyProcess.onData((data: string) => {
          output += data;
          logger.debug(`OAuth completion data: ${data.slice(0, 200)}`);
          checkResult();
        });

        // Send the code followed by Enter
        logger.info(`Sending OAuth code (length=${code.length})`);
        ptyProcess.write(code + '\r');

        const checkResult = (): boolean => {
          if (resolved) return true;

          const clean = this.stripAnsi(output);

          // Look for OAuth token in output (sk-ant-oat01-...)
          const tokenMatch = clean.match(/(sk-ant-oat01-[A-Za-z0-9_-]+)/);
          if (tokenMatch) {
            resolved = true;
            dataHandler.dispose();
            const token = tokenMatch[1];
            logger.info(`OAuth token extracted (length=${token.length})`);
            this.cleanupOAuthFlow();
            resolve({ success: true, token });
            return true;
          }

          // Check for credentials file
          const credsFile = path.join(configDir, '.credentials.json');
          if (fs.existsSync(credsFile)) {
            try {
              const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
              resolved = true;
              dataHandler.dispose();
              logger.info('OAuth credentials file found');
              // Extract oauthToken if present
              const token = creds.oauthToken || creds.claudeAiOauth?.accessToken || JSON.stringify(creds);
              this.cleanupOAuthFlow();
              resolve({ success: true, token });
              return true;
            } catch {
              // Invalid JSON, keep waiting
            }
          }

          // Check for success message
          if (clean.includes('Successfully authenticated') || clean.includes('logged in')) {
            // Check credentials file after a short delay
            setTimeout(() => {
              if (resolved) return;
              try {
                const creds = JSON.parse(fs.readFileSync(path.join(configDir, '.credentials.json'), 'utf8'));
                resolved = true;
                dataHandler.dispose();
                const token = creds.oauthToken || creds.claudeAiOauth?.accessToken || JSON.stringify(creds);
                this.cleanupOAuthFlow();
                resolve({ success: true, token });
              } catch {
                // Continue waiting
              }
            }, 500);
          }

          // Check for error indicators
          const lowerClean = clean.toLowerCase();
          if (
            (lowerClean.includes('invalid code') || lowerClean.includes('error:') || lowerClean.includes('failed')) &&
            !lowerClean.includes('no error')
          ) {
            resolved = true;
            dataHandler.dispose();
            logger.error('OAuth error detected in output');
            this.cleanupOAuthFlow();
            resolve({ success: false, error: 'Invalid code. Please try again.' });
            return true;
          }

          return false;
        };

        // Poll for result
        let attempts = 0;
        const maxAttempts = 90; // 45 seconds
        const pollInterval = setInterval(() => {
          attempts++;
          if (checkResult()) {
            clearInterval(pollInterval);
            return;
          }
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            if (!resolved) {
              resolved = true;
              dataHandler.dispose();
              logger.error('Timeout waiting for OAuth completion');
              logger.debug(`Final output: ${this.stripAnsi(output).slice(-1000)}`);
              this.cleanupOAuthFlow();
              resolve({ success: false, error: 'Timeout waiting for authentication to complete' });
            }
          }
        }, 500);

        // Handle PTY exit
        ptyProcess.onExit(({ exitCode }) => {
          logger.info(`OAuth PTY exited with code ${exitCode}`);
          // Give a moment for any final output
          setTimeout(() => {
            if (!resolved) {
              clearInterval(pollInterval);
              checkResult();
              if (!resolved) {
                resolved = true;
                dataHandler.dispose();
                this.cleanupOAuthFlow();
                resolve({ success: false, error: 'Authentication failed. Please try again.' });
              }
            }
          }, 1000);
        });
      } catch (error) {
        logger.error('Error completing OAuth flow:', error);
        this.cleanupOAuthFlow();
        resolve({ success: false, error: `Authentication error: ${error}` });
      }
    });
  }

  /**
   * Open the OAuth URL in the user's default browser.
   */
  openAuthUrl(url: string): void {
    shell.openExternal(url);
  }

  /**
   * Check if there's a pending OAuth flow.
   */
  hasPendingFlow(): boolean {
    return this.pendingOAuthFlow !== null;
  }

  /**
   * Clean up any pending OAuth flow.
   */
  cleanupOAuthFlow(): void {
    if (this.pendingOAuthFlow) {
      const configDir = this.pendingOAuthFlow.configDir;

      try {
        if (this.pendingOAuthFlow.pty) {
          this.pendingOAuthFlow.pty.kill();
        }
      } catch {
        // PTY may already be dead
      }

      this.pendingOAuthFlow = null;

      // Small delay before cleaning up files
      setTimeout(() => {
        try {
          if (configDir && fs.existsSync(configDir)) {
            fs.rmSync(configDir, { recursive: true, force: true });
          }
        } catch {
          // Directory may already be removed
        }
      }, 1000);

      logger.info('OAuth flow cleaned up');
    }
  }

  /**
   * Strip ANSI escape codes from string.
   */
  private stripAnsi(str: string): string {
    /* eslint-disable no-control-regex */
    // CSI sequences (most common)
    let clean = str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    // OSC sequences
    clean = clean.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
    // DCS, SOS, PM, APC
    clean = clean.replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '');
    // Other single-char escapes
    clean = clean.replace(/\x1b./g, '');
    /* eslint-enable no-control-regex */
    return clean;
  }
}

export default AuthService;
