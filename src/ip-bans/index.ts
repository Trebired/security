import *as banEngine from "./engine.js";
import { normalizers as normalize } from "@trebired/utils";
import *as result from "@trebired/result";
import *as requestUtils from "./request.js";
import { readBanConfig } from "./config.js";
import { resolveSecurityLogger } from "../logging.js";

const securityMetaByRequest = new WeakMap<object, any>();

function attachRequestMeta(req: any) {
  if (req && typeof req === "object") {
    const existing = securityMetaByRequest.get(req);
    if (existing && typeof existing === "object") return existing;
  }

  const meta = {
    ip: requestUtils.getClientIp(req),
    user_agent: requestUtils.getUserAgent(req),
    path: requestUtils.getPathname(req),
    method: normalize.toString(req && req.method).toUpperCase(),
    recorded_at: new Date().toISOString(),
  };

  if (req && typeof req === "object") securityMetaByRequest.set(req, meta);

  return meta;
}

function toBanPayload(req: any, payload: any) {
  const meta: any = attachRequestMeta(req);
  const src = payload && typeof payload === "object" ? payload : {};

  return {
    ip: meta.ip,
    user_agent: meta.user_agent,
    path: meta.path,
    kind: normalize.toString(src.kind),
    reason: normalize.toString(src.reason),
    weight: Number(src.weight) || 0,
    counts_toward_ban: src.counts_toward_ban === true,
  };
}

function errorMessage(error: any) {
  return error && error.message ? String(error.message) : String(error);
}

function securityRecordFailed(label: string, error: any) {
  resolveSecurityLogger(undefined).warn("security.bans", label, {
      error: errorMessage(error),
  });
  return result.error("security-event-record-failed", 500, {
      error: true,
      data: { error: errorMessage(error) },
  });
}

async function isBlocked(req: any) {
  const cfg: any = readBanConfig();
  const meta: any = attachRequestMeta(req);

  if (!cfg.enabled) {
    return { allowed: true, enabled: false, ip: meta.ip, ban: null };
  }

  const serverId = await banEngine.resolveCurrentServerId();
  const ban: any = await banEngine.getActiveBanForIp(meta.ip, serverId);
  if (!ban) {
    return { allowed: true, enabled: true, ip: meta.ip, ban: null };
  }

  return { allowed: false, enabled: true, ip: meta.ip, ban };
}

async function recordLoginAttempt(req: any, payload: any) {
  try {
    const src = payload && typeof payload === "object" ? payload : {};

    if (src.ok === true) {
      const meta: any = attachRequestMeta(req);
      await banEngine.clearOffenderWindow(meta.ip);
      return result.ok("success", {
          message: false,
          data: { cleared: true },
      });
    }

    const reason: any = normalize.toString(src.reason);
    const countsTowardBan = ![
      "activation-required",
      "password-setup-required",
    ].includes(reason);

    return await banEngine.recordSecurityEvent(
      toBanPayload(req, {
          kind: "auth-failed",
          reason,
          weight:
          reason === "two-factor-invalid" || reason === "invalid-credentials"
          ? 1
          : countsTowardBan
          ? 1
          : 0,
          counts_toward_ban: countsTowardBan,
      }),
    );
  } catch (error) {
    return securityRecordFailed("login attempt record failed", error);
  }
}

async function recordRateLimitHit(req: any, payload: any) {
  try {
    const src = payload && typeof payload === "object" ? payload : {};

    return await banEngine.recordSecurityEvent(
      toBanPayload(req, {
          kind:
          normalize.toString(src.kind) === "login"
          ? "login-rate-limit"
          : "request-rate-limit",
          reason: "rate-limit-exceeded",
          weight: normalize.toString(src.kind) === "login" ? 5 : 2,
          counts_toward_ban: true,
      }),
    );
  } catch (error) {
    return securityRecordFailed("rate limit record failed", error);
  }
}

async function recordRequestSecurityEvent(req: any, payload: any) {
  try {
    return await banEngine.recordSecurityEvent(toBanPayload(req, payload));
  } catch (error) {
    return securityRecordFailed("request security event record failed", error);
  }
}

const clearOffenderWindow: any = banEngine.clearOffenderWindow;
const createManualBan: any = banEngine.createManualBan;
const listPendingBanOperationsForServer: any =
banEngine.listPendingBanOperationsForServer;
const listServerBans: any = banEngine.listServerBans;
const promoteBanPermanent: any = banEngine.promoteBanPermanent;
const repairCorruptedBanTargets: any = banEngine.repairCorruptedBanTargets;
const reconcileActiveBans: any = banEngine.reconcileActiveBans;
const recordAgentSecurityEvents: any = banEngine.recordAgentSecurityEvents;
const recordSyncResults: any = banEngine.recordSyncResults;
const syncActiveBanTargetsForServer: any =
banEngine.syncActiveBanTargetsForServer;
const unbanBan: any = banEngine.unbanBan;

export {
  attachRequestMeta,
  clearOffenderWindow,
  createManualBan,
  isBlocked,
  listPendingBanOperationsForServer,
  listServerBans,
  promoteBanPermanent,
  repairCorruptedBanTargets,
  recordAgentSecurityEvents,
  recordLoginAttempt,
  recordRateLimitHit,
  recordRequestSecurityEvent,
  recordSyncResults,
  reconcileActiveBans,
  syncActiveBanTargetsForServer,
  unbanBan,
};
