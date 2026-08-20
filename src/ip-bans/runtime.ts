import { readProcessEnvValue } from "@trebired/env";
import { createStoreApplicationRuntime } from "@trebired/store";
import { normalizers as normalize } from "@trebired/utils";
import { readResolvedSecurityConfigSync, resolveSecurityConfig } from "#t6wa0hlhh5fp";
import { resolveSecurityLogger } from "#3uz11hbjf7fs";
import {
  normalizeBanRow,
  normalizeBanTargetRow,
  normalizeOffenderRow,
} from "./models.js";

type SecurityStoreRuntime = ReturnType<typeof createStoreApplicationRuntime>;

const DEFAULT_FIREWALL_ENTITY = "firewall";
const DEFAULT_FIREWALL_TABLE = "firewall";
const DEFAULT_SERVER_ENTITY = "servers";
const DEFAULT_SERVER_TABLE = "servers";

let runtimeKey = "";
let runtime: SecurityStoreRuntime | null = null;
let bootPromise: Promise<unknown>|null = null;
let banRecordViews: any = null;

function ipBanStoreConfig() {
  return readResolvedSecurityConfigSync().ipBans?.store || {};
}

function securityEntityName(): string {
  return normalize.toString(ipBanStoreConfig().entity) || DEFAULT_FIREWALL_ENTITY;
}

function serverEntityName(): string {
  return normalize.toString(ipBanStoreConfig().serverEntity) || DEFAULT_SERVER_ENTITY;
}

function databaseUrl(): string {
  const envName =
  normalize.toString(ipBanStoreConfig().databaseUrlEnv) || "DATABASE_URL";
  return readProcessEnvValue(envName).trim();
}

function nextRuntimeKey(): string {
  const store = ipBanStoreConfig();
  return JSON.stringify({
      databaseUrl: databaseUrl(),
      entity: securityEntityName(),
      schema: normalize.toString(store.schema) || "public",
      serverEntity: serverEntityName(),
      serverTable: normalize.toString(store.serverTable) || DEFAULT_SERVER_TABLE,
      table: normalize.toString(store.table) || DEFAULT_FIREWALL_TABLE,
  });
}

function createSecurityStoreRuntime(): SecurityStoreRuntime {
  const store = ipBanStoreConfig();
  const firewallEntity = securityEntityName();
  const serverEntity = serverEntityName();
  return createStoreApplicationRuntime({
      entities: {
        [firewallEntity]: {
          aliases: firewallEntity === "firewall" ? ["firewalls"] : [],
          modes: { view: {} },
          required: [],
          storage: "postgres",
          table: normalize.toString(store.table) || DEFAULT_FIREWALL_TABLE,
        },
        [serverEntity]: {
          aliases: serverEntity === "servers" ? ["server"] : [],
          modes: { view: {} },
          required: [],
          storage: "postgres",
          table: normalize.toString(store.serverTable) || DEFAULT_SERVER_TABLE,
        },
      },
      env: {
        DATABASE_URL: databaseUrl(),
      },
      logger: resolveSecurityLogger(undefined),
      postgres: {
        schema: normalize.toString(store.schema) || "public",
      },
    } as any);
}

async function readSecurityStore(): Promise<SecurityStoreRuntime> {
  await resolveSecurityConfig();
  const key = nextRuntimeKey();
  if (!runtime || runtimeKey !== key) {
    runtimeKey = key;
    runtime = createSecurityStoreRuntime();
    bootPromise = null;
    banRecordViews = null;
  }

  if (!bootPromise) bootPromise = runtime.onBoot();
  await bootPromise;
  return runtime;
}

async function readSecurityEntity() {
  return (await readSecurityStore()).entity;
}

async function readSecurityBanRecords() {
  const store = await readSecurityStore();
  if (!banRecordViews) {
    banRecordViews = store.records(securityEntityName(), {
        ban: {
          kind: "ban",
          normalize: normalizeBanRow,
          sort: ["recorded_at:desc"],
        },
        banTarget: {
          kind: "ban_target",
          normalize: normalizeBanTargetRow,
          sort: ["recorded_at:desc"],
          uniqueBy: ["ban_id", "server_id"],
        },
        offender: {
          kind: "offender",
          normalize: (row: any) =>
          normalizeOffenderRow(row, row && row.ip ? row.ip : ""),
        },
    });
  }
  return banRecordViews;
}

async function repairSecurityRecords(input: any) {
  const store = await readSecurityStore();
  return await store.repair.orphansAndDuplicates(input);
}

export {
  readSecurityBanRecords,
  readSecurityEntity,
  repairSecurityRecords,
  securityEntityName,
  serverEntityName,
};
