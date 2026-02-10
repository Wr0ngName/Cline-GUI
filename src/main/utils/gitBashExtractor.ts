/**
 * Git Bash extraction utility for Windows Squirrel install/update events.
 *
 * CRITICAL: This file must ONLY use Node built-ins, no npm dependencies.
 * It runs during Squirrel events when npm packages may not be available.
 *
 * The git-bash bundle is shipped as a zip file to avoid slow NuGet/Mono
 * processing during Squirrel.Windows builds. We extract it during install.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

import { debugLog } from './debugLog';
import { SquirrelPaths } from './resourcePaths';

/**
 * Extract git-bash.zip to resources/git-bash/ during Squirrel install/update.
 * This runs synchronously before electron-squirrel-startup exits.
 */
export function extractGitBashOnInstall(): void {
  if (process.platform !== 'win32') {
    return;
  }

  try {
    // Use SquirrelPaths which handles app not being initialized yet
    const gitBashZip = SquirrelPaths.getGitBashZip();
    const bundledVersionFile = SquirrelPaths.getBundledVersionFile();
    const extractedDir = SquirrelPaths.getGitBashDir();
    const extractedVersionFile = SquirrelPaths.getExtractedVersionFile();
    const bashExePath = SquirrelPaths.getBashExe();

    debugLog(`Git Bash extraction: checking ${gitBashZip}`);

    // Check if zip exists
    if (!fs.existsSync(gitBashZip)) {
      debugLog('Git Bash zip not found, skipping extraction');
      return;
    }

    // Check if already extracted with correct version
    if (fs.existsSync(bashExePath) && fs.existsSync(extractedVersionFile)) {
      try {
        const bundledVersion = fs.existsSync(bundledVersionFile)
          ? fs.readFileSync(bundledVersionFile, 'utf8').trim()
          : '';
        const extractedVersion = fs.readFileSync(extractedVersionFile, 'utf8').trim();

        if (bundledVersion === extractedVersion) {
          debugLog(`Git Bash already extracted with version ${extractedVersion}`);
          return;
        }
        debugLog(`Git Bash version mismatch: bundled=${bundledVersion}, extracted=${extractedVersion}`);
      } catch (err) {
        debugLog(`Error reading version files: ${err}`);
      }
    }

    debugLog(`Extracting Git Bash to ${extractedDir}...`);

    // Remove old extracted directory if exists
    if (fs.existsSync(extractedDir)) {
      fs.rmSync(extractedDir, { recursive: true, force: true });
    }
    fs.mkdirSync(extractedDir, { recursive: true });

    // Use PowerShell to extract zip (available on all Windows versions)
    // Escape single quotes in paths for PowerShell
    const escapedZip = gitBashZip.replace(/'/g, "''");
    const escapedDir = extractedDir.replace(/'/g, "''");
    const psCommand = `Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDir}' -Force`;

    execSync(`powershell -NoProfile -Command "${psCommand}"`, {
      timeout: 120000, // 2 minute timeout for large zip
      windowsHide: true,
    });

    // Write version file to track what we extracted
    if (fs.existsSync(bundledVersionFile)) {
      const version = fs.readFileSync(bundledVersionFile, 'utf8').trim();
      fs.writeFileSync(extractedVersionFile, version);
      debugLog(`Git Bash extracted successfully, version ${version}`);
    } else {
      debugLog('Git Bash extracted successfully (no version file)');
    }

    // Verify extraction succeeded
    if (fs.existsSync(bashExePath)) {
      debugLog(`Verified: ${bashExePath} exists`);
    } else {
      debugLog(`WARNING: ${bashExePath} not found after extraction`);
    }
  } catch (err) {
    // Don't throw - we don't want to break the install process
    debugLog(`Git Bash extraction failed: ${err}`);
  }
}
