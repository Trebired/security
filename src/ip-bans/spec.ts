import { toTrimmedString as toString } from "@trebired/utils";
import { nowMs, toDateMs } from "@trebired/utils";
import {
  banWindowMs,
  readBanConfig,
  readBanLevels,
  scoreThreshold,
} from "./config.js";

const SCORE_THRESHOLD = 10;
const WINDOW_MS = 10 * 60 * 1000;

const BAN_LEVELS = Object.freeze({
    "1h": Object.freeze({
        key: "1h",
        suffix: "1h",
        duration_ms: 60 * 60 * 1000,
        permanent: false,
    }),
    "6h": Object.freeze({
        key: "6h",
        suffix: "6h",
        duration_ms: 6 * 60 * 60 * 1000,
        permanent: false,
    }),
    "24h": Object.freeze({
        key: "24h",
        suffix: "24h",
        duration_ms: 24 * 60 * 60 * 1000,
        permanent: false,
    }),
    permanent: Object.freeze({
        key: "permanent",
        suffix: "permanent",
        duration_ms: 0,
        permanent: true,
    }),
});

const BAN_LEVEL_SEQUENCE = Object.freeze(["1h", "6h", "24h", "permanent"]);
const ACTIVE_BAN_STATUSES = Object.freeze(["active", "unavailable"]);
const HISTORY_BAN_STATUSES = Object.freeze(["expired", "unbanned"]);

function normalizeBanLevel(level: unknown): string {
  const key = toString(level).toLowerCase();
  const levels = readBanLevels();
  return levels.some((entry) => entry.key === key) ? key : levels[0]?.key || "1h";
}

function getBanLevelSpec(level: unknown) {
  const normalized = normalizeBanLevel(level);
  const match = readBanLevels().find((entry) => entry.key === normalized) ||
    readBanLevels()[0];
  return {
    key: match?.key || "1h",
    suffix: match?.suffix || match?.key || "1h",
    duration_ms: Number(match?.durationMs) || 0,
    permanent: match?.permanent === true,
  };
}

function getNextBanLevel(banCount: unknown): string {
  const sequence = readBanLevels().map((entry) => entry.key).filter(Boolean);
  const count = Number.isFinite(Number(banCount)) ? Number(banCount) : 0;
  const index = Math.min(Math.max(0, count), sequence.length - 1);
  return sequence[index] || "1h";
}

function isActiveBanStatus(status: unknown): boolean {
  return readBanConfig().active_statuses.includes(toString(status).toLowerCase());
}

function isHistoryBanStatus(status: unknown): boolean {
  return readBanConfig().history_statuses.includes(toString(status).toLowerCase());
}

function hasBanExpired(row: any): boolean {
  if (!row || row.permanent === true) return false;
  const endsAtMs: any = toDateMs(row.ends_at);
  if (!(endsAtMs > 0)) return false;
  return endsAtMs <= nowMs();
}

function buildJailName(prefix: unknown, level: unknown): string {
  const base = toString(prefix);
  const spec = getBanLevelSpec(level);
  return base ? `${base}-${spec.suffix}` : spec.suffix;
}

export {
  ACTIVE_BAN_STATUSES,
  BAN_LEVELS,
  BAN_LEVEL_SEQUENCE,
  HISTORY_BAN_STATUSES,
  SCORE_THRESHOLD,
  WINDOW_MS,
  banWindowMs,
  buildJailName,
  getBanLevelSpec,
  getNextBanLevel,
  hasBanExpired,
  isActiveBanStatus,
  isHistoryBanStatus,
  normalizeBanLevel,
  scoreThreshold,
};
