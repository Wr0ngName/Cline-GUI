#!/bin/bash
# Download Git for Windows (full) for bundling with the Electron app
# Claude Code CLI requires git-bash on Windows
#
# Uses tar.bz2 format which can be extracted with standard Unix tools

set -e

GIT_VERSION="2.53.0"
GIT_DIR="vendor/git-bash-win-x64"
# Full Git for Windows includes bash.exe (MinGit does NOT)
GIT_URL="https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.tar.bz2"
GIT_ARCHIVE="Git-${GIT_VERSION}-64-bit.tar.bz2"

# Create vendor directory
mkdir -p "$GIT_DIR"

# Check if already downloaded
if [ -f "$GIT_DIR/usr/bin/bash.exe" ]; then
    echo "Git Bash already exists at $GIT_DIR/usr/bin/bash.exe"
    exit 0
fi

echo "Downloading Git for Windows v${GIT_VERSION}..."

# Download
curl -L -o "$GIT_ARCHIVE" "$GIT_URL"

# Extract using tar (available on all Unix systems)
echo "Extracting Git for Windows..."
tar -xjf "$GIT_ARCHIVE" -C "$GIT_DIR"

# Remove dev/ directory - contains POSIX special files (symlinks to /dev/fd/, /dev/stdin etc)
# that Squirrel.Windows/NuGet cannot package. MSYS2 recreates these at runtime if needed.
echo "Removing dev/ directory (POSIX special files incompatible with Squirrel.Windows)..."
rm -rf "$GIT_DIR/dev"

# Clean up archive
rm -f "$GIT_ARCHIVE"

# Verify bash.exe exists
if [ -f "$GIT_DIR/usr/bin/bash.exe" ]; then
    echo "Git for Windows downloaded successfully to $GIT_DIR/"
    echo "Bash location: $GIT_DIR/usr/bin/bash.exe"
    ls -la "$GIT_DIR/usr/bin/bash.exe"
    echo ""
    echo "Bundle size:"
    du -sh "$GIT_DIR"
else
    echo "ERROR: bash.exe not found after extraction!"
    echo "Contents of $GIT_DIR/usr/bin/:"
    ls -la "$GIT_DIR/usr/bin/" 2>/dev/null | head -20 || echo "Directory doesn't exist"
    exit 1
fi
