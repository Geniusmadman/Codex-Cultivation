import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readCcSwitchCodexUsage } from "../scripts/cc-switch-usage.mjs";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codex-cultivation-cc-switch-"));
const databasePath = path.join(temporaryRoot, "cc-switch.db");

try {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE proxy_request_logs (
      request_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      app_type TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      status_code INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      data_source TEXT NOT NULL DEFAULT 'proxy'
    );
    CREATE TABLE usage_daily_rollups (
      date TEXT NOT NULL,
      app_type TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO usage_daily_rollups VALUES
      ('2026-06-01', 'codex', '_codex_session', 'gpt-test', 2, 1000, 50, 600, 0);
    INSERT INTO proxy_request_logs VALUES
      ('proxy-1', 'provider', 'codex', 'gpt-test', 500, 20, 400, 0, 200, 2000, 'proxy'),
      ('session-duplicate', '_codex_session', 'codex', 'gpt-test', 500, 20, 400, 0, 200, 2001, 'codex_session'),
      ('session-unique', '_codex_session', 'codex', 'gpt-test', 300, 30, 100, 0, 200, 4000, 'codex_session');
  `);
  database.close();

  const usage = await readCcSwitchCodexUsage(databasePath);
  assert.equal(usage.ok, true);
  assert.equal(usage.requests, 4);
  assert.equal(usage.freshInputTokens, 700);
  assert.equal(usage.outputTokens, 100);
  assert.equal(usage.cacheReadTokens, 1100);
  assert.equal(usage.cacheCreationTokens, 0);
  assert.equal(usage.realTotalTokens, 1900);
  assert.match(usage.firstRecordAt, /:33:20$/);
  assert.equal(usage.latestRecordAt, "2026-06-01");
  assert.deepEqual(Object.values(usage.daily).sort((left, right) => left - right), [850, 1050]);
  assert.deepEqual(Object.values(usage.hourly).sort((left, right) => left - right), [330, 520]);

  const missing = await readCcSwitchCodexUsage(path.join(temporaryRoot, "missing.db"));
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "database_not_found");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log("PASS: CC Switch Codex usage is read-only, cache-normalized, and deduplicated.");
