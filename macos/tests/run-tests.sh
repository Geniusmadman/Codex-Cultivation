#!/bin/zsh
set -euo pipefail
ROOT=${0:A:h:h}
node --check "$ROOT/scripts/cultivation-macos.mjs"
node --check "$ROOT/scripts/injector.mjs"
node --check "$ROOT/scripts/pet-manager.mjs"
node --check "$ROOT/assets/renderer-inject.js"
node "$ROOT/tests/controller.test.mjs"
node "$ROOT/tests/cc-switch-usage.test.mjs"
node "$ROOT/tests/image-metadata.test.mjs"
node "$ROOT/tests/injector-bootstrap.test.mjs"
node "$ROOT/tests/injector-one-shot.test.mjs"
node "$ROOT/tests/pet-manager.test.mjs"
node "$ROOT/tests/renderer-inject.test.mjs"
node "$ROOT/tests/spirit-pet-integration.test.mjs"
node "$ROOT/scripts/injector.mjs" --check-payload
/usr/bin/swiftc -typecheck "$ROOT/scripts/menubar-codex-cultivation.swift"
