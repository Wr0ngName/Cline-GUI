/**
 * Download dependencies for Windows online installer
 *
 * This module downloads Node.js and Git during Squirrel installation
 * for online bundles (smaller initial download, longer install time).
 *
 * CRITICAL: This file must ONLY use Node built-ins, no npm dependencies.
 * It runs during Squirrel events when npm packages may not be available.
 *
 * Versions and URLs are read from resources/windows-deps.json (single source of truth)
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import { extractNodeExe } from './archiveExtractor';
import { debugLog } from './debugLog';
import { getResourcesPathForSquirrel, SquirrelPaths } from './resourcePaths';

// Type for windows-deps.json structure
interface WindowsDepsConfig {
  node: {
    version: string;
    url: string;
    sha256: string;
  };
  git: {
    version: string;
    url: string;
    sha256: string | null;
  };
}

/**
 * Load Windows dependency configuration from JSON file
 * This is the single source of truth for versions and checksums
 */
function loadDepsConfig(): WindowsDepsConfig {
  const resourcesPath = getResourcesPathForSquirrel();
  const configPath = path.join(resourcesPath, 'windows-deps.json');

  // Fallback to relative path during development
  const fallbackPath = path.join(__dirname, '..', '..', '..', 'resources', 'windows-deps.json');

  let configFile = configPath;
  if (!fs.existsSync(configFile)) {
    configFile = fallbackPath;
  }

  if (!fs.existsSync(configFile)) {
    throw new Error(`Windows deps config not found at ${configPath} or ${fallbackPath}`);
  }

  const content = fs.readFileSync(configFile, 'utf8');
  return JSON.parse(content) as WindowsDepsConfig;
}

/**
 * Verify SHA256 checksum of a file
 *
 * @param filePath - Path to file to verify
 * @param expectedHash - Expected SHA256 hash (lowercase hex)
 * @throws Error if checksum doesn't match
 */
function verifyChecksum(filePath: string, expectedHash: string): void {
  debugLog(`Verifying SHA256 checksum for ${filePath}...`);

  const fileBuffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  const actualHash = hash.digest('hex');

  if (actualHash !== expectedHash) {
    throw new Error(
      `Checksum mismatch for ${path.basename(filePath)}!\n` +
      `  Expected: ${expectedHash}\n` +
      `  Actual:   ${actualHash}`
    );
  }

  debugLog('Checksum verified OK');
}

/**
 * Download a file from URL using curl.exe (available on Windows 10+)
 * Includes retry logic with exponential backoff for transient failures
 *
 * @param url - URL to download from
 * @param destPath - Destination file path
 * @param maxRetries - Maximum number of retry attempts
 * @throws Error if download fails after all retries
 */
function downloadFile(url: string, destPath: string, maxRetries = 3): void {
  debugLog(`Downloading: ${url}`);
  debugLog(`  -> ${destPath}`);

  // Ensure parent directory exists
  const parentDir = path.dirname(destPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // Use curl.exe which is available on Windows 10+ by default
  // -L: follow redirects
  // -o: output file
  // --progress-bar: show progress (helpful for large downloads)
  // --fail: return error code on HTTP errors
  const command = `curl.exe -L --fail --progress-bar -o "${destPath}" "${url}"`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(command, {
        timeout: 600000, // 10 minute timeout for large files
        windowsHide: true,
        stdio: 'pipe', // Capture output
      });
      debugLog(`Download complete: ${destPath}`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Clean up partial download
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      if (attempt < maxRetries) {
        const isTimeout = lastError.message.includes('timed out') || lastError.message.includes('ETIMEDOUT');
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s

        debugLog(
          `Download attempt ${attempt}/${maxRetries} failed` +
          (isTimeout ? ' (timeout)' : '') +
          `. Retrying in ${backoffMs / 1000}s...`
        );

        // Sleep using PowerShell (synchronous)
        execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${backoffMs}"`, {
          windowsHide: true,
        });
      }
    }
  }

  const isTimeout = lastError?.message.includes('timed out') || lastError?.message.includes('ETIMEDOUT');
  if (isTimeout) {
    throw new Error(
      `Download timed out after ${maxRetries} attempts. Please check your internet connection.\n` +
      `URL: ${url}`
    );
  }

  throw new Error(`Failed to download after ${maxRetries} attempts: ${url}\n${lastError?.message || 'Unknown error'}`);
}

/**
 * Download and extract Node.js for Windows
 * Downloads the zip, verifies checksum, extracts node.exe, removes the zip
 */
function downloadAndExtractNode(config: WindowsDepsConfig): void {
  const resourcesPath = getResourcesPathForSquirrel();
  const nodeExeDest = path.join(resourcesPath, 'node.exe');

  // Skip if node.exe already exists
  if (fs.existsSync(nodeExeDest)) {
    debugLog('Node.js already exists, skipping download');
    return;
  }

  const nodeZip = path.join(resourcesPath, '_node_download.zip');

  try {
    debugLog(`Downloading Node.js v${config.node.version}...`);
    downloadFile(config.node.url, nodeZip);

    // Verify checksum
    verifyChecksum(nodeZip, config.node.sha256);

    debugLog('Extracting node.exe...');
    extractNodeExe(nodeZip, resourcesPath, config.node.version);

    debugLog('Node.js download and extraction complete');
  } finally {
    // Clean up downloaded zip
    if (fs.existsSync(nodeZip)) {
      try {
        fs.unlinkSync(nodeZip);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Download Git for Windows tar.bz2 archive
 * Only downloads the archive - extraction is handled by gitBashExtractor
 */
function downloadGitArchive(config: WindowsDepsConfig): void {
  const gitArchive = SquirrelPaths.getGitBashArchive();
  const versionFile = SquirrelPaths.getBundledVersionFile();

  // Skip if archive already exists with correct version
  if (fs.existsSync(gitArchive) && fs.existsSync(versionFile)) {
    try {
      const existingVersion = fs.readFileSync(versionFile, 'utf8').trim();
      if (existingVersion === config.git.version) {
        debugLog('Git archive already exists with correct version, skipping download');
        return;
      }
    } catch {
      // Continue with download if version check fails
    }
  }

  try {
    debugLog(`Downloading Git for Windows v${config.git.version}...`);
    downloadFile(config.git.url, gitArchive);

    // Note: Git releases don't provide official checksums
    // Verification relies on HTTPS transport security
    if (config.git.sha256) {
      verifyChecksum(gitArchive, config.git.sha256);
    } else {
      debugLog('No checksum available for Git, relying on HTTPS security');
    }

    // Write version file
    fs.writeFileSync(versionFile, config.git.version);

    debugLog('Git download complete');
  } catch (error) {
    // Clean up partial download
    if (fs.existsSync(gitArchive)) {
      try {
        fs.unlinkSync(gitArchive);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Download all dependencies for online installer
 * Called during Squirrel install/update events
 */
export function downloadDependenciesForOnlineInstall(): void {
  if (process.platform !== 'win32') {
    return;
  }

  debugLog('=== Online installer: downloading dependencies ===');

  try {
    // Load configuration
    const config = loadDepsConfig();
    debugLog(`Node.js version: ${config.node.version}`);
    debugLog(`Git version: ${config.git.version}`);

    // Download Node.js (downloads + verifies checksum + extracts node.exe)
    downloadAndExtractNode(config);

    // Download Git archive (extraction handled separately by gitBashExtractor)
    downloadGitArchive(config);

    debugLog('=== All dependencies downloaded successfully ===');
  } catch (error) {
    // Log but don't throw - we don't want to break the install process
    // The app will show appropriate errors when it tries to use missing dependencies
    debugLog(`ERROR downloading dependencies: ${error}`);
  }
}
