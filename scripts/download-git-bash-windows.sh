#!/bin/bash
# Download Git for Windows and extract only files needed for bash
# Claude Code CLI requires git-bash on Windows
#
# Extracts only essential files to minimize bundle size and RAM usage during build

set -e

GIT_VERSION="2.53.0"
GIT_DIR="vendor/git-bash-win-x64"
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

echo "Extracting only essential bash files (minimal bundle)..."

# Extract only specific files needed for bash to run
# This dramatically reduces bundle size and build RAM requirements
# The files are extracted with their directory structure preserved
tar -xjf "$GIT_ARCHIVE" -C "$GIT_DIR" \
    usr/bin/bash.exe \
    usr/bin/sh.exe \
    usr/bin/env.exe \
    usr/bin/cat.exe \
    usr/bin/ls.exe \
    usr/bin/cp.exe \
    usr/bin/mv.exe \
    usr/bin/rm.exe \
    usr/bin/mkdir.exe \
    usr/bin/grep.exe \
    usr/bin/sed.exe \
    usr/bin/awk.exe \
    usr/bin/head.exe \
    usr/bin/tail.exe \
    usr/bin/wc.exe \
    usr/bin/sort.exe \
    usr/bin/uniq.exe \
    usr/bin/tr.exe \
    usr/bin/cut.exe \
    usr/bin/dirname.exe \
    usr/bin/basename.exe \
    usr/bin/pwd.exe \
    usr/bin/echo.exe \
    usr/bin/printf.exe \
    usr/bin/test.exe \
    usr/bin/expr.exe \
    usr/bin/true.exe \
    usr/bin/false.exe \
    usr/bin/sleep.exe \
    usr/bin/date.exe \
    usr/bin/touch.exe \
    usr/bin/chmod.exe \
    usr/bin/which.exe \
    usr/bin/readlink.exe \
    usr/bin/realpath.exe \
    usr/bin/tee.exe \
    usr/bin/xargs.exe \
    usr/bin/find.exe \
    usr/bin/diff.exe \
    usr/bin/cmp.exe \
    usr/bin/id.exe \
    usr/bin/whoami.exe \
    usr/bin/uname.exe \
    usr/bin/hostname.exe \
    usr/bin/stty.exe \
    usr/bin/tty.exe \
    usr/bin/kill.exe \
    usr/bin/ps.exe \
    usr/bin/curl.exe \
    usr/bin/wget.exe \
    usr/bin/ssh.exe \
    usr/bin/scp.exe \
    usr/bin/tar.exe \
    usr/bin/gzip.exe \
    usr/bin/gunzip.exe \
    usr/bin/bzip2.exe \
    usr/bin/bunzip2.exe \
    usr/bin/unzip.exe \
    usr/bin/msys-2.0.dll \
    usr/bin/msys-crypto-3.dll \
    usr/bin/msys-ssl-3.dll \
    usr/bin/msys-z.dll \
    usr/bin/msys-bz2-1.dll \
    usr/bin/msys-curl-4.dll \
    usr/bin/msys-nghttp2-14.dll \
    usr/bin/msys-idn2-0.dll \
    usr/bin/msys-psl-5.dll \
    usr/bin/msys-ssh2-1.dll \
    usr/bin/msys-unistring-5.dll \
    usr/bin/msys-zstd-1.dll \
    usr/bin/msys-iconv-2.dll \
    usr/bin/msys-intl-8.dll \
    usr/bin/msys-gcc_s-seh-1.dll \
    usr/bin/msys-pcre2-8-0.dll \
    usr/bin/msys-gmp-10.dll \
    usr/bin/msys-mpfr-6.dll \
    usr/bin/msys-readline8.dll \
    usr/bin/msys-ncursesw6.dll \
    etc/nsswitch.conf \
    etc/fstab \
    etc/profile \
    etc/bash.bashrc \
    2>/dev/null || echo "Note: Some optional files may not exist in archive"

# Clean up archive immediately to free disk space
rm -f "$GIT_ARCHIVE"

# Verify bash.exe exists
if [ -f "$GIT_DIR/usr/bin/bash.exe" ]; then
    echo ""
    echo "Minimal git-bash bundle created successfully!"
    echo "Bash location: $GIT_DIR/usr/bin/bash.exe"
    echo ""
    echo "Extracted files:"
    ls -la "$GIT_DIR/usr/bin/"
    echo ""
    echo "Bundle size:"
    du -sh "$GIT_DIR"
else
    echo "ERROR: bash.exe not found after extraction!"
    exit 1
fi
