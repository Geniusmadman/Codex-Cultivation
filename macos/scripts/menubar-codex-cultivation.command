#!/bin/zsh
set -euo pipefail
SCRIPT_DIR=${0:A:h}
exec /usr/bin/swift "$SCRIPT_DIR/menubar-codex-cultivation.swift" "$SCRIPT_DIR/cultivation-macos.mjs"
