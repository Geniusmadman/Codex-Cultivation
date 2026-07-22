---
name: codex-cultivation-macos
description: Install, apply, verify, customize, or restore Codex Cultivation on macOS without modifying ChatGPT.app, app.asar, signatures, accounts, or task data.
---

# Codex Cultivation for macOS

Use the scripts in this directory to apply the reversible cultivation workspace to the official Codex desktop app at `/Applications/ChatGPT.app`.

## Workflow

1. Run `scripts/install-codex-cultivation.command` to validate prerequisites, seed the theme store, and install the managed Silver Moon Pet v2 family. Pass `--no-spirit-pet` to disable pet management without deleting an existing pet.
2. Run `scripts/start-codex-cultivation.command` and approve a restart if Codex is already open.
3. Run `scripts/verify-codex-cultivation.command --screenshot <absolute-path>`.
4. Use `scripts/menubar-codex-cultivation.command` for pause, resume, image selection, verification, Silver Moon realm sync, confirmed restart when a pet reload is pending, and restore.
5. Run `node scripts/cultivation-macos.mjs sync-pet` when a manual Silver Moon realm sync is needed.
6. Run `scripts/restore-codex-cultivation.command` to close the saved CDP session, remove the managed Silver Moon files, and reopen the official app normally. Pass `--keep-spirit-pet` to retain Silver Moon.

## Guardrails

- Validate bundle ID `com.openai.codex`, Team ID `2DC432GLL2`, the official `/Applications/ChatGPT.app` path, and the app signature on every operation.
- Keep CDP on loopback and require the listening PID, Browser ID, target IDs, and `app://` renderer shape to match.
- Never modify the official app bundle, signature, account, tasks, plugins, or Codex data directories.
- Stop only an injector whose PID, start time, Node path, script path, port, and Browser ID match saved state.
- Store local state under `~/Library/Application Support/CodexCultivation` and reject symbolic links in managed paths.
- Install Silver Moon only under `${CODEX_HOME:-~/.codex}/pets/yinyue`, refuse to overwrite an unmanaged `yinyue` directory, and never scan, rewrite, or remove other pets.
- Reload only an `app://` auxiliary target containing `data-avatar-id="yinyue"`; always exclude the main Codex shell and verify the versioned spritesheet URL after reload.
- Never restart Codex for a pending pet evolution without explicit user confirmation.
