import { normalizers as normalize } from "@trebired/utils";
import *as time from "@trebired/utils";
import { readSecurityBanRecords, repairSecurityRecords } from "./runtime.js";
import { okResultDataObject } from "@trebired/utils";
import { withoutIpv6MappedPrefix } from "./request.js";
import { securityTargetWhere } from "./target-where.js";
import { resolveSecurityLogger } from "#3uz11hbjf7fs";
import {
  createBanRecord,
  createBanTargetRecord,
  isBanRow as modelIsBanRow,
  isBanTargetRow as modelIsBanTargetRow,
  normalizeBanRow,
  normalizeBanScope,
  normalizeBanTargetRow,
  normalizeOffenderRow,
  offenderIdOf,
} from "./models.js";

async function records() {
  return await readSecurityBanRecords();
}

const repairState: {
  done: boolean;
  promise: Promise<any>|null;
  summary: any;
} = {
  done: false,
  promise: null,
  summary: null,
};

function pickLimit(options: any) {
  const limit = Number(options && options.limit);
  return Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : undefined;
}

function banWhere(options: any = null) {
  const opts = options && typeof options === "object" ? options : {};
  const where: Record<string, string> = {};
  if (opts.server_id) where.server_id = normalize.toString(opts.server_id);
  if (opts.status) where.status = normalize.toString(opts.status);
  if (opts.ip) where.ip = withoutIpv6MappedPrefix(opts.ip);
  return where;
}

function banTargetWhere(options: any = null) {
  return securityTargetWhere(options, "ban_id");
}

async function readOffender(ip: unknown) {
  const targetIp: any = offenderIdOf(ip);
  const banRecords = await records();
  return targetIp
  ? okResultDataObject(await banRecords.offender.by({ ip: targetIp }))
  : null;
}

async function writeOffender(row: any) {
  const banRecords = await records();
  return okResultDataObject(
    await banRecords.offender.put(
      normalizeOffenderRow(row, row && row.ip ? row.ip : ""),
    ),
  );
}

async function clearOffenderWindow(ip: unknown) {
  const current: any = await readOffender(ip);
  if (!current) return null;
  return await writeOffender({
      ...current,
      last_event_at: time.now(),
      score: 0,
      updated_at: time.now(),
      window_started_at: "",
  });
}

async function readBanById(id: unknown) {
  const targetId: any = normalize.toString(id);
  const banRecords = await records();
  return targetId
  ? okResultDataObject(await banRecords.ban.byId(targetId))
  : null;
}

async function writeBan(row: any) {
  const banRecords = await records();
  return okResultDataObject(await banRecords.ban.put(normalizeBanRow(row)));
}

async function listBans(options: any = null) {
  const banRecords = await records();
  const response = await banRecords.ban.list({
      limit: pickLimit(options),
      where: banWhere(options),
  });
  return response && response.ok === true && Array.isArray(response.data)
  ? response.data
  : [];
}

async function listBansByServer(serverId: unknown, options: any = null) {
  const targetServerId = normalize.toString(serverId);
  const list = await listBans(options);
  if (!targetServerId) return list;
  return list.filter((entry: any) => {
      return (
        normalizeBanScope(entry && entry.scope) === "all" ||
          normalize.toString(entry && entry.server_id) === targetServerId
      );
  });
}

async function readActiveBanByIp(ip: unknown, serverId = "") {
  const targetIp: any = withoutIpv6MappedPrefix(ip);
  if (!targetIp) return null;
  const targetServerId = normalize.toString(serverId);
  const list = await listBans({ ip: targetIp, limit: 20, status: "active" });
  if (!targetServerId) return list[0] || null;
  return (
    list.find((entry: any) => {
        return (
          normalizeBanScope(entry && entry.scope) === "all" ||
            normalize.toString(entry && entry.server_id) === targetServerId
        );
    }) || null
  );
}

async function readBanTargetByBanAndServer(banId: unknown, serverId: unknown) {
  const targetBanId: any = normalize.toString(banId);
  const targetServerId: any = normalize.toString(serverId);
  const banRecords = await records();
  return targetBanId && targetServerId
  ? okResultDataObject(
    await banRecords.banTarget.by({
        ban_id: targetBanId,
        server_id: targetServerId,
    }),
  )
  : null;
}

async function readBanTargetById(id: unknown) {
  const targetId: any = normalize.toString(id);
  const banRecords = await records();
  return targetId
  ? okResultDataObject(await banRecords.banTarget.byId(targetId))
  : null;
}

async function writeBanTarget(row: any) {
  const banRecords = await records();
  return okResultDataObject(
    await banRecords.banTarget.put(normalizeBanTargetRow(row)),
  );
}

async function upsertBanTarget(row: any) {
  const banRecords = await records();
  return okResultDataObject(
    await banRecords.banTarget.upsertUnique(normalizeBanTargetRow(row)),
  );
}

async function listBanTargets(options: any = null) {
  const banRecords = await records();
  const response = await banRecords.banTarget.list({
      limit: pickLimit(options),
      where: banTargetWhere(options),
  });
  return response && response.ok === true && Array.isArray(response.data)
  ? response.data
  : [];
}

function toRepairResponse(summary: any) {
  const data = {
    deleted_duplicate_count:
    Number(summary && summary.deletedDuplicateCount) || 0,
    deleted_invalid_count: Number(summary && summary.deletedOrphanCount) || 0,
    deleted_total: Number(summary && summary.deletedTotal) || 0,
    remaining_target_count: Number(summary && summary.remainingChildCount) || 0,
    scanned_ban_count: Number(summary && summary.scannedParentCount) || 0,
    scanned_target_count: Number(summary && summary.scannedChildCount) || 0,
    skipped: Boolean(summary && summary.skipped),
    valid_ban_count: Number(summary && summary.scannedParentCount) || 0,
  };
  return { data, message: "ban-target-repair-complete", ok: true };
}

function logRepairSummary(summary: any) {
  const runtimeLog = resolveSecurityLogger(undefined);
  if (runtimeLog && typeof runtimeLog.info === "function") {
    runtimeLog.info(
      "security.bans.repair",
      "ban target repair complete",
      summary,
    );
  }
}

function failedRepairResult(error: any) {
  repairState.done = false;
  repairState.promise = null;
  repairState.summary = null;
  return {
    data: null,
    status_code: "ban-target-repair-failed",
    message: "ban-target-repair-failed",
    ok: false,
  };
}

async function runBanTargetRepair() {
  const banRecords = await records();
  const summary = await repairSecurityRecords({
      child: banRecords.banTarget,
      childParentKey: "ban_id",
      freshnessFields: [
        "recorded_at",
        "last_seen_at",
        "applied_at",
        "removed_at",
      ],
      keep: "freshest",
      parent: banRecords.ban,
      uniqueBy: ["ban_id", "server_id"],
  });
  repairState.done = true;
  repairState.summary = summary;
  logRepairSummary(summary);
  return toRepairResponse(summary);
}

async function repairCorruptedBanTargets(options: any = null) {
  const force = Boolean(
    options && typeof options === "object" && options.force === true,
  );
  if (!force && repairState.done) {
    return toRepairResponse({ ...(repairState.summary || {}), skipped: true });
  }
  if (!force && repairState.promise) return await repairState.promise;
  repairState.promise = Promise.resolve()
  .then(runBanTargetRepair)
  .catch (failedRepairResult);
  const response = await repairState.promise;
  repairState.promise = null;
  return response;
}

const isBanRow = modelIsBanRow;
const isBanTargetRow = modelIsBanTargetRow;

export {
  clearOffenderWindow,
  createBanRecord,
  createBanTargetRecord,
  isBanRow,
  isBanTargetRow,
  listBanTargets,
  listBans,
  listBansByServer,
  normalizeBanRow,
  normalizeBanTargetRow,
  normalizeOffenderRow,
  offenderIdOf,
  readActiveBanByIp,
  readBanById,
  readBanTargetByBanAndServer,
  readBanTargetById,
  readOffender,
  repairCorruptedBanTargets,
  upsertBanTarget,
  writeBan,
  writeBanTarget,
  writeOffender,
};
