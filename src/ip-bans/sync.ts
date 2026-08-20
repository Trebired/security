import *as result from "@trebired/result";
import { normalizers as normalize } from "@trebired/utils";
import *as time from "@trebired/utils";
import *as state from "./state.js";
import { recordSecuritySyncResults } from "./sync-results.js";
import *as events from "./events.js";
import *as core from "./core.js";
import { indexBansById } from "./maps.js";

async function failTarget(target: any, errorCode: any) {
  const row = target && typeof target === "object" ? target : null;
  if (!row) return null;

  return await state.writeBanTarget(
    Object.assign({}, row, {
        status: "failed",
        last_error: normalize.toString(errorCode) || "invalid-ban-target",
        last_seen_at: time.now(),
    }),
  );
}

async function buildOperationForTarget(target: any, bansById: Map<any, any>) {
  if (!state.isBanTargetRow(target)) return null;

  const ban: any = bansById.get(normalize.toString(target && target.ban_id));
  if (!ban) {
    await failTarget(target, "ban-not-found");
    return null;
  }

  const desiredState = normalize.toString(target && target.desired_state);
  const ip = normalize.toString(ban && ban.ip);
  if (!desiredState) {
    await failTarget(target, "missing-desired-state");
    return null;
  }

  if (!ip) {
    await failTarget(target, "missing-ip");
    return null;
  }

  return {
    target_id: target.id,
    ban_id: ban.id,
    desired_state: desiredState,
    ip,
    level: desiredState === "remove" ? "" : target.level,
    permanent: ban.permanent === true,
    recorded_at: ban.recorded_at,
    started_at: ban.started_at,
    ends_at: ban.ends_at,
    reason: ban.reason,
    event_kind: ban.event_kind,
  };
}

async function listPendingBanOperationsForServer(serverId: unknown) {
  const targetServerId: any = normalize.toString(serverId);
  if (!targetServerId) {
    return result.badRequest("missing-server-id");
  }

  await core.reconcileActiveBans().catch (() => {});

  const targets = (
    await state.listBanTargets({
        server_id: targetServerId,
        status: "pending",
        limit: 500,
    })
  ).filter(state.isBanTargetRow);
  const bans = (await state.listBans({ limit: 500 })).filter(state.isBanRow);
  const bansById = indexBansById(bans);
  const operations = [];

  for (const target of targets) {
    const operation = await buildOperationForTarget(target, bansById);
    if (operation) operations.push(operation);
  }

  return result.ok("pending-ban-operations-loaded", {
      data: { server_id: targetServerId, operations },
  });
}

function indexTargets(targets: any[]) {
  const targetsById = new Map();
  const targetsByBanId = new Map();

  for (const target of targets) {
    if (!state.isBanTargetRow(target)) continue;
    const targetId = normalize.toString(target && target.id);
    const banId = normalize.toString(target && target.ban_id);

    if (targetId) targetsById.set(targetId, target);
    if (banId) targetsByBanId.set(banId, target);
  }

  return { targetsById, targetsByBanId };
}

async function applySyncResult(
  entry: any,
  targetsById: Map<any, any>,
  targetsByBanId: Map<any, any>,
) {
  const targetId = normalize.toString(entry && entry.target_id);
  const banId = normalize.toString(entry && entry.ban_id);
  const desiredState = normalize.toString(entry && entry.desired_state);
  const ok = entry && entry.ok === true;

  let target = targetId ? targetsById.get(targetId) || null : null;
  if (!target && banId) target = targetsByBanId.get(banId) || null;
  if (!target) return null;

  const now: any = time.now();
  return await state.writeBanTarget(
    Object.assign({}, target, {
        desired_state: desiredState || target.desired_state,
        status: ok
        ? desiredState === "remove"
        ? "removed"
        : "applied"
        : "failed",
        applied_at:
        ok && desiredState !== "remove"
        ? target.applied_at || now
        : target.applied_at,
        removed_at: ok && desiredState === "remove" ? now : target.removed_at,
        last_error: ok
        ? ""
        : normalize.toString(entry && entry.error) || "agent-operation-failed",
        last_seen_at: now,
    }),
  );
}

async function recordBanSyncResults(input: any = null) {
  return await recordSecuritySyncResults(input, {
      applyResult: (entry: any, indexes: any) =>
      applySyncResult(entry, indexes.targetsById, indexes.targetsByBanId),
      indexTargets,
      listTargets: async(serverId: any) =>
      (await state.listBanTargets({ server_id: serverId })).filter(
        state.isBanTargetRow,
      ),
      messageCode: "ban-sync-results-recorded",
      rememberTarget(indexes: any, next: any) {
        indexes.targetsById.set(normalize.toString(next.id), next);
        indexes.targetsByBanId.set(normalize.toString(next.ban_id), next);
      },
  });
}

const recordAgentSecurityEvents: any = events.recordAgentSecurityEvents;
const recordSyncResults = recordBanSyncResults;

export {
  listPendingBanOperationsForServer,
  recordAgentSecurityEvents,
  recordSyncResults,
};
