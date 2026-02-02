# Auto-Update 404 Error - Fix Summary

## Problem

Application fails to check for updates with error:
```
Error: Cannot find channel "latest.yml" update info: HttpError: 404
url: https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/latest.yml
```

## Root Cause Analysis

### Primary Issue: No Release Published
- Repository has **no git tags** yet (verified with `git tag -l`)
- CI/CD pipeline only runs `publish:packages` job for tags matching `^v\d+\.\d+\.\d+$`
- Therefore, `latest.yml` has never been uploaded to GitLab Package Registry
- **Result: HTTP 404 - file doesn't exist**

### Secondary Issue: Potential Authentication Problem
- HTTP response shows `ratelimit-name: throttle_unauthenticated_api`
- GitLab Package Registry may require authentication for private repositories
- Without authentication, even existing packages would return 401/404
- **Result: Future-proofing needed for private package access**

## Solution Implemented

### Code Changes

**File:** `/mnt/data/git/cline-gui/src/main/services/UpdateService.ts`

**Change:** Added authentication support for private GitLab Package Registry

```typescript
// Before
autoUpdater.setFeedURL({
  provider: 'generic',
  url: `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/releases`,
});

// After
autoUpdater.setFeedURL({
  provider: 'generic',
  url: `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/releases`,
});

// NEW: Optional authentication for private registries
const updateToken = process.env.GITLAB_UPDATE_TOKEN;
if (updateToken) {
  autoUpdater.requestHeaders = {
    'Private-Token': updateToken,
  };
  logger.info('Auto-updater configured with authentication');
} else {
  logger.info('Auto-updater configured without authentication (public access only)');
}
```

**Benefits:**
- Works with **public** package registries (no token needed)
- Works with **private** package registries (with token)
- Gracefully handles missing token with informative logging
- Uses environment variable for configuration (secure, flexible)

### Documentation Created

**File:** `/mnt/data/git/cline-gui/docs/AUTO_UPDATE_SETUP.md`

Comprehensive guide covering:
- How auto-updates work in the app
- Current issue diagnosis
- Step-by-step solutions
- Configuration details
- Testing procedures
- Troubleshooting guide

## Action Items Required

### 1. Create First Release (REQUIRED)

```bash
# Tag the current version
git tag v0.1.0
git push origin v0.1.0
```

This will trigger the CI/CD pipeline to:
- Build Linux (DEB, RPM) and Windows installers
- Upload them to GitLab Package Registry
- Generate and upload `latest.yml`

### 2. Choose Access Strategy

**Option A: Public Package Registry (Recommended for Open Source)**

1. Go to GitLab: Settings → General → Visibility
2. Set Package Registry visibility to "Public" or "Everyone With Access"
3. No application changes needed
4. Auto-updates will work immediately

**Option B: Private Package Registry with Authentication**

1. Create GitLab Deploy Token:
   - Settings → Repository → Deploy Tokens
   - Name: `update-checker`
   - Scope: `read_package_registry`
   - Save token (shown only once!)

2. Configure app to use token:
   ```bash
   # Development/testing
   export GITLAB_UPDATE_TOKEN=your_token_here
   npm start

   # Production (requires installer modification or user configuration)
   # Document in deployment guide
   ```

## Verification Steps

### 1. After Creating Tag

Wait for CI/CD to complete, then verify:

```bash
# Check if latest.yml exists
curl -I "https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/latest.yml"

# Expected: HTTP/2 200 (if public) or HTTP/2 401 (if private)
# NOT: HTTP/2 404
```

### 2. Test Update Check

```bash
# If using private registry with token
export GITLAB_UPDATE_TOKEN=your_token

# Start app
npm start

# In app: Settings → About → Check for Updates
# Should not show 404 error
```

### 3. Check Logs

Look for in application logs:
```
Auto-updater configured with authentication
```
or
```
Auto-updater configured without authentication (public access only)
```

## Current Configuration Summary

### UpdateService Setup

| Setting | Value |
|---------|-------|
| Provider | `generic` |
| Feed URL | `https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases` |
| Channel | `latest` (default) |
| Channel File | `latest.yml` |
| Full URL | `{feedUrl}/latest.yml` |
| Authentication | Optional via `GITLAB_UPDATE_TOKEN` env var |

### CI/CD Pipeline

| Setting | Value |
|---------|-------|
| Trigger | Git tags matching `^v\d+\.\d+\.\d+$` |
| Platforms | Linux (DEB, RPM), Windows (EXE) |
| Upload Path | `${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/releases/` |
| Metadata File | `latest.yml` (uploaded to root of `/releases/`) |
| Authentication | `JOB-TOKEN` (automatic in CI/CD) |

## Files Changed

1. **Modified:**
   - `/mnt/data/git/cline-gui/src/main/services/UpdateService.ts`
     - Added authentication support
     - Enhanced logging

2. **Created:**
   - `/mnt/data/git/cline-gui/docs/AUTO_UPDATE_SETUP.md`
     - Complete setup and troubleshooting guide
   - `/mnt/data/git/cline-gui/docs/AUTO_UPDATE_FIX_SUMMARY.md`
     - This summary document

## Testing Checklist

- [ ] Create git tag: `git tag v0.1.0 && git push origin v0.1.0`
- [ ] Wait for CI/CD pipeline to complete
- [ ] Verify `latest.yml` exists at expected URL
- [ ] Choose access strategy (public or private)
- [ ] If private: Create deploy token and test with `GITLAB_UPDATE_TOKEN`
- [ ] Build and install app locally
- [ ] Check for updates in app (Settings → About)
- [ ] Verify no 404 errors in application logs
- [ ] Test actual update download (after releasing v0.1.1)

## Expected Behavior After Fix

### First Launch (v0.1.0)
- App checks for updates
- Finds `latest.yml` (no 404 error)
- Sees current version matches latest
- Shows "No updates available"

### After v0.1.1 Release
- App checks for updates
- Finds `latest.yml` with version 0.1.1
- Shows "Update available: v0.1.1"
- Downloads installer from Package Registry
- User can install and restart

## Notes

- The code changes are **backwards compatible**
- Works with existing CI/CD pipeline (no changes needed)
- Authentication is **optional** (graceful fallback)
- All TypeScript type checks pass
- No breaking changes to existing functionality

## Support

For issues or questions:
1. Check `/mnt/data/git/cline-gui/docs/AUTO_UPDATE_SETUP.md`
2. Review GitLab CI/CD pipeline logs
3. Check application logs for UpdateService messages
4. Verify Package Registry access in GitLab settings
