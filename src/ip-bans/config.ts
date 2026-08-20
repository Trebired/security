import { normalizers as normalize } from "@trebired/utils";
import { readResolvedSecurityConfigSync } from "#t6wa0hlhh5fp";
import type { SecurityIpBanLevelConfig } from "#t6wa0hlhh5fp";

const DEFAULT_SCORE_THRESHOLD = 10;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_CURRENT_SERVER_CACHE_MS = 30 * 1000;
const DEFAULT_SYNC_TIMEOUT_MS = 2500;

const DEFAULT_LEVELS: SecurityIpBanLevelConfig[] = [
  {
    key: "1h",
    suffix: "1h",
    durationMs: 60 * 60 * 1000,
    permanent: false,
  },
  {
    key: "6h",
    suffix: "6h",
    durationMs: 6 * 60 * 60 * 1000,
    permanent: false,
  },
  {
    key: "24h",
    suffix: "24h",
    durationMs: 24 * 60 * 60 * 1000,
    permanent: false,
  },
  {
    key: "permanent",
    suffix: "permanent",
    durationMs: 0,
    permanent: true,
  },
];

function numberOrFallback(value: unknown, fallback: number, minimum = 0): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) return fallback;
  return Math.trunc(number);
}

function stringList(value: unknown, fallback: string[]): string[] {
  const list = Array.isArray(value) ? value : fallback;
  return list.map((entry) => normalize.toString(entry).toLowerCase()).filter(Boolean);
}

function normalizeLevel(level: SecurityIpBanLevelConfig): SecurityIpBanLevelConfig {
  const key = normalize.toString(level && level.key).toLowerCase();
  return {
    key,
    suffix: normalize.toString(level && level.suffix) || key,
    durationMs: numberOrFallback(level && level.durationMs, 0, 0),
    permanent: level && level.permanent === true,
  };
}

function readBanLevels(): SecurityIpBanLevelConfig[] {
  const config = readResolvedSecurityConfigSync().ipBans || {};
  const configured = Array.isArray(config.levels) ? config.levels : [];
  const levels = configured.map(normalizeLevel).filter((level) => level.key);
  return levels.length ? levels : [...DEFAULT_LEVELS];
}

function readBanConfig() {
  const config = readResolvedSecurityConfigSync().ipBans || {};
  return Object.freeze({
      active_statuses: stringList(config.activeStatuses, ["active", "unavailable"]),
      current_server_cache_ms: numberOrFallback(
        config.currentServerCacheMs,
        DEFAULT_CURRENT_SERVER_CACHE_MS,
        0,
      ),
      enabled: config.enabled !== false,
      history_statuses: stringList(config.historyStatuses, ["expired", "unbanned"]),
      levels: readBanLevels(),
      score_threshold: numberOrFallback(
        config.scoreThreshold,
        DEFAULT_SCORE_THRESHOLD,
        1,
      ),
      startup_reconcile: config.startupReconcile !== false,
      startup_repair: config.startupRepair !== false,
      sync_timeout_ms: numberOrFallback(
        config.syncTimeoutMs,
        DEFAULT_SYNC_TIMEOUT_MS,
        0,
      ),
      window_ms: numberOrFallback(config.windowMs, DEFAULT_WINDOW_MS, 1),
  });
}

function scoreThreshold(): number {
  return readBanConfig().score_threshold;
}

function banWindowMs(): number {
  return readBanConfig().window_ms;
}

export {
  DEFAULT_CURRENT_SERVER_CACHE_MS,
  DEFAULT_LEVELS,
  DEFAULT_SCORE_THRESHOLD,
  DEFAULT_SYNC_TIMEOUT_MS,
  DEFAULT_WINDOW_MS,
  banWindowMs,
  readBanConfig,
  readBanLevels,
  scoreThreshold,
};
