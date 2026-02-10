/**
 * Re-export ID generation from shared module
 *
 * This file maintains backwards compatibility with existing imports
 * while centralizing ID generation logic in src/shared/id.ts
 */

export { generateId, ID_PREFIXES } from '../../shared/id';
