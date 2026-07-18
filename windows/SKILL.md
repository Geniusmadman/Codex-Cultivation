---
name: codex-cultivation
description: Install, apply, verify, update, or restore the Codex Cultivation interface on Windows without modifying WindowsApps or app.asar.
---

# Codex Cultivation

Use the scripts in this repository to apply a reversible cultivation workspace to the official Microsoft Store Codex Desktop app.

## Workflow

1. Close Codex and run `scripts/install-codex-cultivation.ps1`.
2. Run `scripts/start-codex-cultivation.ps1` or use the installed shortcut.
3. Verify with `scripts/verify-codex-cultivation.ps1 -ScreenshotPath <absolute-path>`.
4. Inspect both the home page and a normal task page.
5. Restore with `scripts/restore-codex-cultivation.ps1`.

## Guardrails

- Never modify `WindowsApps`, `app.asar`, official signatures, accounts, tasks, pets, or plugins.
- Keep CDP loopback-only and validate the Store package, process identity, port, target ID, and Browser ID.
- Preserve `config.toml` as strict UTF-8 and use recoverable atomic writes.
- Keep real Codex cards, project selector, composer, menus, title bar, and task content interactive and readable.
- Follow the final Codex light/dark theme; the cultivation layer must not change Windows or Codex appearance settings.
- Do not commit API keys, authentication files, local state, personal screenshots, or user task data.
- Treat Token totals as local estimates unless manually calibrated.

## Important files

- `assets/renderer-inject.js`: cultivation state, DOM integration, cleanup, and local debug API.
- `assets/cultivation-base.css`: shared Codex readability and background layer.
- `assets/cultivation-skin.css`: cultivation HUD, home layout, companion, dialog, charts, and paired themes.
- `scripts/injector.mjs`: payload construction, CDP connection, verification, screenshot, and removal.
- `scripts/config-utf8.ps1`: strict UTF-8 configuration preservation and recovery.
- `scripts/theme-windows.ps1`: managed theme store and safe image import.
- `references/cultivation-system.md`: progression and persistence rules.
- `references/cultivation-design-system.md`: layout, visual, accessibility, and data-integrity rules.
