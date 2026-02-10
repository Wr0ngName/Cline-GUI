# Cline GUI - Comprehensive Refactoring Plan

**Date:** 2026-02-10
**Overall Grade:** B+ (Production-ready but with clear improvement opportunities)

---

## Executive Summary

Four comprehensive reviews identified the following priorities:

| Category | Issues Found | Severity | Estimated Effort |
|----------|-------------|----------|------------------|
| DRY Violations - Main | 8 major | P0-P1 | 5-7 hours |
| DRY Violations - Renderer | 5 major | P0-P1 | 4-6 hours |
| Magic Values/Constants | 20+ instances | P1 | 2-3 hours |
| Test Over-Mocking | 8 files affected | P1-P2 | 4-6 hours |
| Missing Abstractions | 4 composables | P2 | 6-8 hours |
| Naming Inconsistencies | Multiple files | P3 | 2-3 hours |

**Total Estimated Effort:** 23-33 hours (3-4 days focused work)

---

## Phase 1: Critical DRY Violations (P0)

### 1.1 Create ResourcePaths Utility
**Files:** src/main/utils/resourcePaths.ts (NEW)
**Impact:** Eliminates 15+ duplicated path calculations

Resource paths calculated in multiple places:
- AuthService.ts:104-107, 129-140, 264-265
- ClaudeCodeService.ts:396-397, 400-410
- gitBashExtractor.ts:30-32

### 1.2 Consolidate Conversation Save Logic
**File:** src/renderer/stores/conversations.ts:204-351
**Impact:** Reduces 147 lines to ~80 lines

Two nearly identical functions:
- saveCurrentConversation() (88 lines)
- saveConversation() (59 lines)

### 1.3 Fix Duplicate Title Generation
**File:** src/renderer/stores/conversations.ts:240-243, 316-319, 436-446
Also in: src/main/services/ConversationService.ts:166-171

### 1.4 Unify ID Generation
**Files:**
- src/renderer/utils/id.ts:4
- src/main/services/ConversationService.ts:264
- src/main/services/claude/PermissionManager.ts:53

---

## Phase 2: Constants & Magic Values (P1)

### 2.1 Add PREVIEW_SIZES Constants
20+ hardcoded preview/truncation sizes in:
- AuthService.ts (lines 75, 147, 464, 466, 472, 486, 487, 519, 524, 536, 540, 568)
- SDKMessageHandler.ts (lines 180, 192, 240)
- PermissionManager.ts (line 195)
- ClaudeCodeService.ts (lines 454, 477)

### 2.2 Deduplicate Main/Renderer Constants
Same constants defined in both main and renderer:
- BATCH_CHANGE_THRESHOLD: 10
- FILE_WATCHER_DEBOUNCE_MS: 300

Move shared constants to src/shared/constants.ts.

---

## Phase 3: Utility Extractions (P1-P2)

### 3.1 Extract ANSI Stripping Utility
From: AuthService.ts:1008-1020
To: src/main/utils/ansi.ts

### 3.2 Create String Truncation Utility
Pattern repeated 3+ times.

### 3.3 Extract Markdown Rendering
From: MessageItem.vue:27-76 (50 lines of regex)
To: src/renderer/utils/markdown.ts

---

## Phase 4: Renderer Composable Improvements (P2)

### 4.1 Use Existing useAsyncOperation in Stores
useAsyncOperation composable exists but stores don't use it!
11 occurrences of manual loading/error state management.

### 4.2 Create TransitionFade Component
CONSTANTS.TRANSITIONS exists but not used!
10+ duplicate transition configurations.

### 4.3 Create useErrorHandler Composable
Centralizes error handling across stores.

### 4.4 Create useIPCListener Composable
Simplifies useClaudeChat.ts (200+ lines of listener management).

---

## Phase 5: Test Suite Improvements (P1-P2)

### 5.1 Fix IPC Handler Over-Mocking (CRITICAL)
**Files:**
- src/main/ipc/__tests__/auth.test.ts
- src/main/ipc/__tests__/conversations.test.ts

Tests mock entire services, only testing "handler calls service".
Fix: Use real services with mocked external boundaries.

### 5.2 Add Integration Tests
Missing:
- Complete OAuth flow
- Conversation save flow end-to-end
- Multi-conversation state isolation

---

## Phase 6: Code Organization (P2-P3)

### 6.1 Split Large Service Files
- AuthService.ts (1024 lines) -> auth/ module
- ClaudeCodeService.ts (738 lines) -> claude-code/ module

---

## Implementation Order

### Week 1 (Priority Items)
1. Create ResourcePaths utility (2h)
2. Consolidate conversation save (3h)
3. Fix title generation duplication (30m)
4. Add PREVIEW_SIZES constants (1h)
5. Use useAsyncOperation in stores (2h)
6. Create TransitionFade component (1h)

### Week 2 (Secondary Items)
7. Unify ID generation (2h)
8. Extract ANSI stripping utility (30m)
9. Extract markdown rendering (3h)
10. Deduplicate constants (1h)
11. Fix IPC handler test mocking (4h)
12. Add integration tests (4h)

### Week 3 (Improvements)
13. Create useErrorHandler (4h)
14. Create useIPCListener (4h)
15. Split AuthService (4h)
16. Split ClaudeCodeService (3h)

---

## Success Metrics

After refactoring:
- [ ] Zero duplicated resource path calculations
- [ ] Zero hardcoded preview/truncation sizes
- [ ] Single ID generation implementation
- [ ] useAsyncOperation used in all stores
- [ ] TransitionFade used for all transitions
- [ ] IPC tests use real services
- [ ] Integration test coverage for critical flows
- [ ] All constants in appropriate constants files
- [ ] No files > 500 lines (except complex orchestrators)
