import { generateId } from "@trebired/utils";
import { normalizers as normalize } from "@trebired/utils";
import *as time from "@trebired/utils";
import { withoutIpv6MappedPrefix } from "./request.js";

function kindOf(row: any): string {
  return normalize.toString(row && row.kind);
}

function isBanRow(row: any): boolean {
  return kindOf(row) === "ban";
}

function isBanTargetRow(row: any): boolean {
  return kindOf(row) === "ban_target";
}

function offenderIdOf(ip: unknown): string {
  return withoutIpv6MappedPrefix(ip);
}

function normalizeBanScope(value: unknown): string {
  return normalize.toString(value) === "all" ? "all" : "server";
}

function baseOffenderRow(ip: unknown, patch: any = null) {
  const src = patch && typeof patch === "object" ? patch : {};
  const recordedAt = time.isoOrEmpty(src.recorded_at) || time.now();
  return {
    kind: "offender",
    id: /^\d+$/.test(normalize.toString(src.id))
    ? normalize.toString(src.id)
    : generateId("numeric"),
    ip: offenderIdOf(ip),
    server_id: normalize.toString(src.server_id),
    latest_user_agent: normalize.toString(src.latest_user_agent),
    latest_reason: normalize.toString(src.latest_reason),
    latest_event_kind: normalize.toString(src.latest_event_kind),
    latest_path: normalize.toString(src.latest_path),
    score: 0,
    window_started_at: "",
    last_event_at: "",
    ban_count: 0,
    active_ban_id: normalize.toString(src.active_ban_id),
    recorded_at: recordedAt,
    updated_at: time.isoOrEmpty(src.updated_at) || recordedAt,
  };
}

function normalizeOffenderRow(row: any, ip = "") {
  const src = row && typeof row === "object" ? row : {};
  const base = baseOffenderRow(src.ip || ip, src);
  return Object.assign(base, src, {
      id: /^\d+$/.test(normalize.toString(src.id))
      ? normalize.toString(src.id)
      : base.id,
      ip: offenderIdOf(src.ip || ip),
      server_id: normalize.toString(src.server_id),
      latest_user_agent: normalize.toString(src.latest_user_agent),
      latest_reason: normalize.toString(src.latest_reason),
      latest_event_kind: normalize.toString(src.latest_event_kind),
      latest_path: normalize.toString(src.latest_path),
      score: Math.max(0, normalize.toFiniteNumber(src.score, 0)),
      window_started_at: time.isoOrEmpty(src.window_started_at),
      last_event_at: time.isoOrEmpty(src.last_event_at),
      ban_count: Math.max(0, normalize.toFiniteNumber(src.ban_count, 0)),
      active_ban_id: normalize.toString(src.active_ban_id),
      recorded_at: time.isoOrEmpty(src.recorded_at) || base.recorded_at,
      updated_at: time.isoOrEmpty(src.updated_at) || time.now(),
  });
}

function createBanRecord(patch: any = null) {
  const src = patch && typeof patch === "object" ? patch : {};
  const recordedAt = time.isoOrEmpty(src.recorded_at) || time.now();
  return normalizeBanRow(
    Object.assign(
      {
        kind: "ban",
        id: generateId("numeric"),
        ip: "",
        scope: "server",
        server_id: "",
        reason: "",
        event_kind: "",
        level: "",
        permanent: false,
        status: "active",
        recorded_at: recordedAt,
        started_at: recordedAt,
        ends_at: "",
        promoted_at: "",
        unbanned_at: "",
        unbanned_by: "",
        latest_user_agent: "",
        request_path: "",
        bridge_applied_at: "",
        bridge_removed_at: "",
        bridge_error: "",
      },
      src,
    ),
  );
}

function baseBanRow(patch: any = null) {
  const src = patch && typeof patch === "object" ? patch : {};
  const recordedAt = time.isoOrEmpty(src.recorded_at) || time.now();
  return {
    kind: "ban",
    id: normalize.toString(src.id) || generateId("numeric"),
    ip: withoutIpv6MappedPrefix(src.ip),
    scope: normalizeBanScope(src.scope),
    server_id: normalize.toString(src.server_id),
    reason: normalize.toString(src.reason),
    event_kind: normalize.toString(src.event_kind),
    level: normalize.toString(src.level),
    permanent: src.permanent === true,
    status: normalize.toString(src.status) || "active",
    recorded_at: recordedAt,
    started_at: time.isoOrEmpty(src.started_at) || recordedAt,
    ends_at: time.isoOrEmpty(src.ends_at),
    promoted_at: time.isoOrEmpty(src.promoted_at),
    unbanned_at: time.isoOrEmpty(src.unbanned_at),
    unbanned_by: normalize.toString(src.unbanned_by),
    latest_user_agent: normalize.toString(src.latest_user_agent),
    request_path: normalize.toString(src.request_path),
    bridge_applied_at: time.isoOrEmpty(src.bridge_applied_at),
    bridge_removed_at: time.isoOrEmpty(src.bridge_removed_at),
    bridge_error: normalize.toString(src.bridge_error),
  };
}

function normalizeBanRow(row: any) {
  const src = row && typeof row === "object" ? row : {};
  const base: any = baseBanRow(src);
  return Object.assign(base, src, {
      kind: "ban",
      id: normalize.toString(src.id) || base.id,
      ip: withoutIpv6MappedPrefix(src.ip),
      scope: normalizeBanScope(src.scope),
      server_id: normalize.toString(src.server_id),
      reason: normalize.toString(src.reason),
      event_kind: normalize.toString(src.event_kind),
      level: normalize.toString(src.level),
      permanent: src.permanent === true,
      status: normalize.toString(src.status) || "active",
      recorded_at: time.isoOrEmpty(src.recorded_at) || base.recorded_at,
      started_at: time.isoOrEmpty(src.started_at) || base.started_at,
      ends_at: time.isoOrEmpty(src.ends_at),
      promoted_at: time.isoOrEmpty(src.promoted_at),
      unbanned_at: time.isoOrEmpty(src.unbanned_at),
      unbanned_by: normalize.toString(src.unbanned_by),
      latest_user_agent: normalize.toString(src.latest_user_agent),
      request_path: normalize.toString(src.request_path),
      bridge_applied_at: time.isoOrEmpty(src.bridge_applied_at),
      bridge_removed_at: time.isoOrEmpty(src.bridge_removed_at),
      bridge_error: normalize.toString(src.bridge_error),
  });
}

function createBanTargetRecord(patch: any = null) {
  const src = patch && typeof patch === "object" ? patch : {};
  const recordedAt = time.isoOrEmpty(src.recorded_at) || time.now();
  return normalizeBanTargetRow(
    Object.assign(
      {
        kind: "ban_target",
        id: generateId("numeric"),
        ban_id: "",
        server_id: "",
        desired_state: "apply",
        level: "",
        status: "pending",
        recorded_at: recordedAt,
        applied_at: "",
        removed_at: "",
        last_error: "",
        last_seen_at: "",
      },
      src,
    ),
  );
}

function normalizeBanTargetRow(row: any) {
  const src = row && typeof row === "object" ? row : {};
  const recordedAt = time.isoOrEmpty(src.recorded_at) || time.now();
  return {
    kind: "ban_target",
    id: normalize.toString(src.id) || generateId("numeric"),
    ban_id: normalize.toString(src.ban_id),
    server_id: normalize.toString(src.server_id),
    desired_state: normalize.toString(src.desired_state) || "apply",
    level: normalize.toString(src.level),
    status: normalize.toString(src.status) || "pending",
    recorded_at: recordedAt,
    applied_at: time.isoOrEmpty(src.applied_at),
    removed_at: time.isoOrEmpty(src.removed_at),
    last_error: normalize.toString(src.last_error),
    last_seen_at: time.isoOrEmpty(src.last_seen_at),
  };
}

export {
  createBanRecord,
  createBanTargetRecord,
  isBanRow,
  isBanTargetRow,
  normalizeBanRow,
  normalizeBanScope,
  normalizeBanTargetRow,
  normalizeOffenderRow,
  offenderIdOf,
};
