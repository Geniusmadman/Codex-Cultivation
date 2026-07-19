import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_DATABASE_PATH = path.join(os.homedir(), ".cc-switch", "cc-switch.db");

const USAGE_SQL = `
WITH effective_detail AS (
  SELECT
    l.created_at,
    CASE
      WHEN l.input_tokens >= l.cache_read_tokens
        THEN l.input_tokens - l.cache_read_tokens
      ELSE l.input_tokens
    END AS fresh_input,
    l.output_tokens,
    l.cache_read_tokens,
    l.cache_creation_tokens
  FROM proxy_request_logs l
  WHERE l.app_type = 'codex'
    AND NOT (
      COALESCE(l.data_source, 'proxy') IN (
        'session_log', 'codex_session', 'gemini_session', 'opencode_session'
      )
      AND EXISTS (
        SELECT 1
        FROM proxy_request_logs proxy_dedup
        WHERE COALESCE(proxy_dedup.data_source, 'proxy') = 'proxy'
          AND proxy_dedup.app_type = l.app_type
          AND proxy_dedup.status_code >= 200
          AND proxy_dedup.status_code < 300
          AND proxy_dedup.input_tokens = l.input_tokens
          AND proxy_dedup.output_tokens = l.output_tokens
          AND proxy_dedup.cache_read_tokens = l.cache_read_tokens
          AND (
            proxy_dedup.cache_creation_tokens = l.cache_creation_tokens
            OR l.cache_creation_tokens = 0
          )
          AND proxy_dedup.created_at BETWEEN l.created_at - 600 AND l.created_at + 600
          AND (
            LOWER(proxy_dedup.model) = LOWER(l.model)
            OR LOWER(proxy_dedup.model) = 'unknown'
            OR LOWER(l.model) = 'unknown'
          )
      )
    )
), detail AS (
  SELECT
    COUNT(*) AS requests,
    COALESCE(SUM(fresh_input), 0) AS fresh_input,
    COALESCE(SUM(output_tokens), 0) AS output_tokens,
    COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
    COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
    MIN(created_at) AS first_at,
    MAX(created_at) AS latest_at
  FROM effective_detail
), rollup AS (
  SELECT
    COALESCE(SUM(request_count), 0) AS requests,
    COALESCE(SUM(CASE
      WHEN input_tokens >= cache_read_tokens
        THEN input_tokens - cache_read_tokens
      ELSE input_tokens
    END), 0) AS fresh_input,
    COALESCE(SUM(output_tokens), 0) AS output_tokens,
    COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
    COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
    MIN(date) AS first_day,
    MAX(date) AS latest_day
  FROM usage_daily_rollups
  WHERE app_type = 'codex'
), daily_rows AS (
  SELECT day, SUM(tokens) AS tokens
  FROM (
    SELECT
      date(created_at, 'unixepoch', 'localtime') AS day,
      SUM(fresh_input + output_tokens + cache_read_tokens + cache_creation_tokens) AS tokens
    FROM effective_detail
    GROUP BY day
    UNION ALL
    SELECT
      date AS day,
      SUM(
        CASE WHEN input_tokens >= cache_read_tokens
          THEN input_tokens - cache_read_tokens
          ELSE input_tokens
        END + output_tokens + cache_read_tokens + cache_creation_tokens
      ) AS tokens
    FROM usage_daily_rollups
    WHERE app_type = 'codex'
    GROUP BY date
  ) combined
  GROUP BY day
), hourly_rows AS (
  SELECT
    strftime('%Y-%m-%dT%H', created_at, 'unixepoch', 'localtime') AS hour,
    SUM(fresh_input + output_tokens + cache_read_tokens + cache_creation_tokens) AS tokens
  FROM effective_detail
  GROUP BY hour
)
SELECT
  detail.requests + rollup.requests AS requests,
  detail.fresh_input + rollup.fresh_input AS freshInputTokens,
  detail.output_tokens + rollup.output_tokens AS outputTokens,
  detail.cache_read_tokens + rollup.cache_read_tokens AS cacheReadTokens,
  detail.cache_creation_tokens + rollup.cache_creation_tokens AS cacheCreationTokens,
  detail.fresh_input + rollup.fresh_input
    + detail.output_tokens + rollup.output_tokens
    + detail.cache_read_tokens + rollup.cache_read_tokens
    + detail.cache_creation_tokens + rollup.cache_creation_tokens AS realTotalTokens,
  CASE
    WHEN rollup.first_day IS NULL THEN datetime(detail.first_at, 'unixepoch', 'localtime')
    WHEN detail.first_at IS NULL THEN rollup.first_day
    ELSE MIN(rollup.first_day, datetime(detail.first_at, 'unixepoch', 'localtime'))
  END AS firstRecordAt,
  CASE
    WHEN rollup.latest_day IS NULL THEN datetime(detail.latest_at, 'unixepoch', 'localtime')
    WHEN detail.latest_at IS NULL THEN rollup.latest_day
    ELSE MAX(rollup.latest_day, datetime(detail.latest_at, 'unixepoch', 'localtime'))
  END AS latestRecordAt,
  COALESCE((
    SELECT json_group_object(day, tokens)
    FROM (SELECT day, tokens FROM daily_rows ORDER BY day DESC LIMIT 60)
  ), '{}') AS dailyJson,
  COALESCE((
    SELECT json_group_object(hour, tokens)
    FROM (SELECT hour, tokens FROM hourly_rows ORDER BY hour DESC LIMIT 72)
  ), '{}') AS hourlyJson
FROM detail, rollup;
`;

function unavailable(code, message, databasePath = DEFAULT_DATABASE_PATH) {
  return { ok: false, source: "cc-switch", code, message, databasePath };
}

export async function readCcSwitchCodexUsage(databasePath = DEFAULT_DATABASE_PATH) {
  const resolved = path.resolve(databasePath);
  let stat;
  try {
    stat = await fs.lstat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return unavailable("database_not_found", "未找到 CC Switch 数据库，请先安装并运行 CC Switch。", resolved);
    }
    return unavailable("database_unreadable", `无法读取 CC Switch 数据库：${error.message}`, resolved);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return unavailable("database_invalid", "CC Switch 数据库路径不是普通文件。", resolved);
  }

  let database = null;
  try {
    database = new DatabaseSync(resolved, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 2000;");
    const rows = database.prepare(USAGE_SQL).all();
    const row = rows[0];
    const realTotalTokens = Math.max(0, Math.round(Number(row?.realTotalTokens) || 0));
    if (!row || realTotalTokens === 0 || Number(row.requests) === 0) {
      return unavailable("no_codex_usage", "CC Switch 中尚无 Codex Token 统计，请先在 CC Switch 中同步会话用量。", resolved);
    }
    const normalizeTimeline = (value, pattern) => {
      let parsed = {};
      try { parsed = JSON.parse(value || "{}"); } catch {}
      return Object.fromEntries(Object.entries(parsed)
        .filter(([key]) => pattern.test(key))
        .map(([key, tokens]) => [key, Math.max(0, Math.round(Number(tokens) || 0))]));
    };
    const daily = normalizeTimeline(row.dailyJson, /^\d{4}-\d{2}-\d{2}$/);
    const hourly = normalizeTimeline(row.hourlyJson, /^\d{4}-\d{2}-\d{2}T\d{2}$/);
    return {
      ok: true,
      source: "cc-switch",
      databasePath: resolved,
      requests: Math.max(0, Math.round(Number(row.requests) || 0)),
      freshInputTokens: Math.max(0, Math.round(Number(row.freshInputTokens) || 0)),
      outputTokens: Math.max(0, Math.round(Number(row.outputTokens) || 0)),
      cacheReadTokens: Math.max(0, Math.round(Number(row.cacheReadTokens) || 0)),
      cacheCreationTokens: Math.max(0, Math.round(Number(row.cacheCreationTokens) || 0)),
      realTotalTokens,
      daily,
      hourly,
      firstRecordAt: row.firstRecordAt || null,
      latestRecordAt: row.latestRecordAt || null,
      readAt: new Date().toISOString(),
    };
  } catch (error) {
    const detail = String(error?.message || error).trim();
    const schemaMismatch = /no such table|no such column/i.test(detail);
    return unavailable(
      schemaMismatch ? "unsupported_schema" : "query_failed",
      schemaMismatch
        ? "当前 CC Switch 数据库结构暂不受支持，请升级 CC Switch 后重试。"
        : `读取 CC Switch Token 统计失败：${detail || "未知错误"}`,
      resolved,
    );
  } finally {
    try { database?.close(); } catch {}
  }
}

export { DEFAULT_DATABASE_PATH, USAGE_SQL };
