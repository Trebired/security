import *as result from "@trebired/result";
import { normalizers as normalize } from "@trebired/utils";
import *as time from "@trebired/utils";
import net from "node:net";

import *as state from "./state.js";
import { withoutIpv6MappedPrefix } from "./request.js";
import { getBanLevelSpec, normalizeBanLevel } from "./spec.js";
import *as core from "./core.js";

function normalizeManualBanInput(input: any) {
  const src = input && typeof input === "object" ? input : {};

  return {
    ip: withoutIpv6MappedPrefix(src.ip),
    serverId: normalize.toString(src.server_id),
    scope: normalize.toString(src.scope) === "all" ? "all" : "server",
    actorId: normalize.toString(src.actor_id),
    reason: normalize.toString(src.reason) || "manual-ban",
    level: normalizeBanLevel(src.level),
  };
}

function validateManualBanRequest(ip: any) {
  if (!ip || net.isIP(ip) === 0) {
    return result.badRequest("invalid-ip");
  }

  return null;
}

async function rejectExistingManualBan(ip: any, scope: any, serverId: any) {
  const existing: any = await core.getActiveBanForIp(
    ip,
    scope === "server" ? serverId : "",
  );
  if (existing) {
    return result.conflict("ban-already-active", {
        data: { ban: existing },
    });
  }

  return null;
}

async function writeManualBan(input: any, now: any) {
  const levelSpec: any = getBanLevelSpec(input.level);
  const createdBan = await state.writeBan(
    state.createBanRecord({
        ip: input.ip,
        scope: input.scope,
        server_id: input.scope === "server" ? input.serverId : "",
        reason: input.reason,
        event_kind: "manual",
        level: levelSpec.key,
        permanent: levelSpec.permanent === true,
        status: "active",
        recorded_at: now,
        started_at: now,
        ends_at: levelSpec.permanent
        ? ""
        : new Date(time.nowMs() + levelSpec.duration_ms).toISOString(),
        latest_user_agent: "",
        bridge_applied_at: now,
        bridge_error: "",
    }),
  );

  if (!createdBan || !createdBan.id) {
    return result.internal("ban-create-failed");
  }

  return createdBan;
}

async function updateManualBanOffender(input: any, createdBan: any, now: any) {
  const existingOffender: any = await state.readOffender(input.ip);
  const nextBanCount =
  Math.max(0, Number(existingOffender && existingOffender.ban_count) || 0) +
    1;

  await state.writeOffender(
    Object.assign(
      state.normalizeOffenderRow(
        existingOffender || {
          ip: input.ip,
          server_id: input.serverId,
          recorded_at: now,
          updated_at: now,
        },
        input.ip,
      ),
      {
        ip: input.ip,
        server_id: input.serverId,
        latest_reason: input.reason,
        latest_event_kind: "manual",
        latest_user_agent: "",
        last_event_at: now,
        updated_at: now,
        active_ban_id: createdBan.id,
        score: 0,
        window_started_at: "",
        ban_count: nextBanCount,
        manual_banned_by: input.actorId,
      },
    ),
  );
}

async function createManualBan(input: any) {
  const request = normalizeManualBanInput(input);
  const invalid = validateManualBanRequest(request.ip);
  if (invalid) return invalid;

  const duplicate = await rejectExistingManualBan(
    request.ip,
    request.scope,
    request.serverId,
  );
  if (duplicate) return duplicate;

  const now: any = time.now();
  const createdBan = await writeManualBan(request, now);
  if (!createdBan || !createdBan.id) return createdBan;

  await core.fanoutBanTargets(createdBan, "apply");
  await updateManualBanOffender(request, createdBan, now);

  return result.ok("ban-created", { data: { ban: createdBan } });
}

async function unbanBan(input: any) {
  const src = input && typeof input === "object" ? input : {};
  const banId: any = normalize.toString(src.ban_id);
  const actorId: any = normalize.toString(src.actor_id);

  const existing: any = await state.readBanById(banId);
  if (!existing) return result.notFound("ban-not-found");
  if (existing.status !== "active") return result.conflict("ban-not-active");

  const now: any = time.now();
  const next = await state.writeBan(
    Object.assign({}, existing, {
        status: "unbanned",
        unbanned_at: now,
        unbanned_by: actorId,
        bridge_removed_at: now,
        bridge_error: "",
    }),
  );

  await core.updateOffenderFromBan(existing, {
      active_ban_id: "",
      score: 0,
      window_started_at: "",
      updated_at: now,
  });

  await core.fanoutBanTargets(existing, "remove");

  return result.ok("ban-removed", { data: { ban: next } });
}

async function promoteBanPermanent(input: any) {
  const src = input && typeof input === "object" ? input : {};
  const banId: any = normalize.toString(src.ban_id);

  const existing: any = await state.readBanById(banId);
  if (!existing) return result.notFound("ban-not-found");
  if (existing.status !== "active") return result.conflict("ban-not-active");
  if (existing.permanent === true) {
    return result.noop("ban-already-permanent", {
        data: { ban: existing },
    });
  }

  const now: any = time.now();
  const next = await state.writeBan(
    Object.assign({}, existing, {
        permanent: true,
        level: "permanent",
        ends_at: "",
        promoted_at: now,
        bridge_applied_at: now,
        bridge_error: "",
    }),
  );

  await core.fanoutBanTargets(next || existing, "apply", {
      level: "permanent",
  });

  return result.ok("ban-promoted-to-permanent", { data: { ban: next } });
}

export { createManualBan, promoteBanPermanent, unbanBan };
