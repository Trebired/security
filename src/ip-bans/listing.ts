import *as result from "@trebired/result";
import { normalizers as normalize } from "@trebired/utils";
import *as state from "./state.js";
import { withoutIpv6MappedPrefix } from "./request.js";
import {
  hasBanExpired,
  isActiveBanStatus,
  isHistoryBanStatus,
} from "./spec.js";
import { indexBansById } from "./maps.js";

function effectiveBanStatus(row: any): string {
  const status = normalize.toString(row && row.status).toLowerCase();
  if ((status === "active" || status === "unavailable") && hasBanExpired(row)) {
    return "expired";
  }
  return status;
}

function mergeBanTarget(row: any, target: any) {
  return Object.assign({}, row || {}, {
      ban_id: normalize.toString((row && row.id) || (target && target.ban_id)),
      target_id: normalize.toString(target && target.id),
      target_status: normalize.toString(target && target.status),
      target_desired_state: normalize.toString(target && target.desired_state),
      target_level: normalize.toString(target && target.level),
      target_recorded_at: normalize.toString(target && target.recorded_at),
      target_applied_at: normalize.toString(target && target.applied_at),
      target_removed_at: normalize.toString(target && target.removed_at),
      target_last_error: normalize.toString(target && target.last_error),
      target_last_seen_at: normalize.toString(target && target.last_seen_at),
  });
}

function banVisibleToServer(row: any, serverId: unknown) {
  const item = row && typeof row === "object" ? row : {};
  const targetServerId = normalize.toString(serverId);
  if (!targetServerId) return false;
  return (
    normalize.toString(item.scope) === "all" ||
      normalize.toString(item.server_id) === targetServerId
  );
}

function indexTargetsByBanId(targets: any[]) {
  const targetMap = new Map<string, any>();

  for (const target of targets) {
    if (!state.isBanTargetRow(target)) continue;
    const banId = normalize.toString(target && target.ban_id);
    if (!banId || targetMap.has(banId)) continue;
    targetMap.set(banId, target);
  }

  return targetMap;
}

async function hydrateBansForTargets(
  list: any[],
  targets: any[],
  bansById: Map<string, any>,
) {
  for (const target of targets) {
    const banId = normalize.toString(target && target.ban_id);
    if (!banId || bansById.has(banId)) continue;

    const ban = await state.readBanById(banId);
    if (!ban) continue;

    bansById.set(banId, ban);
    list.push(ban);
  }
}

function mergeVisibleBans(
  list: any[],
  targetMap: Map<string, any>,
  targetServerId: string,
) {
  const visibleBans = list.filter((row: any) =>
    banVisibleToServer(row, targetServerId),
  );

  return visibleBans.map((row: any) => {
      const target = targetMap.get(normalize.toString(row && row.id)) || null;
      return mergeBanTarget(row, target);
  });
}

function unresolvedTargetNeedsAttention(
  target: any,
  bansById: Map<string, any>,
) {
  const banId = normalize.toString(target && target.ban_id);
  const ban = banId ? bansById.get(banId) : null;

  if (!ban) return true;
  if (!withoutIpv6MappedPrefix(ban.ip)) return true;

  const status = effectiveBanStatus(ban);
  return !isActiveBanStatus(status) && !isHistoryBanStatus(status);
}

function mergeUnresolvedTarget(target: any, bansById: Map<string, any>) {
  const banId = normalize.toString(target && target.ban_id);
  const ban = banId ? bansById.get(banId) : null;

  return mergeBanTarget(
    ban ? Object.assign({}, ban, { status: effectiveBanStatus(ban) }) : {},
    target,
  );
}

function buildBanBuckets(merged: any[]) {
  const withEffectiveStatus = merged.map((row: any) => {
      return Object.assign({}, row, { status: effectiveBanStatus(row) });
  });

  const active = withEffectiveStatus.filter((row: any) => {
      return (
        row && withoutIpv6MappedPrefix(row.ip) && isActiveBanStatus(row.status)
      );
  });

  const history = withEffectiveStatus
  .filter((row: any) => {
      return (
        row && withoutIpv6MappedPrefix(row.ip) && isHistoryBanStatus(row.status)
      );
  })
  .slice(0, 50);

  return { active, history };
}

async function listServerBans(serverId: unknown) {
  const targetServerId: any = normalize.toString(serverId);
  if (!targetServerId) {
    return result.ok("server-bans-unavailable", {
        data: { server_id: "", active: [], history: [], unresolved_targets: [] },
    });
  }

  const list = (await state.listBans({ limit: 500 })).filter(state.isBanRow);
  const targets = (
    await state.listBanTargets({ server_id: targetServerId, limit: 1000 })
  ).filter(state.isBanTargetRow);
  const targetMap = indexTargetsByBanId(targets);
  const bansById = indexBansById(list);

  await hydrateBansForTargets(list, targets, bansById);

  const merged = mergeVisibleBans(list, targetMap, targetServerId);
  const unresolvedTargets = targets
  .filter((target: any) => unresolvedTargetNeedsAttention(target, bansById))
  .map((target: any) => mergeUnresolvedTarget(target, bansById));

  const { active, history } = buildBanBuckets(merged);

  return result.ok("server-bans-loaded", {
      data: {
        server_id: targetServerId,
        active,
        history,
        unresolved_targets: unresolvedTargets.slice(0, 50),
      },
  });
}

export { listServerBans };
