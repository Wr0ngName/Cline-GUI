# Windows Online Installer Implementation Plan

## Current State Analysis (Facts from Codebase)

### Current Build Process
1. **CI Pipeline** (`.gitlab-ci.yml:128-139`):
   - Downloads Node.js via `./scripts/download-node-windows.sh`
   - Downloads Git via `./scripts/download-git-bash-windows.sh`
   - Both placed in `vendor/` directory before build

2. **Node.js Download** (`scripts/download-node-windows.sh`):
   - Source: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`
   - Downloads `.zip`, extracts only `node.exe` to `vendor/node-win-x64/node.exe`
   - Version: 20.18.1

3. **Git Bash Download** (`scripts/download-git-bash-windows.sh`):
   - Source: `https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.tar.bz2`
   - **PROBLEM IDENTIFIED**: Downloads `.tar.bz2` → extracts → re-zips to `.zip`
   - Final output: `vendor/git-bash-win-x64/git-bash.zip`
   - Version: 2.53.0

4. **Bundle Inclusion** (`forge.config.ts:95-99`):
   ```typescript
   extraResource: [
     './resources/app-update.yml',
     ...(isWindowsBuild && hasNodeExe ? [nodeExePath] : []),
     ...(isWindowsBuild && hasGitBashZip ? [gitBashZip, gitBashVersionFile] : []),
   ],
   ```

5. **Installation Extraction** (`src/main/index.ts:24-30`):
   - On `--squirrel-install` or `--squirrel-updated` events
   - Calls `extractGitBashOnInstall()` which extracts `git-bash.zip` using PowerShell

6. **Current Extraction Method** (`src/main/utils/gitBashExtractor.ts:68-77`):
   ```typescript
   // Uses PowerShell Expand-Archive for zip
   const psCommand = `Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDir}' -Force`;
   execSync(`powershell -NoProfile -Command "${psCommand}"`);
   ```

### Auto-Update Mechanism
- Uses `electron-updater` with GitLab Package Registry
- Downloads full installer `.exe` from `${PACKAGE_REGISTRY_URL}/releases/${VERSION}/`
- No mechanism to distinguish "online" vs "offline" bundle types

---

## Implementation Plan

### Phase 1: DRY Refactoring - Use tar.bz2 Directly (Consistent Archive Format)

**Rationale**: Windows 10+ has native `tar` command. No need to convert tar.bz2 → zip.

#### 1.1 Modify `scripts/download-git-bash-windows.sh`
- **Before**: Download tar.bz2, extract to temp, remove dev/, zip, cleanup
- **After**: Download tar.bz2, keep as-is, just store version
- Output: `vendor/git-bash-win-x64/git-bash.tar.bz2` + `version.txt`

```bash
# New script - just download, no conversion
GIT_URL="https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.tar.bz2"
GIT_ARCHIVE="$VENDOR_DIR/git-bash.tar.bz2"
curl -L -o "$GIT_ARCHIVE" "$GIT_URL"
echo "$GIT_VERSION" > "$VERSION_FILE"
```

#### 1.2 Update `forge.config.ts`
- Change `gitBashZip` path to `gitBashTarBz2`
- Update `extraResource` to include `.tar.bz2` instead of `.zip`

#### 1.3 Create Common Extraction Utility `src/main/utils/archiveExtractor.ts`
- Single function that handles tar.bz2 extraction on Windows using native `tar`
- Used by both online and offline installers
- Remove `/dev` directory after extraction (contains POSIX special files)

```typescript
export function extractTarBz2(archivePath: string, destDir: string): void {
  // Windows native tar command (available since Windows 10 1803)
  // tar -xjf archive.tar.bz2 -C destination
  execSync(`tar -xjf "${archivePath}" -C "${destDir}"`, { timeout: 120000, windowsHide: true });

  // Remove dev/ directory if present (POSIX special files)
  const devDir = path.join(destDir, 'dev');
  if (fs.existsSync(devDir)) {
    fs.rmSync(devDir, { recursive: true, force: true });
  }
}
```

#### 1.4 Update `src/main/utils/gitBashExtractor.ts`
- Replace PowerShell `Expand-Archive` with the new common `extractTarBz2` function
- Update paths to look for `.tar.bz2` instead of `.zip`

#### 1.5 Update `src/main/utils/resourcePaths.ts`
- `WindowsPaths.getGitBashArchive()` → points to `.tar.bz2`
- `SquirrelPaths.getGitBashArchive()` → points to `.tar.bz2`

---

### Phase 2: Online Installer Support

**Concept**:
- **Offline bundle**: Full bundle with Node.js + Git (current)
- **Online bundle**: No Node.js, no Git - downloads during Squirrel install

#### 2.1 Add Bundle Type Marker File
Create `resources/bundle-type.txt` during build:
- **Offline**: contains `offline`
- **Online**: contains `online`

Include in `extraResource` for both bundle types.

#### 2.2 Create Download Utility `src/main/utils/downloadDependencies.ts`
This runs during Squirrel install for online bundles.

```typescript
const NODE_VERSION = '20.18.1';
const GIT_VERSION = '2.53.0';
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const GIT_URL = `https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.tar.bz2`;

export async function downloadAndExtractDependencies(): Promise<void> {
  const resourcesPath = getResourcesPathForSquirrel();

  // Download Node.js zip, extract node.exe
  const nodeZip = path.join(resourcesPath, 'node.zip');
  downloadFile(NODE_URL, nodeZip);
  extractNodeExe(nodeZip, resourcesPath); // Extract just node.exe
  fs.unlinkSync(nodeZip);

  // Download Git tar.bz2
  const gitArchive = path.join(resourcesPath, 'git-bash.tar.bz2');
  downloadFile(GIT_URL, gitArchive);
  // Git extraction happens in gitBashExtractor.ts (shared with offline)
}
```

**Download implementation**: Use PowerShell's `Invoke-WebRequest` or `curl.exe` (available on Windows 10+)

```typescript
function downloadFile(url: string, dest: string): void {
  // Use curl.exe (available on Windows 10+)
  execSync(`curl.exe -L -o "${dest}" "${url}"`, { timeout: 600000, windowsHide: true });
}
```

#### 2.3 Modify `src/main/index.ts` Squirrel Handler
```typescript
if (squirrelEvent === '--squirrel-install' || squirrelEvent === '--squirrel-updated') {
  const bundleType = getBundleType(); // reads bundle-type.txt

  if (bundleType === 'online') {
    debugLog('Online bundle: downloading Node.js and Git...');
    await downloadAndExtractDependencies();
  }

  debugLog(`Extracting git-bash on ${squirrelEvent}...`);
  extractGitBashOnInstall(); // Uses common tar.bz2 extraction
}
```

#### 2.4 Update `forge.config.ts` for Conditional Bundling
```typescript
// Environment variable to control bundle type
const isOnlineBuild = process.env.CLINE_ONLINE_BUILD === 'true';

// Only include Node.exe and Git archive for offline builds
extraResource: [
  './resources/app-update.yml',
  './resources/bundle-type.txt', // Always included
  ...(isWindowsBuild && !isOnlineBuild && hasNodeExe ? [nodeExePath] : []),
  ...(isWindowsBuild && !isOnlineBuild && hasGitBashArchive ? [gitBashTarBz2, gitBashVersionFile] : []),
],
```

---

### Phase 3: CI/CD Pipeline Updates

#### 3.1 Modify `.gitlab-ci.yml` - Add Online Build Job

```yaml
# Windows OFFLINE build (full bundle) - for releases
.build_windows_offline:
  extends: .build_windows_base
  script:
    - |
      docker run --rm \
        -v "$CI_PROJECT_DIR:/app" \
        -w /app \
        -e CLINE_ONLINE_BUILD=false \
        electronuserland/builder:wine-mono \
        bash -c "... && ./scripts/download-node-windows.sh && ./scripts/download-git-bash-windows.sh && npm run make -- --platform=win32"

# Windows ONLINE build (downloads at install) - for initial download
.build_windows_online:
  extends: .build_windows_base
  script:
    - |
      docker run --rm \
        -v "$CI_PROJECT_DIR:/app" \
        -w /app \
        -e CLINE_ONLINE_BUILD=true \
        electronuserland/builder:wine-mono \
        bash -c "... && npm run make -- --platform=win32"

# Create bundle-type.txt before build
# Handled in forge.config.ts hooks
```

#### 3.2 Publish Both Variants
- **Auto-update**: Always downloads offline (full) bundle → `Cline-GUI-${VERSION}-Setup.exe`
- **Initial download**: Provide both options
  - `Cline-GUI-${VERSION}-Setup-online.exe` (smaller, ~60MB less)
  - `Cline-GUI-${VERSION}-Setup.exe` (full, offline)

---

### Phase 4: File Structure Changes

#### New Files
- `src/main/utils/archiveExtractor.ts` - Common tar.bz2 extraction
- `src/main/utils/downloadDependencies.ts` - Online installer download logic
- `resources/bundle-type.txt` - Generated at build time

#### Modified Files
- `scripts/download-git-bash-windows.sh` - Output tar.bz2 directly (no zip conversion)
- `scripts/download-node-windows.sh` - No changes needed (already outputs node.exe)
- `forge.config.ts` - Conditional bundling based on `CLINE_ONLINE_BUILD`
- `src/main/index.ts` - Call download for online bundles during Squirrel install
- `src/main/utils/gitBashExtractor.ts` - Use common extraction utility
- `src/main/utils/resourcePaths.ts` - Update paths for tar.bz2
- `.gitlab-ci.yml` - Add online build jobs, publish both variants

---

## Summary of Changes

| Component | Current | After |
|-----------|---------|-------|
| Git archive format | .tar.bz2 → .zip conversion | .tar.bz2 directly |
| Extraction method | PowerShell Expand-Archive | Native Windows `tar -xjf` |
| Bundle types | Single (offline) | Two: offline + online |
| Online install | N/A | Downloads Node.js + Git during Squirrel install |
| Auto-update | Downloads full bundle | Still downloads full (offline) bundle |

## Version/URL Constants
All download URLs and versions are centralized:
- Node.js: `v20.18.1` from `nodejs.org`
- Git: `v2.53.0` from `github.com/git-for-windows`

These constants should be defined ONCE in a shared location for DRY compliance.

---

## Implementation Order

1. **Phase 1.1-1.5**: DRY refactoring (tar.bz2 direct usage) - foundation
2. **Phase 2.1-2.3**: Online installer logic
3. **Phase 2.4**: forge.config.ts conditional bundling
4. **Phase 3.1-3.2**: CI/CD pipeline updates
5. Testing: Build both variants, test installation scenarios

## Risk Mitigation
- Windows `tar` command is available since Windows 10 version 1803 (April 2018)
- Fallback: If `tar` fails, could use PowerShell with `tar` module or keep zip as backup
- Online download timeout: 10 minute timeout for large files (~150MB total)
