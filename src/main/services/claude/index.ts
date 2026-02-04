/**
 * Claude Code Service Modules
 *
 * This directory contains the modularized components of the Claude Code Service:
 * - PermissionManager: Handles tool permission requests and user approval flow
 * - SDKMessageHandler: Processes messages from the Claude Code SDK
 * - AuthValidator: Validates OAuth tokens and API keys
 * - ErrorHandler: Converts technical errors to user-friendly messages
 */

export { PermissionManager } from './PermissionManager';
export { SDKMessageHandler } from './SDKMessageHandler';
export { AuthValidator } from './AuthValidator';
export { ErrorHandler } from './ErrorHandler';
export { BuiltinCommandHandler } from './BuiltinCommandHandler';
