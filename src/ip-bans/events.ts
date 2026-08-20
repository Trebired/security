import *as result from "@trebired/result";
import { normalizers as normalize } from "@trebired/utils";
import *as time from "@trebired/utils";
import *as state from "./state.js";
import { withoutIpv6MappedPrefix } from "./request.js";
import {
  getBanLevelSpec,
  getNextBanLevel,
  scoreThreshold,
  banWindowMs,
} from "./spec.js";
import *as core from "./core.js";

async function normalizeSecurityEventInput(input: any) {
  const src = input && typeof input === "object" ? input : {};
  const ip: any = withoutIpv6MappedPrefix(src.ip);
  const serverId =
  normalize.toString(src.server_id) || (await core.resolveCurrentServerId());

  return {
    ip,
    serverId,
    scope: normalize.toString(src.scope) === "all" ? "all" : "server",
    reason: normalize.toString(src.reason),
    eventKind: normalize.toString(src.kind),
    latestUserAgent: normalize.toString(src.user_agent),
    latestPath: normalize.toString(src.path),
    weight: Math.max(0, Number(src.weight) || 0),
    countsTowardBan: src.counts_toward_ban === true,
  };
}

function missingIpResult() {
  return result.ok("missing-ip", {
      data: { recorded: false, reason: "missing-ip" },
  });
}

async function updateAlreadyBannedOffender(event: any, now: any) {
  const currentBan: any = await core.getActiveBanForIp(
    event.ip,
    event.serverId,
  );
  if (!currentBan) return null;

  await core.updateOffenderFromBan(currentBan, {
      latest_reason: event.reason,
      latest_event_kind: event.eventKind,
      latest_path: event.latestPath,
      latest_user_agent: event.latestUserAgent,
      last_event_at: now,
      updated_at: now,
  });

  return result.ok("security-event-recorded", {
      data: { recorded: true, banned: true, ban: currentBan },
  });
}

function baseOffenderForEvent(event: any, now: any) {
  return state.normalizeOffenderRow(
    {
      ip: event.ip,
      server_id: event.serverId,
      recorded_at: now,
      updated_at: now,
    },
    event.ip,
  );
}

function buildNextOffender(event: any, offender: any, now: any) {
  const windowStartedAtMs: any = time.toDateMs(offender.window_started_at);
  const windowExpired =
  !(windowStartedAtMs > 0) || windowStartedAtMs + banWindowMs() <= time.nowMs();
  const scoreBase = windowExpired ? 0 : offender.score;
  const nextScore = event.countsTowardBan
  ? scoreBase + event.weight
  : offender.score;

  return Object.assign({}, offender, {
      ip: event.ip,
      server_id: event.serverId || offender.server_id,
      latest_reason: event.reason,
      latest_event_kind: event.eventKind,
      latest_path: event.latestPath,
      latest_user_agent: event.latestUserAgent,
      last_event_at: now,
      updated_at: now,
      score: nextScore,
      window_started_at: nextWindowStart(
        event.countsTowardBan,
        windowExpired,
        offender,
        now,
      ),
      active_ban_id: "",
  });
}

function nextWindowStart(
  countsTowardBan: any,
  windowExpired: any,
  offender: any,
  now: any,
) {
  if (!countsTowardBan) return offender.window_started_at;
  if (windowExpired) return now;
  return offender.window_started_at || now;
}

async function saveUnbannedEvent(event: any, nextOffender: any) {
  if (event.countsTowardBan && nextOffender.score >= scoreThreshold())
  return null;

  await state.writeOffender(nextOffender);
  return result.ok("security-event-recorded", {
      data: { recorded: true, banned: false, score: nextOffender.score },
  });
}

async function createBanForSecurityEvent(
  event: any,
  nextOffender: any,
  now: any,
) {
  const level: any = getNextBanLevel(nextOffender.ban_count);
  const levelSpec: any = getBanLevelSpec(level);

  const appliedBan = await state.writeBan(
    state.createBanRecord({
        ip: event.ip,
        scope: event.scope,
        server_id: event.scope === "server" ? event.serverId : "",
        reason: event.reason,
        event_kind: event.eventKind,
        level: levelSpec.key,
        permanent: levelSpec.permanent === true,
        status: "active",
        recorded_at: now,
        started_at: now,
        ends_at: levelSpec.permanent
        ? ""
        : new Date(time.nowMs() + levelSpec.duration_ms).toISOString(),
        latest_user_agent: event.latestUserAgent,
        request_path: event.latestPath,
        bridge_applied_at: now,
        bridge_error: "",
    }),
  );

  await core.fanoutBanTargets(appliedBan, "apply");
  return appliedBan;
}

async function saveBannedEvent(nextOffender: any, appliedBan: any, now: any) {
  const savedOffender = await state.writeOffender(
    Object.assign({}, nextOffender, {
        active_ban_id: appliedBan && appliedBan.id ? appliedBan.id : "",
        score: 0,
        window_started_at: "",
        last_event_at: now,
        updated_at: now,
        ban_count: nextOffender.ban_count + 1,
    }),
  );

  return result.ok("security-event-recorded", {
      data: {
        recorded: true,
        banned: true,
        offender: savedOffender,
        ban: appliedBan,
      },
  });
}

async function recordSecurityEvent(input: any) {
  const event = await normalizeSecurityEventInput(input);

  if (!event.ip) {
    return missingIpResult();
  }

  const now: any = time.now();
  const alreadyBanned = await updateAlreadyBannedOffender(event, now);
  if (alreadyBanned) return alreadyBanned;

  const existingOffender: any = await state.readOffender(event.ip);
  const offender = existingOffender || baseOffenderForEvent(event, now);
  const nextOffender = buildNextOffender(event, offender, now);
  const unbannedResult = await saveUnbannedEvent(event, nextOffender);
  if (unbannedResult) return unbannedResult;

  const appliedBan = await createBanForSecurityEvent(event, nextOffender, now);
  return await saveBannedEvent(nextOffender, appliedBan, now);
}

async function recordAgentSecurityEvents(input: any = null) {
  const src = input && typeof input === "object" ? input : {};
  const serverId: any = normalize.toString(src.server_id);
  const items = Array.isArray(src.events) ? src.events : [];
  const recorded = [];

  for (const entry of items) {
    const rr = await recordSecurityEvent({
        ip: entry && entry.ip,
        user_agent: entry && entry.user_agent,
        path: entry && entry.path,
        kind: entry && entry.kind,
        reason: entry && entry.reason,
        weight: entry && entry.weight,
        counts_toward_ban: entry && entry.counts_toward_ban === true,
        server_id: serverId,
    });
    recorded.push(rr);
  }

  return result.ok("agent-security-events-recorded", {
      data: { server_id: serverId, recorded_count: recorded.length },
  });
}

export { recordAgentSecurityEvents, recordSecurityEvent };
