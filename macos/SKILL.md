---
name: codex-cultivation-macos
description: Install, apply, verify, customize, or restore Codex Cultivation on macOS without modifying ChatGPT.app, app.asar, signatures, accounts, or task data.
---

# Codex Cultivation for macOS

Use the scripts in this directory to apply the reversible cultivation workspace to the official Codex desktop app at `/Applications/ChatGPT.app`.

## Workflow

1. Run `scripts/install-codex-cultivation.command` to validate prerequisites and seed the theme store.
2. Run `scripts/start-codex-cultivation.command` and approve a restart if Codex is already open.
3. Run `scripts/verify-codex-cultivation.command --screenshot <absolute-path>`.
4. Use `scripts/menubar-codex-cultivation.command` for pause, resume, image selection, verification, and restore.
5. Run `scripts/restore-codex-cultivation.command` to close the saved CDP session and reopen the official app normally.

## Guardrails

- Validate bundle ID `com.openai.codex`, Team ID `2DC432GLL2`, the official `/Applications/ChatGPT.app` path, and the app signature on every operation.
- Keep CDP on loopback and require the listening PID, Browser ID, target IDs, and `app://` renderer shape to match.
- Never modify the official app bundle, signature, account, tasks, plugins, or Codex data directories.
- Stop only an injector whose PID, start time, Node path, script path, port, and Browser ID match saved state.
- Store local state under `~/Library/Application Support/CodexCultivation` and reject symbolic links in managed paths.
