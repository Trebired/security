import os from "node:os";

import *as result from "@trebired/result";
import { normalizers as normalize } from "@trebired/utils";
import { readProcessEnvValue } from "@trebired/env";
import { readResolvedSecurityConfigSync } from "#t6wa0hlhh5fp";
import { readSecurityEntity, serverEntityName } from "./runtime.js";

function readCurrentHostKey(): string {
  const config = readResolvedSecurityConfigSync().ipBans || {};
  const configured = normalize.toString(config.serverHostKey);
  if (configured) return configured;

  const envName = normalize.toString(config.serverHostKeyEnv);
  const envValue = envName ? readProcessEnvValue(envName).trim() : "";
  return envValue || normalize.toString(os.hostname()) || "unknown-host";
}

function isCurrentServerRecord(server: any): boolean {
  const item = server && typeof server === "object" ? server : {};
  const hostKey = readCurrentHostKey();
  return [item.host_key, item.hostname, item.name].some(
    (value) => normalize.toString(value) === hostKey,
  );
}

async function listServersRaw(options: any = null): Promise<any[]> {
  const entity = await readSecurityEntity();
  const readRes = await entity.read.all(
    serverEntityName(),
    null,
    options || { mode: "raw" },
  );
  return readRes && readRes.ok === true && Array.isArray(readRes.data)
  ? readRes.data
  : [];
}

async function listEnrolledServers(): Promise<any[]> {
  return (await listServersRaw({ mode: "raw" })).filter((entry: any) => {
      return (
        normalize.toString(entry && entry.id) &&
          !normalize.toString(entry && entry.duplicate_of_server_id)
      );
  });
}

async function getCurrentServer(options: any = null) {
  const hostKey = readCurrentHostKey();
  const list = await listServersRaw(options || { mode: "raw" });
  const current =
  list.find((entry: any) => {
      if (normalize.toString(entry && entry.duplicate_of_server_id)) return false;
      return (
        normalize.toString(entry && entry.host_key) === hostKey ||
          normalize.toString(entry && entry.hostname) === hostKey ||
          normalize.toString(entry && entry.name) === hostKey
      );
  }) || null;

  return current
  ? result.ok("current-server-loaded", { data: { server: current, created: false } })
  : result.notFound("current-server-not-found", { data: { server: null } });
}

export { getCurrentServer, isCurrentServerRecord, listEnrolledServers };
