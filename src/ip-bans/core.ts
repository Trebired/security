import *as result from "@trebired/result";
import *as servers from "./servers.js";
import { normalizers as normalize } from "@trebired/utils";
import *as time from "@trebired/utils";
import *as state from "./state.js";
import { withoutIpv6MappedPrefix } from "./request.js";
import { hasBanExpired, isActiveBanStatus } from "./spec.js";
import { listEnrolledServers } from "./servers.js";
import { readBanConfig } from "./config.js";

const CURRENT_SERVER_CACHE = {
  id: "",
  expires_at_ms: 0,
};

async function resolveCurrentServerId(): Promise<string> {
  if (
    CURRENT_SERVER_CACHE.id &&
      CURRENT_SERVER_CACHE.expires_at_ms > time.nowMs()
  ) {
    return CURRENT_SERVER_CACHE.id;
  }

  const serverRes = await servers.getCurrentServer({ mode: "view" });
  const server =
  serverRes &&
    serverRes.ok === true &&
    serverRes.data &&
    typeof serverRes.data === "object"
  ? (serverRes.data as any).server || serverRes.data
  : null;
  const serverId = normalize.toString(server && server.id);

  CURRENT_SERVER_CACHE.id = serverId;
  CURRENT_SERVER_CACHE.expires_at_ms =
  time.nowMs() + readBanConfig().current_server_cache_ms;
  return serverId;
}

async function updateOffenderFromBan(row: any, patch: any = null) {
  const target = row && typeof row === "object" ? row : {};
  const nextPatch = patch && typeof patch === "object" ? patch : {};
  const offender: any = await state.readOffender(target.ip);
  if (!offender) return null;

  return await state.writeOffender(
    Object.assign({}, offender, nextPatch, {
        ip: target.ip,
        server_id: target.server_id || offender.server_id,
        updated_at: time.now(),
    }),
  );
}

async function targetServerIdsForBan(
  ban: any,
  explicitServerId = "",
): Promise<string[]> {
  const src = ban && typeof ban === "object" ? ban : null;
  if (!src) return [];

  if (normalize.toString(src.scope) === "all") {
    const allServers = await listEnrolledServers();
    return allServers
    .map((entry: any) => normalize.toString(entry && entry.id))
    .filter(Boolean);
  }

  const serverId = normalize.toString(explicitServerId || src.server_id);
  return serverId ? [serverId] : [];
}

async function fanoutBanTargets(
  ban: any,
  desiredState: unknown,
  options: any = null,
): Promise<any[]> {
  const src = ban && typeof ban === "object" ? ban : null;
  if (!src || !src.id) return [];

  const opts = options && typeof options === "object" ? options : {};
  const touched = [];
  const recordedAt: any = time.now();
  const targetState = normalize.toString(desiredState) || "apply";
  const targetLevel = normalize.toString(opts.level || src.level);
  const targetServerIds = Array.isArray(opts.servers)
  ? opts.servers
  .map((entry: any) => normalize.toString(entry && entry.id))
  .filter(Boolean)
  : await targetServerIdsForBan(src, normalize.toString(opts.server_id));

  for (const serverId of targetServerIds) {
    if (!serverId) continue;

    const next = await state.upsertBanTarget({
        ban_id: src.id,
        server_id: serverId,
        desired_state: targetState,
        level: targetLevel,
        status: "pending",
        recorded_at: recordedAt,
        applied_at: "",
        removed_at: "",
        last_error: "",
        last_seen_at: "",
    });

    if (next) touched.push(next);
  }

  return touched;
}

async function markBanExpired(row: any) {
  const src = row && typeof row === "object" ? row : null;
  if (!src) return null;

  const next = await state.writeBan(
    Object.assign({}, src, {
        status: "expired",
        bridge_removed_at: time.now(),
        bridge_error: "",
    }),
  );

  await updateOffenderFromBan(src, {
      active_ban_id: "",
  });

  await fanoutBanTargets(next || src, "remove");
  return next;
}

async function reconcileActiveBans() {
  const activeRows = (
    await state.listBans({ status: "active", limit: 500 })
  ).filter(state.isBanRow);
  const reconciled = [];
  let expiredCount = 0;

  for (const row of activeRows) {
    if (!hasBanExpired(row)) continue;
    const next: any = await markBanExpired(row);
    if (next) {
      expiredCount += 1;
      reconciled.push(next);
    }
  }

  return result.ok("security-bans-reconciled", {
      data: {
        reconciled: true,
        reconciled_count: reconciled.length,
        expired_count: expiredCount,
        drift_count: 0,
        drift_ips: [],
      },
  });
}

async function getActiveBanForIp(ip: unknown, serverId = "") {
  const safeIp: any = withoutIpv6MappedPrefix(ip);
  if (!safeIp) return null;

  const activeBan = await state.readActiveBanByIp(
    safeIp,
    normalize.toString(serverId),
  );
  if (!activeBan || !isActiveBanStatus(activeBan.status)) return null;

  if (hasBanExpired(activeBan)) {
    await markBanExpired(activeBan);
    return null;
  }

  return activeBan;
}

async function syncActiveBanTargetsForServer(
  serverId: unknown,
): Promise<any[]> {
  const targetServerId: any = normalize.toString(serverId);
  if (!targetServerId) return [];
  const activeBans = (
    await state.listBans({ status: "active", limit: 500 })
  ).filter(state.isBanRow);
  const existingTargets = (
    await state.listBanTargets({ server_id: targetServerId, limit: 1000 })
  ).filter(state.isBanTargetRow);
  const targetsByBanId = new Map();
  const touched = [];

  for (const target of existingTargets) {
    if (!state.isBanTargetRow(target)) continue;
    const banId = normalize.toString(target && target.ban_id);
    if (!banId) continue;
    targetsByBanId.set(banId, target);
  }

  for (const ban of activeBans) {
    if (!state.isBanRow(ban)) continue;
    if (!isActiveBanStatus(ban && ban.status) || hasBanExpired(ban)) continue;
    const banScope =
    normalize.toString(ban && ban.scope) === "all" ? "all" : "server";
    const banServerId = normalize.toString(ban && ban.server_id);
    if (banScope !== "all" && banServerId !== targetServerId) continue;

    const existing = targetsByBanId.get(normalize.toString(ban && ban.id));
    if (existing) continue;
    const target = await state.writeBanTarget({
        ban_id: ban.id,
        server_id: targetServerId,
        desired_state: "apply",
        level: ban.level,
        status: "pending",
        recorded_at: time.now(),
        last_error: "",
    });
    if (!target) continue;
    touched.push(target);
    targetsByBanId.set(normalize.toString(target.ban_id), target);
  }
  return touched;
}

export {
  fanoutBanTargets,
  getActiveBanForIp,
  hasBanExpired,
  markBanExpired,
  reconcileActiveBans,
  resolveCurrentServerId,
  syncActiveBanTargetsForServer,
  updateOffenderFromBan,
};
