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

import { app, shell } from 'electron';
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
   * Prioritizes the bundled CLI in the app resources.
   */
  private findClaudeCli(): string {
    // First, try the bundled CLI in the app's resources (unpacked from asar)
    const resourcesPath = process.resourcesPath || path.dirname(app.getAppPath());
    const bundledCliPaths = [
      // In packaged app: resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-code/cli.js
      path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
      // In development: node_modules/@anthropic-ai/claude-code/cli.js
      path.join(app.getAppPath(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    ];

    for (const cliPath of bundledCliPaths) {
      if (fs.existsSync(cliPath)) {
        logger.info(`Found bundled Claude CLI at: ${cliPath}`);
        return cliPath;
      }
    }

    // Fallback: Try common system locations
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

    // Use npx as fallback (requires Node.js on user's system)
    logger.warn('Claude CLI not found in bundled or system paths, will try npx');
    return 'npx';
  }

  /**
   * Start the OAuth login flow using node-pty.
   * Returns the authorization URL that the user should visit.
   *
   * Based on mautrix-claude sidecar pattern:
   * - Spawns CLI process directly (not through shell)
   * - Uses wide terminal (500 cols) to prevent URL line-wrapping
   * - Captures OAuth URL from output
   * - Keeps PTY alive for code input
   */
  async startOAuthFlow(): Promise<{ authUrl: string; error?: string }> {
    // Clean up any existing flow
    this.cleanupOAuthFlow();

    // Create temp config directory
    const configDir = path.join(os.tmpdir(), `claude-oauth-${Date.now()}`);
    fs.mkdirSync(configDir, { recursive: true });

    const claudeCli = this.findClaudeCli();
    const isNpx = claudeCli === 'npx';
    const isBundledCli = claudeCli.endsWith('cli.js');

    // Build command and args - spawn DIRECTLY, not through a shell (like mautrix-claude sidecar)
    let spawnFile: string;
    let spawnArgs: string[];
    let extraEnv: Record<string, string> = {};

    if (isNpx) {
      // Fallback: use npx through shell (requires Node.js on system)
      spawnFile = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
      spawnArgs = process.platform === 'win32'
        ? ['/c', 'npx @anthropic-ai/claude-code setup-token']
        : ['-c', 'npx @anthropic-ai/claude-code setup-token'];
    } else if (isBundledCli) {
      if (process.platform === 'win32') {
        // On Windows, use bundled Node.js executable instead of ELECTRON_RUN_AS_NODE
        // Windows GUI apps (like Electron) have known stdout capture issues
        // See: https://github.com/electron/electron/issues/4552
        const resourcesPath = process.resourcesPath || path.dirname(app.getAppPath());
        const bundledNodeExe = path.join(resourcesPath, 'node.exe');

        if (fs.existsSync(bundledNodeExe)) {
          logger.info('Windows: using bundled Node.js');
          spawnFile = bundledNodeExe;
          spawnArgs = [claudeCli, 'setup-token'];
        } else {
          // Fallback to ELECTRON_RUN_AS_NODE via PowerShell (may not capture output)
          logger.warn('Windows: bundled Node.js not found, falling back to ELECTRON_RUN_AS_NODE');
          logger.warn(`Expected at: ${bundledNodeExe}`);
          spawnFile = 'powershell.exe';
          const escapeForPowerShell = (s: string): string => s.replace(/'/g, "''");
          const escapedExePath = escapeForPowerShell(process.execPath);
          const escapedCliPath = escapeForPowerShell(claudeCli);
          const psCommand = `$env:ELECTRON_RUN_AS_NODE='1'; & '${escapedExePath}' '${escapedCliPath}' 'setup-token'`;
          spawnArgs = ['-NoProfile', '-Command', psCommand];
        }
      } else {
        // On Linux/macOS, spawn Electron directly with env var (works fine)
        spawnFile = process.execPath;
        spawnArgs = [claudeCli, 'setup-token'];
        extraEnv = { ELECTRON_RUN_AS_NODE: '1' };
      }
      logger.info(`Using bundled CLI: ${spawnFile} ${JSON.stringify(spawnArgs)}`);
    } else {
      // System CLI: spawn directly
      spawnFile = claudeCli;
      spawnArgs = ['setup-token'];
    }

    logger.info(`Starting OAuth flow on ${process.platform}`);
    logger.info(`Spawn file: ${spawnFile}`);
    logger.info(`Spawn args: ${JSON.stringify(spawnArgs)}`);
    logger.info(`CLI path: ${claudeCli}`);
    logger.info(`CLI path exists: ${fs.existsSync(claudeCli)}`);
    logger.info(`Spawn file exists: ${fs.existsSync(spawnFile)}`);
    logger.info(`Extra env: ${JSON.stringify(extraEnv)}`);

    // Environment without browser auto-open (like mautrix-claude sidecar)
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...extraEnv,
      // Prevent browser auto-open: use a command that does nothing
      // On Windows, 'echo' doesn't work as BROWSER - use empty string or cmd /c echo
      BROWSER: process.platform === 'win32' ? 'cmd /c echo' : '/bin/false',
      CLAUDE_CONFIG_DIR: configDir,
      TERM: 'xterm-256color',
      NO_COLOR: '1',
    };
    // Prevent X11 browser launch on Linux
    if (process.platform !== 'win32') {
      delete env.DISPLAY;
    }

    return new Promise((resolve) => {
      try {
        logger.info('Creating PTY process...');
        // Create PTY - use wide terminal (500 cols) to prevent URL line-wrapping
        // This is the pattern from mautrix-claude sidecar
        const ptyProcess = pty.spawn(spawnFile, spawnArgs, {
          name: 'xterm-256color',
          cols: 500, // Wide terminal to prevent URL wrapping
          rows: 30,
          cwd: os.homedir(),
          env,
        });
        logger.info(`PTY process created, pid: ${ptyProcess.pid}`);

        // Handle PTY errors
        ptyProcess.onExit(({ exitCode, signal }) => {
          if (exitCode !== 0 && exitCode !== null) {
            logger.warn(`PTY process ended abnormally: exitCode=${exitCode}, signal=${signal}`);
          }
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
          logger.debug(`OAuth pty data (${data.length} bytes): ${data.slice(0, 200).replace(/\n/g, '\\n')}`);
          checkForUrl();
        });

        // Timeout after 30 seconds
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            logger.error('Timeout waiting for OAuth URL after 30s');
            logger.error(`Total output received: ${output.length} bytes`);
            logger.error(`Cleaned output (last 1000 chars): ${this.stripAnsi(output).slice(-1000)}`);
            this.cleanupOAuthFlow();
            resolve({ authUrl: '', error: 'Timeout waiting for authentication URL. Is Claude CLI installed?' });
          }
        }, 30000);

        ptyProcess.onExit(({ exitCode, signal }) => {
          clearTimeout(timeoutId);
          logger.info(`PTY process exited: code=${exitCode}, signal=${signal}`);
          // Give time for output to be processed
          setTimeout(() => {
            checkForUrl();
            if (!resolved) {
              logger.error(`PTY exited with code ${exitCode} before getting URL`);
              logger.error(`Total output: ${output.length} bytes`);
              logger.error(`Output (last 1000 chars): ${this.stripAnsi(output).slice(-1000)}`);
              this.cleanupOAuthFlow();
              resolve({ authUrl: '', error: `Authentication process exited (code ${exitCode}). Check logs for details.` });
            }
          }, 500);
        });
      } catch (error) {
        const err = error as Error;
        logger.error('Failed to start OAuth flow:', err.message);
        logger.error('Stack:', err.stack);
        fs.rmSync(configDir, { recursive: true, force: true });
        resolve({ authUrl: '', error: `Failed to start authentication: ${err.message}` });
      }
    });
  }

  /**
   * Complete the OAuth flow by sending the code to the PTY.
   *
   * Based on mautrix-claude sidecar pattern:
   * - Sends code character by character (Ink/Node.js UIs need individual keystrokes)
   * - Sends CR+LF to submit
   * - Looks for sk-ant-oat01-... token in output
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

        // Send the code character by character (like mautrix-claude sidecar)
        // Ink/Node.js terminal UIs often need to see individual keystrokes
        logger.info(`Typing OAuth code character by character (length=${code.length})`);
        for (const char of code) {
          ptyProcess.write(char);
        }

        // Send CR+LF to submit (like mautrix-claude sidecar)
        setTimeout(() => {
          ptyProcess.write('\r');
          setTimeout(() => {
            ptyProcess.write('\n');
            logger.info('Finished typing code, sent CR+LF');
          }, 100);
        }, 50);

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
