/**
 * Files store - manages file tree and file operations
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

import type { FileNode, FileChange } from '@shared/types';

export const useFilesStore = defineStore('files', () => {
  // State
  const fileTree = ref<FileNode[]>([]);
  const workingDirectory = ref('');
  const selectedFile = ref<string | null>(null);
  const expandedDirs = ref<Set<string>>(new Set());
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Cleanup function for file change listener
  let unsubscribe: (() => void) | null = null;

  // Getters
  const hasFiles = computed(() => fileTree.value.length > 0);
  const hasWorkingDirectory = computed(() => !!workingDirectory.value);

  // Actions
  async function selectDirectory(): Promise<string | null> {
    try {
      const directory = await window.electron.files.selectDirectory();
      if (directory) {
        workingDirectory.value = directory;
        await loadFileTree();
        setupFileWatcher();
      }
      return directory;
    } catch (err) {
      console.error('Failed to select directory:', err);
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
      console.error('Failed to load file tree:', err);
      error.value = 'Failed to load file tree';
    } finally {
      isLoading.value = false;
    }
  }

  async function readFile(filePath: string): Promise<string | null> {
    try {
      return await window.electron.files.read(filePath);
    } catch (err) {
      console.error('Failed to read file:', err);
      error.value = 'Failed to read file';
      return null;
    }
  }

  function selectFile(filePath: string | null) {
    selectedFile.value = filePath;
  }

  function toggleDirectory(dirPath: string) {
    if (expandedDirs.value.has(dirPath)) {
      expandedDirs.value.delete(dirPath);
    } else {
      expandedDirs.value.add(dirPath);
    }
    // Force reactivity
    expandedDirs.value = new Set(expandedDirs.value);
  }

  function expandDirectory(dirPath: string) {
    expandedDirs.value.add(dirPath);
    expandedDirs.value = new Set(expandedDirs.value);
  }

  function collapseDirectory(dirPath: string) {
    expandedDirs.value.delete(dirPath);
    expandedDirs.value = new Set(expandedDirs.value);
  }

  function isDirectoryExpanded(dirPath: string): boolean {
    return expandedDirs.value.has(dirPath);
  }

  function setWorkingDirectory(directory: string) {
    workingDirectory.value = directory;
  }

  function setupFileWatcher() {
    // Clean up existing watcher
    if (unsubscribe) {
      unsubscribe();
    }

    // Set up new watcher
    unsubscribe = window.electron.files.onChange((changes: FileChange[]) => {
      console.log('File changes detected:', changes);
      // Reload file tree on changes
      loadFileTree();
    });
  }

  function clearError() {
    error.value = null;
  }

  function reset() {
    fileTree.value = [];
    workingDirectory.value = '';
    selectedFile.value = null;
    expandedDirs.value = new Set();
    error.value = null;

    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  // Initialize with existing working directory if available
  async function initialize() {
    try {
      const config = await window.electron.config.get();
      if (config.workingDirectory) {
        workingDirectory.value = config.workingDirectory;
        await loadFileTree();
        setupFileWatcher();
      }
    } catch (err) {
      console.error('Failed to initialize files store:', err);
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
    workingDirectory,
    selectedFile,
    expandedDirs,
    isLoading,
    error,

    // Getters
    hasFiles,
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
