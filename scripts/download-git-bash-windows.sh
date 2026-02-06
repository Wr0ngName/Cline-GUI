#!/bin/bash
# Download Git for Windows and package as zip for bundling
# Claude Code CLI requires git-bash on Windows
#
# We bundle as a single zip file to avoid NuGet/Mono processing thousands
# of files during Squirrel.Windows build (extremely slow on Linux).
# The app extracts to userData/git-bash/ on first launch.

set -e

GIT_VERSION="2.53.0"
VENDOR_DIR="vendor/git-bash-win-x64"
GIT_ZIP="$VENDOR_DIR/git-bash.zip"
VERSION_FILE="$VENDOR_DIR/version.txt"
GIT_URL="https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.tar.bz2"
GIT_ARCHIVE="Git-${GIT_VERSION}-64-bit.tar.bz2"

# Create vendor directory
mkdir -p "$VENDOR_DIR"

# Check if already downloaded with correct version
if [ -f "$GIT_ZIP" ] && [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(cat "$VERSION_FILE")
    if [ "$CURRENT_VERSION" = "$GIT_VERSION" ]; then
        echo "Git Bash zip v${GIT_VERSION} already exists at $GIT_ZIP"
        ls -lh "$GIT_ZIP"
        exit 0
    else
        echo "Version mismatch: have $CURRENT_VERSION, need $GIT_VERSION. Re-downloading..."
        rm -f "$GIT_ZIP" "$VERSION_FILE"
    fi
fi

echo "Downloading Git for Windows v${GIT_VERSION}..."
curl -L -o "$GIT_ARCHIVE" "$GIT_URL"

echo "Extracting tar.bz2..."
TEMP_DIR=$(mktemp -d)
tar -xjf "$GIT_ARCHIVE" -C "$TEMP_DIR"

# Remove dev/ directory - contains POSIX special files (symlinks to /dev/fd/, etc.)
# Safety: only remove if TEMP_DIR is set and dev/ exists within it
if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR/dev" ]; then
    echo "Removing dev/ directory (POSIX special files)..."
    rm -rf "$TEMP_DIR/dev"
fi

echo "Creating zip archive..."
# Use absolute path since we're cd'ing into temp dir
GIT_ZIP_ABS="$(pwd)/$GIT_ZIP"
(cd "$TEMP_DIR" && zip -r -q "$GIT_ZIP_ABS" .)

# Write version file
echo "$GIT_VERSION" > "$VERSION_FILE"

# Clean up
rm -rf "$TEMP_DIR"
rm -f "$GIT_ARCHIVE"

# Verify
if [ -f "$GIT_ZIP" ]; then
    echo ""
    echo "Git Bash zip created successfully!"
    echo "Location: $GIT_ZIP"
    echo "Version: $GIT_VERSION"
    ls -lh "$GIT_ZIP"
else
    echo "ERROR: Failed to create $GIT_ZIP"
    exit 1
fi
