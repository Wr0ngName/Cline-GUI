#!/bin/bash
# Download Git for Windows portable archive for bundling
# Claude Code CLI requires git-bash on Windows
#
# We bundle the tar.bz2 directly (no conversion) since Windows 10+ has native tar.
# The app extracts to resources/git-bash/ during Squirrel install using `tar -xjf`.
#
# Reads version and URL from resources/windows-deps.json (single source of truth)

set -e

# Get script directory to find config file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../resources/windows-deps.json"

# Check if jq is available, otherwise use python/node for JSON parsing
if command -v jq &> /dev/null; then
    GIT_VERSION=$(jq -r '.git.version' "$CONFIG_FILE")
    GIT_URL=$(jq -r '.git.url' "$CONFIG_FILE")
elif command -v python3 &> /dev/null; then
    GIT_VERSION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['git']['version'])")
    GIT_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['git']['url'])")
elif command -v node &> /dev/null; then
    GIT_VERSION=$(node -e "console.log(require('$CONFIG_FILE').git.version)")
    GIT_URL=$(node -e "console.log(require('$CONFIG_FILE').git.url)")
else
    echo "ERROR: jq, python3, or node required to parse JSON config"
    exit 1
fi

VENDOR_DIR="vendor/git-bash-win-x64"
GIT_ARCHIVE="$VENDOR_DIR/git-bash.tar.bz2"
VERSION_FILE="$VENDOR_DIR/version.txt"

# Create vendor directory
mkdir -p "$VENDOR_DIR"

# Check if already downloaded with correct version
if [ -f "$GIT_ARCHIVE" ] && [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(cat "$VERSION_FILE")
    if [ "$CURRENT_VERSION" = "$GIT_VERSION" ]; then
        echo "Git Bash archive v${GIT_VERSION} already exists at $GIT_ARCHIVE"
        ls -lh "$GIT_ARCHIVE"
        exit 0
    else
        echo "Version mismatch: have $CURRENT_VERSION, need $GIT_VERSION. Re-downloading..."
        rm -f "$GIT_ARCHIVE" "$VERSION_FILE"
    fi
fi

echo "Downloading Git for Windows v${GIT_VERSION}..."
curl -L -o "$GIT_ARCHIVE" "$GIT_URL"

# Note: Git releases don't provide official checksums
# Verification relies on HTTPS transport security

# Write version file
echo "$GIT_VERSION" > "$VERSION_FILE"

# Verify
if [ -f "$GIT_ARCHIVE" ]; then
    echo ""
    echo "Git Bash archive downloaded successfully!"
    echo "Location: $GIT_ARCHIVE"
    echo "Version: $GIT_VERSION"
    ls -lh "$GIT_ARCHIVE"
else
    echo "ERROR: Failed to download $GIT_ARCHIVE"
    exit 1
fi
