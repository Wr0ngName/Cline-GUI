/**
 * Comprehensive tests for PermissionManager.
 *
 * Tests cover:
 * - Permission suggestion parsing (describePermissionSuggestions via public API)
 * - Scope mapping (SDK destinations → session/project/global)
 * - Label generation for different scopes and tool counts
 * - Directory-based suggestions
 * - Mixed suggestions with multiple scopes
 * - Edge cases (no suggestions, empty arrays, etc.)
 */

import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { PendingAction } from '../../../../shared/types';
import { PermissionManager } from '../PermissionManager';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;
  let mockConfigService: any;
  let capturedAction: PendingAction | null;
  let emitToolUse: (action: PendingAction) => void;

  beforeEach(() => {
    // Reset captured action
    capturedAction = null;

    // Mock ConfigService
    mockConfigService = {
      getConfig: vi.fn().mockResolvedValue({
        autoApproveReads: false,
      }),
    };

    // Tool use emitter that captures the action
    emitToolUse = (action: PendingAction) => {
      capturedAction = action;
    };

    // Create PermissionManager instance
    permissionManager = new PermissionManager(mockConfigService, emitToolUse);
  });

  describe('describePermissionSuggestions (via public API)', () => {
    it('should return undefined permissionInfo when no suggestions provided', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      // Call without suggestions
      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions: undefined,
      });

      // Wait for next tick to allow action to be emitted
      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toBeUndefined();
    });

    it('should return undefined permissionInfo when suggestions array is empty', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      // Call with empty suggestions array
      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions: [],
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toBeUndefined();
    });

    it('should create session-scoped label for session destination', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Bash this session',
        description: 'Allow Bash for this session',
        scope: 'session',
      });
    });

    it('should create session-scoped label for cliArg destination', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'cliArg',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Bash this session',
        description: 'Allow Bash for this session',
        scope: 'session',
      });
    });

    it('should create project-scoped label for projectSettings destination', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'projectSettings',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Bash in this project',
        description: 'Allow Bash for this project',
        scope: 'project',
      });
    });

    it('should create project-scoped label for localSettings destination', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'localSettings',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Bash in this project',
        description: 'Allow Bash for this project',
        scope: 'project',
      });
    });

    it('should create global-scoped label for userSettings destination', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'userSettings',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Always allow Bash',
        description: 'Allow Bash globally',
        scope: 'global',
      });
    });

    it('should handle multiple tools in rules with count label', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [
            { toolName: 'Bash' },
            { toolName: 'Read' },
          ],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Allow 2 tools this session');
      expect(capturedAction?.permissionInfo?.scope).toBe('session');
    });

    it('should handle multiple tools across multiple rules', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session',
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Read' }, { toolName: 'Write' }],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Allow 3 tools this session');
      expect(capturedAction?.permissionInfo?.scope).toBe('session');
    });

    it('should include directory info in description for addDirectories', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addDirectories',
          directories: ['/home/user/project', '/home/user/data'],
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo?.description).toContain('/home/user/project');
      expect(capturedAction?.permissionInfo?.description).toContain('/home/user/data');
      expect(capturedAction?.permissionInfo?.description).toContain('Add allowed directories');
    });

    it('should use broadest scope when multiple scopes present', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      // Mix of session, project, and global scopes - global should win
      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session',
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Read' }],
          behavior: 'allow',
          destination: 'projectSettings',
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Write' }],
          behavior: 'allow',
          destination: 'userSettings',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo?.scope).toBe('global');
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Always allow 3 tools');
    });

    it('should prefer project scope over session scope', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session',
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Read' }],
          behavior: 'allow',
          destination: 'projectSettings',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo?.scope).toBe('project');
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Allow 2 tools in this project');
    });

    it('should combine multiple suggestion descriptions', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session',
        },
        {
          type: 'addDirectories',
          directories: ['/home/user/project'],
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      const description = capturedAction?.permissionInfo?.description || '';
      expect(description).toContain('Allow Bash');
      expect(description).toContain('Add allowed directories');
      expect(description).toContain(';'); // Multiple descriptions joined with semicolon
    });

    it('should use requesting tool name when no tools in rules', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      // addDirectories doesn't have rules, so should fall back to requesting tool name
      const suggestions: PermissionUpdate[] = [
        {
          type: 'addDirectories',
          directories: ['/home/user/project'],
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Allow Bash this session');
    });

    it('should handle rules with ruleContent field', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [
            {
              toolName: 'Bash',
              ruleContent: 'command contains "git"',
            },
          ],
          behavior: 'allow',
          destination: 'projectSettings',
        },
      ];

      canUseTool('Bash', { command: 'git status' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Bash in this project',
        description: 'Allow Bash for this project',
        scope: 'project',
      });
    });

    it('should handle deny behavior suggestions', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'deny', // Note: deny instead of allow
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      // Should still create permissionInfo (SDK provides it, we display it)
      expect(capturedAction?.permissionInfo).toBeDefined();
      expect(capturedAction?.permissionInfo?.scope).toBe('session');
    });
  });

  describe('integration with action creation', () => {
    it('should include permissionInfo in Bash action', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'projectSettings',
        },
      ];

      canUseTool('Bash', { command: 'ls -la' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.type).toBe('bash-command');
      expect(capturedAction?.toolName).toBe('Bash');
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Bash in this project',
        description: 'Allow Bash for this project',
        scope: 'project',
      });
    });

    it('should include permissionInfo in Write action', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Write' }],
          behavior: 'allow',
          destination: 'userSettings',
        },
      ];

      canUseTool('Write', { file_path: '/test.txt', content: 'hello' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.type).toBe('file-create');
      expect(capturedAction?.toolName).toBe('Write');
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Always allow Write',
        description: 'Allow Write globally',
        scope: 'global',
      });
    });

    it('should include permissionInfo in Edit action', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Edit' }],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      canUseTool('Edit', {
        file_path: '/test.txt',
        old_string: 'old',
        new_string: 'new',
      }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.type).toBe('file-edit');
      expect(capturedAction?.toolName).toBe('Edit');
      expect(capturedAction?.permissionInfo).toEqual({
        alwaysAllowLabel: 'Allow Edit this session',
        description: 'Allow Edit for this session',
        scope: 'session',
      });
    });

    it('should not include permissionInfo when auto-approving reads', async () => {
      // Configure auto-approve for reads
      mockConfigService.getConfig.mockResolvedValue({
        autoApproveReads: true,
      });

      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Read' }],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      const result = await canUseTool('Read', { file_path: '/test.txt' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      // Should auto-approve without emitting action
      expect(result.behavior).toBe('allow');
      expect(capturedAction).toBeNull(); // No action emitted
    });
  });

  describe('edge cases', () => {
    it('should handle empty rules array', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [],
          behavior: 'allow',
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      // Should fall back to requesting tool name
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Allow Bash this session');
    });

    it('should handle empty directories array', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addDirectories',
          directories: [],
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      expect(capturedAction?.permissionInfo).toBeDefined();
      expect(capturedAction?.permissionInfo?.description).toContain('Add allowed directories');
    });

    it('should deduplicate tool names across suggestions', async () => {
      const canUseTool = permissionManager.createCanUseToolCallback();
      const signal = new AbortController().signal;

      const suggestions: PermissionUpdate[] = [
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }],
          behavior: 'allow',
          destination: 'session',
        },
        {
          type: 'addRules',
          rules: [{ toolName: 'Bash' }], // Duplicate
          behavior: 'allow',
          destination: 'session',
        },
      ];

      canUseTool('Bash', { command: 'ls' }, {
        signal,
        toolUseID: 'test-id',
        suggestions,
      });

      await new Promise(resolve => setImmediate(resolve));

      expect(capturedAction).not.toBeNull();
      // Should show single tool, not "2 tools"
      expect(capturedAction?.permissionInfo?.alwaysAllowLabel).toBe('Allow Bash this session');
    });
  });
});
