/**
 * Files store - manages file tree and file operations
 */

import type { FileNode, FileChange } from '@shared/types';
import { defineStore } from 'pinia';
import { ref, computed, reactive } from 'vue';

import { CONSTANTS } from '../constants/app';
import { logger } from '../utils/logger';

import { useSettingsStore } from './settings';

export const useFilesStore = defineStore('files', () => {
  // State
  const fileTree = ref<FileNode[]>([]);
  const selectedFile = ref<string | null>(null);
  const expandedDirs = reactive(new Set<string>());
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Cleanup function for file change listener
  let unsubscribe: (() => void) | null = null;

  // Getters
  const hasFiles = computed(() => fileTree.value.length > 0);
  const workingDirectory = computed(() => useSettingsStore().workingDirectory);
  const hasWorkingDirectory = computed(() => !!workingDirectory.value);

  // Actions
  async function selectDirectory(): Promise<string | null> {
    try {
      const directory = await window.electron.files.selectDirectory();
      if (directory) {
        const settingsStore = useSettingsStore();
        await settingsStore.setWorkingDirectory(directory);
        await loadFileTree();
        setupFileWatcher();
      }
      return directory;
    } catch (err) {
      logger.error('Failed to select directory', err);
      error.value = 'Failed to select directory';
      return null;
    }
  }

  async function loadFileTree() {
    if (!workingDirectory.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const tree = await window.electron.files.getTree(workingDirectory.value);
      fileTree.value = tree;
    } catch (err) {
      logger.error('Failed to load file tree', err);
      error.value = 'Failed to load file tree';
    } finally {
      isLoading.value = false;
    }
  }

  async function readFile(filePath: string): Promise<string | null> {
    try {
      return await window.electron.files.read(filePath);
    } catch (err) {
      logger.error('Failed to read file', err);
      error.value = 'Failed to read file';
      return null;
    }
  }

  function selectFile(filePath: string | null) {
    selectedFile.value = filePath;
  }

  function toggleDirectory(dirPath: string) {
    if (expandedDirs.has(dirPath)) {
      expandedDirs.delete(dirPath);
    } else {
      expandedDirs.add(dirPath);
    }
  }

  function expandDirectory(dirPath: string) {
    expandedDirs.add(dirPath);
  }

  function collapseDirectory(dirPath: string) {
    expandedDirs.delete(dirPath);
  }

  function isDirectoryExpanded(dirPath: string): boolean {
    return expandedDirs.has(dirPath);
  }

  async function setWorkingDirectory(directory: string) {
    const settingsStore = useSettingsStore();
    await settingsStore.setWorkingDirectory(directory);
  }

  /**
   * Apply incremental changes to the file tree
   * This avoids full tree reload on every file change
   */
  function applyFileChanges(changes: FileChange[]) {
    for (const change of changes) {
      const pathParts = getRelativePathParts(change.path);
      if (!pathParts) continue;

      switch (change.type) {
        case 'add':
          addNodeToTree(pathParts, change.path);
          break;
        case 'unlink':
          removeNodeFromTree(pathParts);
          break;
        case 'change':
          // For file content changes, we just need to update the modifiedAt timestamp
          // which requires refetching the file info - for now, mark as needing refresh
          updateNodeInTree(pathParts);
          break;
      }
    }

    // Force reactivity update
    fileTree.value = [...fileTree.value];
  }

  /**
   * Get the path parts relative to working directory
   */
  function getRelativePathParts(fullPath: string): string[] | null {
    if (!workingDirectory.value) return null;

    // Normalize paths for comparison
    const normalizedFull = fullPath.replace(/\\/g, '/');
    const normalizedWork = workingDirectory.value.replace(/\\/g, '/');

    if (!normalizedFull.startsWith(normalizedWork)) {
      return null;
    }

    const relativePath = normalizedFull.slice(normalizedWork.length).replace(/^\//, '');
    if (!relativePath) return null;

    return relativePath.split('/');
  }

  /**
   * Find a node in the tree by path parts
   */
  function findParentNode(pathParts: string[]): { parent: FileNode[] | null; name: string } {
    if (pathParts.length === 0) {
      return { parent: null, name: '' };
    }

    if (pathParts.length === 1) {
      return { parent: fileTree.value, name: pathParts[0] };
    }

    let current = fileTree.value;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const node = current.find(n => n.name === pathParts[i] && n.type === 'directory');
      if (!node || !node.children) {
        return { parent: null, name: '' };
      }
      current = node.children;
    }

    return { parent: current, name: pathParts[pathParts.length - 1] };
  }

  /**
   * Add a new node to the tree
   */
  function addNodeToTree(pathParts: string[], fullPath: string) {
    const { parent, name } = findParentNode(pathParts);
    if (!parent || !name) return;

    // Check if already exists
    const existingIndex = parent.findIndex(n => n.name === name);
    if (existingIndex !== -1) {
      return; // Already exists
    }

    // Determine if it's a file or directory
    // For now, treat as file unless it has no extension (heuristic)
    const isDirectory = !name.includes('.');

    const newNode: FileNode = {
      name,
      path: fullPath,
      type: isDirectory ? 'directory' : 'file',
      ...(isDirectory ? { children: [] } : { modifiedAt: Date.now() }),
    };

    // Insert in sorted position (directories first, then alphabetically)
    let insertIndex = parent.length;
    for (let i = 0; i < parent.length; i++) {
      const existing = parent[i];
      if (isDirectory && existing.type === 'file') {
        insertIndex = i;
        break;
      }
      if (isDirectory === (existing.type === 'directory') && name.localeCompare(existing.name) < 0) {
        insertIndex = i;
        break;
      }
    }

    parent.splice(insertIndex, 0, newNode);
    logger.debug('Added node to tree', { name, fullPath });
  }

  /**
   * Remove a node from the tree
   */
  function removeNodeFromTree(pathParts: string[]) {
    const { parent, name } = findParentNode(pathParts);
    if (!parent || !name) return;

    const index = parent.findIndex(n => n.name === name);
    if (index !== -1) {
      parent.splice(index, 1);
      logger.debug('Removed node from tree', { name });
    }
  }

  /**
   * Update a node in the tree (mark as modified)
   */
  function updateNodeInTree(pathParts: string[]) {
    const { parent, name } = findParentNode(pathParts);
    if (!parent || !name) return;

    const node = parent.find(n => n.name === name);
    if (node && node.type === 'file') {
      node.modifiedAt = Date.now();
      logger.debug('Updated node in tree', { name });
    }
  }

  function setupFileWatcher() {
    // Clean up existing watcher
    if (unsubscribe) {
      unsubscribe();
    }

    // Set up new watcher
    unsubscribe = window.electron.files.onChange((changes: FileChange[]) => {
      logger.debug('File changes detected', { changeCount: changes.length });

      // Use incremental updates for better performance
      // Only reload full tree if there are many changes (likely a major operation)
      if (changes.length > CONSTANTS.FILES.BATCH_CHANGE_THRESHOLD) {
        loadFileTree();
      } else {
        applyFileChanges(changes);
      }
    });
  }

  function clearError() {
    error.value = null;
  }

  function reset() {
    fileTree.value = [];
    selectedFile.value = null;
    expandedDirs.clear();
    error.value = null;

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  // Initialize with existing working directory if available
  async function initialize() {
    try {
      const settingsStore = useSettingsStore();
      if (settingsStore.workingDirectory) {
        await loadFileTree();
        setupFileWatcher();
      }
    } catch (err) {
      logger.error('Failed to initialize files store', err);
    }
  }

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return {
    // State
    fileTree,
    selectedFile,
    expandedDirs,
    isLoading,
    error,

    // Getters
    hasFiles,
    workingDirectory,
    hasWorkingDirectory,

    // Actions
    selectDirectory,
    loadFileTree,
    readFile,
    selectFile,
    toggleDirectory,
    expandDirectory,
    collapseDirectory,
    isDirectoryExpanded,
    setWorkingDirectory,
    setupFileWatcher,
    clearError,
    reset,
    initialize,
    cleanup,
  };
});
