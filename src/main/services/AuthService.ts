/**
 * Authentication service for Claude Code OAuth login.
 *
 * Uses the Claude CLI `setup-token` command to get an OAuth URL,
 * then sends the user's code back to complete authentication.
 *
 * Based on the mautrix-claude sidecar implementation, but using
 * child_process.spawn instead of node-pty for Vite compatibility.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { shell } from 'electron';

import logger from '../utils/logger';

export interface OAuthFlowState {
  process: ChildProcess | null;
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
      const { execSync } = require('child_process');
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
   * Start the OAuth login flow.
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

    // Build command args
    const args = isNpx ? ['@anthropic-ai/claude-code', 'setup-token'] : ['setup-token'];
    const command = isNpx ? 'npx' : claudeCli;

    logger.info(`Starting OAuth flow with: ${command} ${args.join(' ')}`);

    // Environment without browser auto-open
    const env = {
      ...process.env,
      BROWSER: process.platform === 'win32' ? 'echo' : '/bin/false',
      CLAUDE_CONFIG_DIR: configDir,
      // Force non-interactive mode / prevent escape codes
      TERM: 'dumb',
      NO_COLOR: '1',
    };
    delete env.DISPLAY; // Prevent X11 browser launch

    return new Promise((resolve) => {
      try {
        const proc = spawn(command, args, {
          cwd: os.homedir(),
          env: env as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let output = '';
        let authUrl = '';
        const startTime = Date.now();

        // Handle stdout
        proc.stdout?.on('data', (data: Buffer) => {
          const text = data.toString();
          output += text;
          logger.debug(`OAuth stdout: ${text.slice(0, 200)}`);

          // Remove ANSI escape codes for parsing
          const clean = this.stripAnsi(output);

          // Look for the OAuth URL
          const urlMatch = clean.match(/(https:\/\/claude\.ai\/oauth\/authorize\S+)/);
          if (urlMatch && !authUrl) {
            authUrl = urlMatch[1];
            logger.info(`Found OAuth URL (length=${authUrl.length})`);
          }

          // Check if we have URL (might not have prompt in non-tty mode)
          if (authUrl && (clean.includes('Paste') || clean.includes('code') || Date.now() - startTime > 5000)) {
            logger.info('OAuth flow ready for code input');
            this.pendingOAuthFlow = {
              process: proc,
              configDir,
              createdAt: startTime,
              output,
            };
            resolve({ authUrl });
          }
        });

        // Handle stderr
        proc.stderr?.on('data', (data: Buffer) => {
          const text = data.toString();
          output += text;
          logger.debug(`OAuth stderr: ${text.slice(0, 200)}`);

          // Also check stderr for URL (some CLIs output there)
          const clean = this.stripAnsi(output);
          const urlMatch = clean.match(/(https:\/\/claude\.ai\/oauth\/authorize\S+)/);
          if (urlMatch && !authUrl) {
            authUrl = urlMatch[1];
            logger.info(`Found OAuth URL in stderr (length=${authUrl.length})`);
            this.pendingOAuthFlow = {
              process: proc,
              configDir,
              createdAt: startTime,
              output,
            };
            resolve({ authUrl });
          }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (!authUrl) {
            logger.error('Timeout waiting for OAuth URL');
            logger.debug(`Output so far: ${this.stripAnsi(output).slice(-500)}`);
            this.cleanupOAuthFlow();
            resolve({ authUrl: '', error: 'Timeout waiting for authentication URL. Is Claude CLI installed?' });
          }
        }, 30000);

        proc.on('error', (error) => {
          logger.error('OAuth process error:', error);
          this.cleanupOAuthFlow();
          resolve({ authUrl: '', error: `Failed to start authentication: ${error.message}` });
        });

        proc.on('exit', (exitCode) => {
          if (!authUrl) {
            logger.error(`PTY exited with code ${exitCode} before getting URL`);
            logger.debug(`Output: ${this.stripAnsi(output).slice(-500)}`);
            resolve({ authUrl: '', error: 'Authentication process exited unexpectedly. Is Claude CLI installed?' });
          }
        });
      } catch (error) {
        logger.error('Failed to start OAuth flow:', error);
        fs.rmSync(configDir, { recursive: true, force: true });
        resolve({ authUrl: '', error: `Failed to start authentication: ${error}` });
      }
    });
  }

  /**
   * Complete the OAuth flow by sending the code to the waiting process.
   */
  async completeOAuthFlow(code: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!this.pendingOAuthFlow) {
      return { success: false, error: 'No pending authentication flow. Please start login again.' };
    }

    const { process: proc, configDir, createdAt } = this.pendingOAuthFlow;

    // Check expiration
    if (Date.now() - createdAt > this.OAUTH_TIMEOUT) {
      this.cleanupOAuthFlow();
      return { success: false, error: 'Authentication flow expired. Please start again.' };
    }

    if (!proc || proc.killed) {
      this.cleanupOAuthFlow();
      return { success: false, error: 'Authentication process not running. Please start again.' };
    }

    return new Promise((resolve) => {
      try {
        let output = this.pendingOAuthFlow!.output;

        // Listen for more output
        proc.stdout?.on('data', (data: Buffer) => {
          output += data.toString();
        });
        proc.stderr?.on('data', (data: Buffer) => {
          output += data.toString();
        });

        // Send the code followed by newline
        logger.info(`Sending OAuth code (length=${code.length})`);
        proc.stdin?.write(code + '\n');
        proc.stdin?.end();

        // Wait for result
        const checkResult = () => {
          const clean = this.stripAnsi(output);

          // Look for OAuth token in output (sk-ant-oat01-...)
          const tokenMatch = clean.match(/(sk-ant-oat01-[A-Za-z0-9_\-]+)/);
          if (tokenMatch) {
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
              logger.info('OAuth credentials file found');
              this.cleanupOAuthFlow();
              resolve({ success: true, token: JSON.stringify(creds) });
              return true;
            } catch {
              // Invalid JSON, keep waiting
            }
          }

          // Check for error indicators
          if (clean.toLowerCase().includes('error') || clean.toLowerCase().includes('invalid')) {
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
            logger.error('Timeout waiting for OAuth completion');
            logger.debug(`Final output: ${this.stripAnsi(output).slice(-1000)}`);
            this.cleanupOAuthFlow();
            resolve({ success: false, error: 'Timeout waiting for authentication to complete' });
          }
        }, 500);

        // Handle process exit
        proc.on('exit', (exitCode) => {
          logger.info(`OAuth process exited with code ${exitCode}`);
          // Give a moment for any final output
          setTimeout(() => {
            if (!checkResult()) {
              clearInterval(pollInterval);
              // Last chance - check output for token
              const clean = this.stripAnsi(output);
              const tokenMatch = clean.match(/(sk-ant-oat01-[A-Za-z0-9_\-]+)/);
              if (tokenMatch) {
                this.cleanupOAuthFlow();
                resolve({ success: true, token: tokenMatch[1] });
              } else {
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
      try {
        if (this.pendingOAuthFlow.process && !this.pendingOAuthFlow.process.killed) {
          this.pendingOAuthFlow.process.kill();
        }
      } catch {
        // Process may already be dead
      }

      try {
        if (this.pendingOAuthFlow.configDir && fs.existsSync(this.pendingOAuthFlow.configDir)) {
          fs.rmSync(this.pendingOAuthFlow.configDir, { recursive: true, force: true });
        }
      } catch {
        // Directory may already be removed
      }

      this.pendingOAuthFlow = null;
      logger.info('OAuth flow cleaned up');
    }
  }

  /**
   * Strip ANSI escape codes from string.
   */
  private stripAnsi(str: string): string {
    // CSI sequences (most common)
    let clean = str.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    // OSC sequences
    clean = clean.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
    // DCS, SOS, PM, APC
    clean = clean.replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '');
    // Other single-char escapes
    clean = clean.replace(/\x1b./g, '');
    return clean;
  }
}

export default AuthService;
