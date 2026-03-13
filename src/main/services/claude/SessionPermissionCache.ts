/**
 * Session Permission Cache
 *
 * Stores session-scoped permissions granted via "Always Allow" at the
 * ClaudeCodeService level. Persists across individual query() calls
 * within the same conversation.
 *
 * Only caches session-scoped permissions. Project/global permissions
 * are handled by the SDK via settings files.
 */

import type { PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';

import { generateId, ID_PREFIXES } from '../../../shared/id';
import type { SessionPermissionEntry } from '../../../shared/types';
import logger from '../../utils/logger';

type PermissionChangeCallback = (conversationId: string, permissions: SessionPermissionEntry[]) => void;

export class SessionPermissionCache {
	private cache: Map<string, SessionPermissionEntry[]> = new Map();
	private onChangeCallback: PermissionChangeCallback | null = null;

	/**
	 * Register a callback for permission changes (used for IPC events to renderer)
	 */
	onPermissionsChanged(callback: PermissionChangeCallback): void {
		this.onChangeCallback = callback;
	}

	/**
	 * Add session permissions from an approved "Always Allow" action.
	 * Only caches suggestions with session/cliArg destinations.
	 */
	addPermissions(conversationId: string, suggestions: PermissionUpdate[]): void {
		const entries = this.cache.get(conversationId) ?? [];

		for (const suggestion of suggestions) {
			// Only cache session-scoped permissions
			if (suggestion.destination !== 'session' && suggestion.destination !== 'cliArg') {
				continue;
			}

			// Only process addRules type (not addDirectories)
			if (suggestion.type !== 'addRules') {
				continue;
			}

			for (const rule of suggestion.rules) {
				// Deduplicate: skip if same toolName + ruleContent already cached
				const isDuplicate = entries.some(
					(e) => e.toolName === rule.toolName && e.ruleContent === rule.ruleContent,
				);

				if (isDuplicate) {
					logger.debug('Skipping duplicate session permission', {
						conversationId,
						toolName: rule.toolName,
						ruleContent: rule.ruleContent,
					});
					continue;
				}

				const entry: SessionPermissionEntry = {
					id: generateId(ID_PREFIXES.ACTION),
					toolName: rule.toolName,
					ruleContent: rule.ruleContent,
					description: `Allow ${rule.toolName} for this session`,
					grantedAt: Date.now(),
				};

				entries.push(entry);

				logger.info('Session permission cached', {
					conversationId,
					toolName: rule.toolName,
					permissionId: entry.id,
				});
			}
		}

		this.cache.set(conversationId, entries);
		this.notifyChange(conversationId);
	}

	/**
	 * Check if a tool use is covered by a cached session permission.
	 * Matches by toolName only (ruleContent is for display, not filtering).
	 */
	isAllowed(conversationId: string, toolName: string, _input: Record<string, unknown>): boolean {
		const entries = this.cache.get(conversationId);
		if (!entries || entries.length === 0) {
			return false;
		}

		return entries.some((e) => e.toolName === toolName);
	}

	/**
	 * Revoke a specific permission by its ID.
	 * Returns true if found and removed, false otherwise.
	 */
	revokePermission(conversationId: string, permissionId: string): boolean {
		const entries = this.cache.get(conversationId);
		if (!entries) {
			return false;
		}

		const index = entries.findIndex((e) => e.id === permissionId);
		if (index === -1) {
			return false;
		}

		const removed = entries.splice(index, 1)[0];
		logger.info('Session permission revoked', {
			conversationId,
			permissionId,
			toolName: removed.toolName,
		});

		if (entries.length === 0) {
			this.cache.delete(conversationId);
		}

		this.notifyChange(conversationId);
		return true;
	}

	/**
	 * Get all permissions for a conversation.
	 * Returns empty array for unknown conversations.
	 */
	getPermissions(conversationId: string): SessionPermissionEntry[] {
		return this.cache.get(conversationId) ?? [];
	}

	/**
	 * Clear all permissions for a conversation.
	 */
	clearConversation(conversationId: string): void {
		if (this.cache.has(conversationId)) {
			this.cache.delete(conversationId);
			logger.info('Session permissions cleared for conversation', { conversationId });
			this.notifyChange(conversationId);
		}
	}

	/**
	 * Clear all cached permissions (e.g., app closing).
	 */
	clearAll(): void {
		const conversationIds = Array.from(this.cache.keys());
		this.cache.clear();
		for (const conversationId of conversationIds) {
			this.notifyChange(conversationId);
		}
		logger.info('All session permissions cleared');
	}

	private notifyChange(conversationId: string): void {
		if (this.onChangeCallback) {
			this.onChangeCallback(conversationId, this.getPermissions(conversationId));
		}
	}
}

export default SessionPermissionCache;
