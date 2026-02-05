#!/bin/bash
# Download portable Git Bash for Windows x64
# Used for bundling with the Electron app to run Claude CLI on Windows
# (Claude Code CLI requires git-bash on Windows)
#
# NOTE: We use PortableGit (not MinGit) because MinGit doesn't include bash.exe

set -e

GIT_VERSION="2.53.0"
GIT_DIR="vendor/git-bash-win-x64"
# PortableGit includes bash.exe, MinGit does NOT
GIT_URL="https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/PortableGit-${GIT_VERSION}-64-bit.7z.exe"
GIT_ARCHIVE="PortableGit-${GIT_VERSION}-64-bit.7z.exe"

# Create vendor directory
mkdir -p "$GIT_DIR"

# Check if already downloaded
if [ -f "$GIT_DIR/usr/bin/bash.exe" ]; then
    echo "Git Bash already exists at $GIT_DIR/usr/bin/bash.exe"
    exit 0
fi

echo "Downloading PortableGit v${GIT_VERSION} for Windows x64..."

# Download
curl -L -o "$GIT_ARCHIVE" "$GIT_URL"

# Extract - PortableGit is a self-extracting 7z archive
echo "Extracting PortableGit..."
# Use 7z to extract (the .exe is actually a 7z self-extractor)
if command -v 7z &> /dev/null; then
    7z x -o"$GIT_DIR" "$GIT_ARCHIVE" -y
elif command -v 7za &> /dev/null; then
    7za x -o"$GIT_DIR" "$GIT_ARCHIVE" -y
elif command -v p7zip &> /dev/null; then
    p7zip -d "$GIT_ARCHIVE" -o"$GIT_DIR"
else
    echo "ERROR: 7z/7za/p7zip not found. Install with: apt install p7zip-full"
    rm -f "$GIT_ARCHIVE"
    exit 1
fi

# Clean up
rm -f "$GIT_ARCHIVE"

# Verify bash.exe exists
if [ -f "$GIT_DIR/usr/bin/bash.exe" ]; then
    echo "Git Bash downloaded successfully to $GIT_DIR/"
    echo "Bash location: $GIT_DIR/usr/bin/bash.exe"
    ls -la "$GIT_DIR/usr/bin/bash.exe"
else
    echo "ERROR: bash.exe not found after extraction!"
    echo "Contents of $GIT_DIR/usr/bin/:"
    ls -la "$GIT_DIR/usr/bin/" | head -20
    exit 1
fi
