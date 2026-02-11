#!/bin/bash
# Download portable Node.js for Windows x64
# Used for bundling with the Electron app to run Claude CLI on Windows
# (Windows GUI apps can't capture stdout from ELECTRON_RUN_AS_NODE)
#
# Reads version and URL from resources/windows-deps.json (single source of truth)

set -e

# Get script directory to find config file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../resources/windows-deps.json"

# Check if jq is available, otherwise use python/node for JSON parsing
if command -v jq &> /dev/null; then
    NODE_VERSION=$(jq -r '.node.version' "$CONFIG_FILE")
    NODE_URL=$(jq -r '.node.url' "$CONFIG_FILE")
    NODE_SHA256=$(jq -r '.node.sha256' "$CONFIG_FILE")
elif command -v python3 &> /dev/null; then
    NODE_VERSION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['node']['version'])")
    NODE_URL=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['node']['url'])")
    NODE_SHA256=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['node']['sha256'])")
elif command -v node &> /dev/null; then
    NODE_VERSION=$(node -e "console.log(require('$CONFIG_FILE').node.version)")
    NODE_URL=$(node -e "console.log(require('$CONFIG_FILE').node.url)")
    NODE_SHA256=$(node -e "console.log(require('$CONFIG_FILE').node.sha256)")
else
    echo "ERROR: jq, python3, or node required to parse JSON config"
    exit 1
fi

NODE_DIR="vendor/node-win-x64"
NODE_ZIP="node-v${NODE_VERSION}-win-x64.zip"

# Create vendor directory
mkdir -p "$NODE_DIR"

# Check if already downloaded
if [ -f "$NODE_DIR/node.exe" ]; then
    echo "Node.js already exists at $NODE_DIR/node.exe"
    exit 0
fi

echo "Downloading Node.js v${NODE_VERSION} for Windows x64..."
cd "$NODE_DIR"

# Download
curl -LO "$NODE_URL"

# Verify checksum
echo "Verifying SHA256 checksum..."
ACTUAL_SHA256=$(sha256sum "$NODE_ZIP" | cut -d' ' -f1)
if [ "$ACTUAL_SHA256" != "$NODE_SHA256" ]; then
    echo "ERROR: Checksum mismatch!"
    echo "  Expected: $NODE_SHA256"
    echo "  Actual:   $ACTUAL_SHA256"
    rm -f "$NODE_ZIP"
    exit 1
fi
echo "Checksum verified OK"

# Extract only node.exe (we don't need npm, etc.)
echo "Extracting node.exe..."
unzip -j "$NODE_ZIP" "node-v${NODE_VERSION}-win-x64/node.exe" -d .

# Clean up
rm -f "$NODE_ZIP"

echo "Node.js downloaded to $NODE_DIR/node.exe"
ls -la node.exe
