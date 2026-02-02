# Auto-Update Setup Guide

## Overview

The Cline GUI application uses `electron-updater` to automatically check for and install updates from the GitLab Package Registry.

## How It Works

### Update Flow

1. **Application starts** → `UpdateService` is initialized
2. **User checks for updates** → App queries GitLab Package Registry for `latest.yml`
3. **If update available** → App downloads the installer package
4. **User installs** → App installs update and restarts

### File Locations

The CI/CD pipeline publishes release files to GitLab Generic Package Registry:

```
https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/
├── latest.yml                          # Update metadata (required by electron-updater)
├── v0.1.0/
│   ├── cline-gui-0.1.0.deb            # Linux DEB package
│   ├── cline-gui-0.1.0.rpm            # Linux RPM package
│   ├── Cline-GUI-0.1.0-Setup.exe      # Windows installer
│   └── latest.yml                      # Version-specific copy
└── v0.1.1/
    └── ...
```

## Current Status

### Issue: HTTP 404 for latest.yml

**Error:**
```
Cannot find channel "latest.yml" update info: HttpError: 404
url: https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/latest.yml
```

**Root Causes:**

1. **PRIMARY: No Release Published Yet**
   - The repository has no git tags yet
   - CI/CD only publishes packages when a tag like `v1.0.0` is created
   - Therefore, `latest.yml` doesn't exist in the package registry

2. **SECONDARY: Potential Authentication Issue**
   - GitLab Package Registry may require authentication for private repos
   - Unauthenticated requests will get 401/404 errors

## Solutions

### Solution 1: Create a Release (REQUIRED)

To publish the first release:

```bash
# Ensure you're on the main branch with all changes committed
git checkout main
git pull

# Create and push a version tag (must match pattern: vX.Y.Z)
git tag v0.1.0
git push origin v0.1.0
```

This triggers the GitLab CI/CD pipeline which will:
1. Build the application for Linux and Windows
2. Upload installers to Package Registry
3. Generate and upload `latest.yml` for auto-updates

### Solution 2: Configure Package Registry Access

#### Option A: Make Package Registry Public (Easiest)

For open-source projects, make the package registry publicly accessible:

1. Go to GitLab project: Settings → General → Visibility
2. Set "Package registry" to "Everyone With Access" or "Public"

**This allows the app to check for updates without authentication.**

#### Option B: Use Authentication Token (For Private Repos)

For private repositories, the app needs authentication to access packages:

1. **Create a GitLab Deploy Token or Personal Access Token:**
   - Go to: Settings → Repository → Deploy Tokens
   - Name: `update-checker`
   - Scopes: Check `read_package_registry`
   - Save the token (shown only once!)

2. **Configure the token in the application:**

   **During Development:**
   ```bash
   export GITLAB_UPDATE_TOKEN=your_token_here
   npm start
   ```

   **For Distributed Apps:**
   - Set the token during installation (requires installer modification)
   - Or embed a read-only deploy token in the app (less secure)
   - Or configure via environment variable on user's system

3. **How it works:**
   - `UpdateService` checks for `GITLAB_UPDATE_TOKEN` environment variable
   - If found, adds `Private-Token` header to all update requests
   - This allows access to private package registry

## Configuration Details

### UpdateService.ts

Located at: `/mnt/data/git/cline-gui/src/main/services/UpdateService.ts`

Key configuration:
```typescript
// GitLab server
const GITLAB_HOST = 'https://dev.web.wr0ng.name';
const GITLAB_PROJECT_ID = 'wrongname%2Fcline-gui';

// Feed URL (where electron-updater looks for latest.yml)
autoUpdater.setFeedURL({
  provider: 'generic',
  url: `${GITLAB_HOST}/api/v4/projects/${GITLAB_PROJECT_ID}/packages/generic/releases`,
});

// Authentication (optional - for private registries)
const updateToken = process.env.GITLAB_UPDATE_TOKEN;
if (updateToken) {
  autoUpdater.requestHeaders = {
    'Private-Token': updateToken,
  };
}
```

### CI/CD Pipeline

Located at: `/.gitlab-ci.yml`

The `publish:packages` job:
- Runs only for tags matching `^v\d+\.\d+\.\d+$` (e.g., v1.0.0)
- Uploads Linux DEB, RPM, and Windows installer
- Generates `latest.yml` with version, path, and SHA-512 hash
- Uploads `latest.yml` to the root of `/releases/` directory

Key section (lines 250-268):
```yaml
# Create latest.yml for auto-updater
WIN_EXE=$(ls out/make/squirrel.windows/x64/*.exe | head -1)
WIN_FILENAME=$(basename "$WIN_EXE" | tr ' ' '-')
WIN_SHA512=$(sha512sum "$WIN_EXE" | cut -d' ' -f1)
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf 'version: %s\npath: %s/%s\nsha512: %s\nreleaseDate: %s\n' \
  "${VERSION}" "${VERSION}" "${WIN_FILENAME}" "${WIN_SHA512}" "${RELEASE_DATE}" > latest.yml

# Upload to root (where auto-updater looks)
curl --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
     --upload-file latest.yml \
     "${PACKAGE_REGISTRY_URL}/releases/latest.yml"
```

## Testing

### Test Update Check Locally

```bash
# Set token if needed (for private registry)
export GITLAB_UPDATE_TOKEN=your_token_here

# Start the app
npm start

# In the app UI:
# Settings → About → Check for Updates
```

### Verify latest.yml Exists

```bash
# Without authentication (public registry)
curl -I "https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/latest.yml"

# With authentication (private registry)
curl -H "Private-Token: YOUR_TOKEN" \
  "https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/latest.yml"
```

Expected response:
```
HTTP/2 200
content-type: text/yaml
```

If you get `HTTP/2 404`, the file doesn't exist (no release published yet).
If you get `HTTP/2 401`, authentication is required.

## Next Steps

1. **Create first release:**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **Choose access strategy:**
   - Public registry (no auth needed) → Set package registry to public
   - Private registry → Use deploy token with `read_package_registry` scope

3. **Test update checking:**
   - Install the built app
   - Check for updates in Settings
   - Verify no 404 errors in logs

## Troubleshooting

### "Cannot find channel 'latest.yml'" Error

**Cause:** No release has been published yet, or `latest.yml` is missing.

**Solution:**
1. Check if tags exist: `git tag -l`
2. If no tags, create one: `git tag v0.1.0 && git push origin v0.1.0`
3. Wait for CI/CD pipeline to complete
4. Verify file exists using curl (see Testing section above)

### HTTP 401/403 Authentication Errors

**Cause:** Package registry requires authentication.

**Solution:**
1. Create deploy token with `read_package_registry` scope
2. Set environment variable: `export GITLAB_UPDATE_TOKEN=your_token`
3. Or make package registry public (Settings → Visibility)

### Update Check Works, But Download Fails

**Cause:** Installer file paths may be incorrect in `latest.yml`.

**Solution:**
1. Download and inspect `latest.yml`:
   ```bash
   curl "https://dev.web.wr0ng.name/api/v4/projects/wrongname%2Fcline-gui/packages/generic/releases/latest.yml"
   ```
2. Verify the `path` field matches actual uploaded filename
3. Check CI/CD pipeline logs for upload errors

## References

- [electron-updater Documentation](https://www.electron.build/auto-update)
- [GitLab Generic Package Registry](https://docs.gitlab.com/ee/user/packages/generic_packages/)
- [GitLab Deploy Tokens](https://docs.gitlab.com/ee/user/project/deploy_tokens/)
