# macOS runtime notes

- The launcher accepts only the official `/Applications/ChatGPT.app` bundle with identifier `com.openai.codex`, OpenAI Team ID `2DC432GLL2`, and a valid deep code signature.
- Node.js 22 or newer is required for the built-in WebSocket client. The exact Node executable and version are recorded in state.
- The preferred port is `9335`. An explicitly occupied port is rejected; the default path scans up to 100 loopback ports.
- Listener ownership is checked with `lsof` against the exact main executable inside the validated app bundle. CDP WebSocket URLs must remain loopback-only, same-port, credential-free, query-free, and match the expected browser/page path shape.
- State is stored in `~/Library/Application Support/CodexCultivation/state.json`. The injector is stopped only when PID, process start time, Node path, injector path, watch mode, port, and Browser ID all match.
- Starting while Codex is open requires an explicit `--restart-existing` flag or a native confirmation dialog. Restore uses the same consent rule.
- The app bundle and `~/.codex/config.toml` are not modified. The injected CSS follows Codex's resolved light or dark appearance.
- The menu bar controller is an optional Swift script and uses the same Node controller as the command-line entry points.
