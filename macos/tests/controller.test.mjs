import assert from "node:assert/strict";
import { parseArgs, validateLoopbackWebSocket } from "../scripts/cultivation-macos.mjs";

const parsed = parseArgs(["start", "--port", "9444", "--restart-existing"]);
assert.equal(parsed.command, "start");
assert.equal(parsed.port, 9444);
assert.equal(parsed.portExplicit, true);
assert.equal(parsed.restartExisting, true);

const petOptions = parseArgs([
  "install",
  "--no-spirit-pet",
  "--keep-spirit-pet",
  "--restart-for-spirit-pet",
  "--codex-home",
  "/tmp/codex-home",
]);
assert.equal(petOptions.noSpiritPet, true);
assert.equal(petOptions.keepSpiritPet, true);
assert.equal(petOptions.restartForSpiritPet, true);
assert.equal(petOptions.codexHome, "/tmp/codex-home");

const syncPet = parseArgs(["sync-pet"]);
assert.equal(syncPet.command, "sync-pet");

const valid = validateLoopbackWebSocket(
  "ws://127.0.0.1:9444/devtools/browser/test-browser",
  9444,
  "browser",
);
assert.equal(valid.pathname, "/devtools/browser/test-browser");

for (const candidate of [
  "ws://example.com:9444/devtools/browser/test-browser",
  "ws://127.0.0.1:9555/devtools/browser/test-browser",
  "wss://127.0.0.1:9444/devtools/browser/test-browser",
  "ws://user@127.0.0.1:9444/devtools/browser/test-browser",
  "ws://127.0.0.1:9444/devtools/page/test-browser",
  "ws://127.0.0.1:9444/devtools/browser/test-browser?unsafe=1",
]) {
  assert.throws(() => validateLoopbackWebSocket(candidate, 9444, "browser"));
}

assert.throws(() => parseArgs(["start", "--port", "80"]));
assert.throws(() => parseArgs(["start", "--unknown"]));

console.log("PASS: macOS controller arguments and loopback CDP URLs are validated.");
