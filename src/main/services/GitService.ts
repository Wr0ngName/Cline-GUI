/**
 * Service for git operations via execFile.
 * Watches .git directory for changes and emits status updates.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import type { GitStatus } from '../../shared/types';
import { MAIN_CONSTANTS } from '../constants/app';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);

export class GitService {
  private watchers: fs.FSWatcher[] = [];
  private watchedDir: string | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private statusCallbacks: Set<(status: GitStatus) => void> = new Set();

  constructor() {
    logger.info('GitService initialized');
  }

  /**
   * Run a git command safely via execFile (no shell injection)
   */
  private async runGit(args: string[], cwd: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd,
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });
      return stdout.trim();
    } catch (error) {
      const err = error as Error & { stderr?: string; code?: string };
      const message = err.stderr?.trim() || err.message;
      throw new Error(message);
    }
  }

  /**
   * Get git repository status
   */
  async getStatus(cwd: string): Promise<GitStatus> {
    // Check if directory is a git repo
    try {
      await this.runGit(['rev-parse', '--is-inside-work-tree'], cwd);
    } catch {
      return { isGitRepo: false, branch: '', dirty: 0, ahead: 0, behind: 0 };
    }

    // Get current branch
    let branch = '';
    try {
      branch = await this.runGit(['branch', '--show-current'], cwd);
      if (!branch) {
        // Detached HEAD
        const shortRef = await this.runGit(['rev-parse', '--short', 'HEAD'], cwd);
        branch = `(${shortRef})`;
      }
    } catch {
      branch = '(unknown)';
    }

    // Get dirty file count
    let dirty = 0;
    try {
      const porcelain = await this.runGit(['status', '--porcelain'], cwd);
      if (porcelain) {
        dirty = porcelain.split('\n').filter((line) => line.length > 0).length;
      }
    } catch {
      // Ignore
    }

    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;
    try {
      const revList = await this.runGit(
        ['rev-list', '--count', '--left-right', '@{upstream}...HEAD'],
        cwd
      );
      const parts = revList.split('\t');
      if (parts.length === 2) {
        behind = parseInt(parts[0], 10) || 0;
        ahead = parseInt(parts[1], 10) || 0;
      }
    } catch {
      // No upstream configured — that's fine
    }

    return { isGitRepo: true, branch, dirty, ahead, behind };
  }

  /**
   * Commit changes.
   * @param cwd Working directory
   * @param message Commit message
   * @param stageAll If true (default), stages all changes with `git add -A` first.
   *                 If false, commits only already-staged changes.
   */
  async commit(cwd: string, message: string, stageAll = true): Promise<string> {
    if (!message.trim()) {
      throw new Error('Commit message must not be empty');
    }

    if (stageAll) {
      await this.runGit(['add', '-A'], cwd);
    }

    const output = await this.runGit(['commit', '-m', message], cwd);
    logger.info('Git commit', { cwd, stageAll, message: message.slice(0, 50) });
    return output;
  }

  /**
   * Pull from remote
   */
  async pull(cwd: string): Promise<string> {
    const output = await this.runGit(['pull'], cwd);
    logger.info('Git pull', { cwd });
    return output;
  }

  /**
   * Push to remote
   */
  async push(cwd: string): Promise<string> {
    const output = await this.runGit(['push'], cwd);
    logger.info('Git push', { cwd });
    return output;
  }

  /**
   * Register a callback for git status changes
   */
  onStatusChange(callback: (status: GitStatus) => void): () => void {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  /**
   * Start watching a git repository for changes.
   * Watches .git/HEAD, .git/index, and .git/refs/ for internal git events.
   */
  startWatching(directory: string): void {
    this.stopWatching();
    this.watchedDir = directory;

    const gitDir = path.join(directory, '.git');

    try {
      fs.accessSync(gitDir);
    } catch {
      logger.debug('Not a git repo, skipping git watch', { directory });
      return;
    }

    // Watch .git/HEAD (branch switches)
    this.watchFile(path.join(gitDir, 'HEAD'));

    // Watch .git/index (staging area changes)
    this.watchFile(path.join(gitDir, 'index'));

    // Watch .git/refs/ recursively (commits, pushes, remote updates)
    const refsDir = path.join(gitDir, 'refs');
    try {
      fs.accessSync(refsDir);
      const watcher = fs.watch(refsDir, { recursive: true }, () => {
        this.scheduleStatusRefresh();
      });
      watcher.on('error', (err) => {
        logger.debug('Git refs watcher error', { error: err.message });
      });
      this.watchers.push(watcher);
    } catch {
      logger.debug('Cannot watch .git/refs/', { directory });
    }

    logger.info('Started watching git directory', { directory });
  }

  /**
   * Watch a single file for changes
   */
  private watchFile(filePath: string): void {
    try {
      fs.accessSync(filePath);
      const watcher = fs.watch(filePath, () => {
        this.scheduleStatusRefresh();
      });
      watcher.on('error', (err) => {
        logger.debug('Git file watcher error', { file: filePath, error: err.message });
      });
      this.watchers.push(watcher);
    } catch {
      logger.debug('Cannot watch git file', { filePath });
    }
  }

  /**
   * Debounce status refresh to avoid rapid-fire updates
   */
  private scheduleStatusRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      if (!this.watchedDir) return;

      try {
        const status = await this.getStatus(this.watchedDir);
        for (const callback of this.statusCallbacks) {
          try {
            callback(status);
          } catch (error) {
            logger.error('Error in git status callback', { error });
          }
        }
      } catch (error) {
        logger.error('Failed to refresh git status', { error });
      }
    }, MAIN_CONSTANTS.FILES.WATCHER_DEBOUNCE_MS);
  }

  /**
   * Trigger a manual status refresh (called after file watcher events)
   */
  triggerRefresh(): void {
    this.scheduleStatusRefresh();
  }

  /**
   * Stop watching
   */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // Ignore close errors
      }
    }
    this.watchers = [];
    this.watchedDir = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    logger.debug('Stopped watching git directory');
  }

  /**
   * Get the currently watched directory
   */
  getWatchedDirectory(): string | null {
    return this.watchedDir;
  }
}

export default GitService;
