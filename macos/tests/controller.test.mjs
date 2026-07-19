import assert from "node:assert/strict";
import { parseArgs, validateLoopbackWebSocket } from "../scripts/cultivation-macos.mjs";

const parsed = parseArgs(["start", "--port", "9444", "--restart-existing"]);
assert.equal(parsed.command, "start");
assert.equal(parsed.port, 9444);
assert.equal(parsed.portExplicit, true);
assert.equal(parsed.restartExisting, true);

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
