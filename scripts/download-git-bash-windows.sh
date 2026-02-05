#!/bin/bash
# Download portable Git Bash for Windows x64
# Used for bundling with the Electron app to run Claude CLI on Windows
# (Claude Code CLI requires git-bash on Windows)

set -e

GIT_VERSION="2.53.0"
GIT_DIR="vendor/git-bash-win-x64"
# Use the MinGit version which is smaller (~45MB vs ~300MB extracted)
GIT_URL="https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/MinGit-${GIT_VERSION}-64-bit.zip"
GIT_ZIP="MinGit-${GIT_VERSION}-64-bit.zip"

# Create vendor directory
mkdir -p "$GIT_DIR"

# Check if already downloaded
if [ -f "$GIT_DIR/usr/bin/bash.exe" ]; then
    echo "Git Bash already exists at $GIT_DIR/usr/bin/bash.exe"
    exit 0
fi

echo "Downloading MinGit v${GIT_VERSION} for Windows x64..."
cd "$GIT_DIR"

# Download
curl -L -o "$GIT_ZIP" "$GIT_URL"

# Extract - MinGit already contains only essential files
echo "Extracting MinGit..."
unzip -o "$GIT_ZIP"

# Clean up
rm -f "$GIT_ZIP"

echo "Git Bash downloaded to $GIT_DIR/"
echo "Bash location: $GIT_DIR/usr/bin/bash.exe"
ls -la usr/bin/bash.exe
