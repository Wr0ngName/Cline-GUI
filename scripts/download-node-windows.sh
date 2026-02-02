#!/bin/bash
# Download portable Node.js for Windows x64
# Used for bundling with the Electron app to run Claude CLI on Windows
# (Windows GUI apps can't capture stdout from ELECTRON_RUN_AS_NODE)

set -e

NODE_VERSION="20.18.1"
NODE_DIR="vendor/node-win-x64"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
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

# Extract only node.exe (we don't need npm, etc.)
echo "Extracting node.exe..."
unzip -j "$NODE_ZIP" "node-v${NODE_VERSION}-win-x64/node.exe" -d .

# Clean up
rm -f "$NODE_ZIP"

echo "Node.js downloaded to $NODE_DIR/node.exe"
ls -la node.exe
