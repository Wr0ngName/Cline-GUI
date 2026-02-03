/**
 * Comprehensive tests for FileWatcherService.
 *
 * Tests cover:
 * - Directory watching with fs.watch
 * - Change detection and debouncing
 * - File tree scanning with depth limits
 * - File reading with path traversal protection
 * - Ignore patterns for node_modules, .git, etc.
 * - Callback management
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to ensure mocks are available before vi.mock is called
const { mockFSWatcher, mockFs } = vi.hoisted(() => {
  const mockFSWatcher = {
    on: vi.fn(),
    close: vi.fn(),
  };

  const mockFs = {
    watch: vi.fn(),
    accessSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    promises: {
      readdir: vi.fn(),
      readFile: vi.fn(),
      stat: vi.fn(),
    },
  };

  return { mockFSWatcher, mockFs };
});

// Store event handlers for triggering
let watchCallback: ((eventType: string, filename: string) => void) | null = null;

vi.mock('node:fs', () => ({
  default: mockFs,
  watch: mockFs.watch,
  accessSync: mockFs.accessSync,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
  promises: mockFs.promises,
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock paths utility
vi.mock('../../utils/paths', () => ({
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
  isPathWithin: (filePath: string, baseDir: string) => {
    const normalizedFile = filePath.replace(/\\/g, '/');
    const normalizedBase = baseDir.replace(/\\/g, '/');
    // Handle path traversal - reject paths with ..
    if (normalizedFile.includes('/../') || normalizedFile.includes('/..')) {
      return false;
    }
    return normalizedFile.startsWith(normalizedBase);
  },
}));

// Import after mocks
import { FileSystemError } from '../../errors';
import { FileWatcherService } from '../FileWatcherService';

describe('FileWatcherService', () => {
  let service: FileWatcherService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    watchCallback = null;

    // Set up watch mock to capture callbacks
    mockFs.watch.mockImplementation((_dir: string, _options: any, callback: any) => {
      watchCallback = callback;
      mockFSWatcher.on.mockImplementation((_event: string, _handler: any) => {
        return mockFSWatcher;
      });
      return mockFSWatcher;
    });

    service = new FileWatcherService();
  });

  afterEach(() => {
    vi.useRealTimers();
    service.stop();
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================
  describe('initialization', () => {
    it('should initialize without watching', () => {
      expect(service.getWatchedDirectory()).toBeNull();
    });
  });

  // ===========================================================================
  // watch()
  // ===========================================================================
  describe('watch()', () => {
    it('should start watching a directory', () => {
      service.watch('/home/user/project');

      expect(mockFs.watch).toHaveBeenCalledWith(
        '/home/user/project',
        { recursive: true },
        expect.any(Function)
      );
    });

    it('should set the watched directory', () => {
      service.watch('/home/user/project');

      expect(service.getWatchedDirectory()).toBe('/home/user/project');
    });

    it('should stop previous watcher before starting new one', () => {
      service.watch('/home/user/project1');
      service.watch('/home/user/project2');

      expect(mockFSWatcher.close).toHaveBeenCalled();
      expect(service.getWatchedDirectory()).toBe('/home/user/project2');
    });

    it('should register error handler', () => {
      service.watch('/home/user/project');

      expect(mockFSWatcher.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register close handler', () => {
      service.watch('/home/user/project');

      expect(mockFSWatcher.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should handle watch errors gracefully', () => {
      mockFs.watch.mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      expect(() => service.watch('/restricted')).not.toThrow();
    });
  });

  // ===========================================================================
  // stop()
  // ===========================================================================
  describe('stop()', () => {
    it('should close the watcher', () => {
      service.watch('/home/user/project');
      service.stop();

      expect(mockFSWatcher.close).toHaveBeenCalled();
    });

    it('should clear the watched directory', () => {
      service.watch('/home/user/project');
      service.stop();

      expect(service.getWatchedDirectory()).toBeNull();
    });

    it('should clear pending changes', () => {
      service.watch('/home/user/project');

      // Trigger a change
      if (watchCallback) {
        watchCallback('change', 'file.txt');
      }

      service.stop();

      // No callbacks should be fired after stop
      vi.advanceTimersByTime(500);

      // No error means stop cleared pending
    });

    it('should be safe to call multiple times', () => {
      service.watch('/home/user/project');
      service.stop();
      service.stop();
      service.stop();

      // Should not throw
    });
  });

  // ===========================================================================
  // File Change Detection
  // ===========================================================================
  describe('file change detection', () => {
    let changeHandler: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      changeHandler = vi.fn();
      service.onChange(changeHandler as any);
      service.watch('/home/user/project');
    });

    it('should detect file changes', () => {
      mockFs.accessSync.mockReturnValue(undefined);

      if (watchCallback) {
        watchCallback('change', 'src/file.ts');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).toHaveBeenCalledWith([
        { type: 'change', path: expect.stringContaining('src') },
      ]);
    });

    it('should detect file additions (rename event with file existing)', () => {
      mockFs.accessSync.mockReturnValue(undefined);

      if (watchCallback) {
        watchCallback('rename', 'new-file.ts');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).toHaveBeenCalledWith([
        { type: 'add', path: expect.stringContaining('new-file') },
      ]);
    });

    it('should detect file deletions (rename event with file not existing)', () => {
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      if (watchCallback) {
        watchCallback('rename', 'deleted-file.ts');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).toHaveBeenCalledWith([
        { type: 'unlink', path: expect.stringContaining('deleted-file') },
      ]);
    });

    it('should debounce rapid changes', () => {
      mockFs.accessSync.mockReturnValue(undefined);

      if (watchCallback) {
        watchCallback('change', 'file1.ts');
        watchCallback('change', 'file2.ts');
        watchCallback('change', 'file3.ts');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).toHaveBeenCalledTimes(1);
      expect(changeHandler).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining('file1') }),
        expect.objectContaining({ path: expect.stringContaining('file2') }),
        expect.objectContaining({ path: expect.stringContaining('file3') }),
      ]));
    });

    it('should ignore null filenames', () => {
      if (watchCallback) {
        (watchCallback as any)('change', null);
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Ignore Patterns
  // ===========================================================================
  describe('ignore patterns', () => {
    let changeHandler: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      changeHandler = vi.fn();
      service.onChange(changeHandler as any);
      service.watch('/home/user/project');
      mockFs.accessSync.mockReturnValue(undefined);
    });

    it('should ignore node_modules changes', () => {
      if (watchCallback) {
        watchCallback('change', 'node_modules/lodash/index.js');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).not.toHaveBeenCalled();
    });

    it('should ignore .git directory changes', () => {
      if (watchCallback) {
        watchCallback('change', '.git/objects/abc123');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).not.toHaveBeenCalled();
    });

    it('should ignore dist directory changes', () => {
      if (watchCallback) {
        watchCallback('change', 'dist/bundle.js');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).not.toHaveBeenCalled();
    });

    it('should ignore .DS_Store files', () => {
      if (watchCallback) {
        watchCallback('change', 'src/.DS_Store');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).not.toHaveBeenCalled();
    });

    it('should ignore nested ignored directories', () => {
      if (watchCallback) {
        watchCallback('change', 'packages/lib/node_modules/dep/file.js');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).not.toHaveBeenCalled();
    });

    it('should not ignore regular files', () => {
      if (watchCallback) {
        watchCallback('change', 'src/index.ts');
      }

      vi.advanceTimersByTime(350);

      expect(changeHandler).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // onChange()
  // ===========================================================================
  describe('onChange()', () => {
    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = service.onChange(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should unsubscribe when called', () => {
      const callback = vi.fn();
      const unsubscribe = service.onChange(callback);

      unsubscribe();

      service.watch('/home/user/project');
      mockFs.accessSync.mockReturnValue(undefined);

      if (watchCallback) {
        watchCallback('change', 'file.ts');
      }

      vi.advanceTimersByTime(350);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      service.onChange(callback1);
      service.onChange(callback2);
      service.watch('/home/user/project');
      mockFs.accessSync.mockReturnValue(undefined);

      if (watchCallback) {
        watchCallback('change', 'file.ts');
      }

      vi.advanceTimersByTime(350);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi.fn();

      service.onChange(errorCallback);
      service.onChange(normalCallback);
      service.watch('/home/user/project');
      mockFs.accessSync.mockReturnValue(undefined);

      if (watchCallback) {
        watchCallback('change', 'file.ts');
      }

      vi.advanceTimersByTime(350);

      // Should still call the other callback
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // getFileTree()
  // ===========================================================================
  describe('getFileTree()', () => {
    beforeEach(() => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'package.json', isDirectory: () => false, isFile: () => true },
        { name: 'README.md', isDirectory: () => false, isFile: () => true },
      ]);

      mockFs.promises.stat.mockResolvedValue({
        size: 1024,
        mtimeMs: Date.now(),
      });
    });

    it('should return file tree for directory', async () => {
      const tree = await service.getFileTree('/home/user/project');

      expect(tree).toBeInstanceOf(Array);
      expect(tree.length).toBeGreaterThan(0);
    });

    it('should include directories with children', async () => {
      // First call for root, second for src
      mockFs.promises.readdir
        .mockResolvedValueOnce([
          { name: 'src', isDirectory: () => true, isFile: () => false },
        ])
        .mockResolvedValueOnce([
          { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        ]);

      const tree = await service.getFileTree('/home/user/project');

      expect(tree[0]).toMatchObject({
        name: 'src',
        type: 'directory',
        children: expect.any(Array),
      });
    });

    it('should include file metadata', async () => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'file.ts', isDirectory: () => false, isFile: () => true },
      ]);

      mockFs.promises.stat.mockResolvedValue({
        size: 2048,
        mtimeMs: 1704067200000,
      });

      const tree = await service.getFileTree('/home/user/project');

      expect(tree[0]).toMatchObject({
        name: 'file.ts',
        type: 'file',
        size: 2048,
        modifiedAt: 1704067200000,
      });
    });

    it('should respect max depth', async () => {
      // Create deeply nested structure
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'level', isDirectory: () => true, isFile: () => false },
      ]);

      await service.getFileTree('/home/user/project', 1 as any);

      // At max depth, should not recurse
      expect(mockFs.promises.readdir).toHaveBeenCalledTimes(1);
    });

    it('should filter out node_modules', async () => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
      ]);

      const tree = await service.getFileTree('/home/user/project');

      const nodeModules = tree.find((n) => n.name === 'node_modules');
      expect(nodeModules).toBeUndefined();
    });

    it('should filter out .git directory', async () => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: '.git', isDirectory: () => true, isFile: () => false },
      ]);

      const tree = await service.getFileTree('/home/user/project');

      const gitDir = tree.find((n) => n.name === '.git');
      expect(gitDir).toBeUndefined();
    });

    it('should sort directories before files', async () => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'zfile.ts', isDirectory: () => false, isFile: () => true },
        { name: 'adir', isDirectory: () => true, isFile: () => false },
      ]);

      const tree = await service.getFileTree('/home/user/project');

      expect(tree[0].name).toBe('adir');
      expect(tree[1].name).toBe('zfile.ts');
    });

    it('should sort alphabetically within type', async () => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'zebra.ts', isDirectory: () => false, isFile: () => true },
        { name: 'alpha.ts', isDirectory: () => false, isFile: () => true },
        { name: 'beta.ts', isDirectory: () => false, isFile: () => true },
      ]);

      const tree = await service.getFileTree('/home/user/project');

      expect(tree.map((n) => n.name)).toEqual(['alpha.ts', 'beta.ts', 'zebra.ts']);
    });

    it('should return empty array on error', async () => {
      mockFs.promises.readdir.mockRejectedValue(new Error('Permission denied'));

      const tree = await service.getFileTree('/home/user/project');

      expect(tree).toEqual([]);
    });

    it('should skip files that cannot be stat-ed', async () => {
      mockFs.promises.readdir.mockResolvedValue([
        { name: 'good.ts', isDirectory: () => false, isFile: () => true },
        { name: 'bad.ts', isDirectory: () => false, isFile: () => true },
      ]);

      mockFs.promises.stat
        .mockResolvedValueOnce({ size: 100, mtimeMs: Date.now() })
        .mockRejectedValueOnce(new Error('Permission denied'));

      const tree = await service.getFileTree('/home/user/project');

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('good.ts');
    });
  });

  // ===========================================================================
  // readFile()
  // ===========================================================================
  describe('readFile()', () => {
    it('should read file content', async () => {
      mockFs.promises.readFile.mockResolvedValue('file content here');

      const content = await service.readFile(
        '/home/user/project/src/index.ts',
        '/home/user/project'
      );

      expect(content).toBe('file content here');
    });

    it('should prevent path traversal outside working directory', async () => {
      await expect(
        service.readFile('/home/user/other/file.ts', '/home/user/project')
      ).rejects.toThrow(FileSystemError);
    });

    it('should prevent path traversal with ..', async () => {
      // The isPathWithin mock will catch this
      await expect(
        service.readFile('/home/user/project/../other/file.ts', '/home/user/project')
      ).rejects.toThrow(FileSystemError);
    });

    it('should throw FileSystemError on read failure', async () => {
      mockFs.promises.readFile.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.readFile('/home/user/project/missing.ts', '/home/user/project')
      ).rejects.toThrow(FileSystemError);
    });

    it('should include file path in error', async () => {
      mockFs.promises.readFile.mockRejectedValue(new Error('Permission denied'));

      try {
        await service.readFile('/home/user/project/secret.ts', '/home/user/project');
        expect.fail('Should have thrown');
      } catch (error) {
        // FileSystemError uses 'path' not 'filePath'
        expect((error as FileSystemError).path).toBe('/home/user/project/secret.ts');
      }
    });

    it('should read utf-8 encoded files', async () => {
      mockFs.promises.readFile.mockResolvedValue('const x = "hello 世界"');

      const content = await service.readFile(
        '/home/user/project/unicode.ts',
        '/home/user/project'
      );

      expect(content).toContain('世界');
    });

    it('should read empty files', async () => {
      mockFs.promises.readFile.mockResolvedValue('');

      const content = await service.readFile(
        '/home/user/project/empty.ts',
        '/home/user/project'
      );

      expect(content).toBe('');
    });
  });

  // ===========================================================================
  // getWatchedDirectory()
  // ===========================================================================
  describe('getWatchedDirectory()', () => {
    it('should return null when not watching', () => {
      expect(service.getWatchedDirectory()).toBeNull();
    });

    it('should return the watched directory', () => {
      service.watch('/home/user/project');

      expect(service.getWatchedDirectory()).toBe('/home/user/project');
    });

    it('should return null after stop', () => {
      service.watch('/home/user/project');
      service.stop();

      expect(service.getWatchedDirectory()).toBeNull();
    });
  });
});
