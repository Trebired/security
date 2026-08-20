import { normalizers as normalize } from "@trebired/utils";
import *as result from "@trebired/result";

async function recordSecuritySyncResults(input: any, options: any) {
  const src = input && typeof input === "object" ? input : {};
  const serverId = normalize.toString(src.server_id);
  const rawItems = Array.isArray(src.results) ? src.results : [];
  const items =
  typeof options.filterResults === "function"
  ? options.filterResults(rawItems)
  : rawItems;
  const updated = [];
  const targets =
  serverId && typeof options.listTargets === "function"
  ? await options.listTargets(serverId)
  : [];
  const indexes =
  typeof options.indexTargets === "function"
  ? options.indexTargets(targets)
  : {};

  for (const entry of items) {
    const next =
    typeof options.applyResult === "function"
    ? await options.applyResult(entry, indexes)
    : null;
    if (!next) continue;

    updated.push(next);
    if (typeof options.rememberTarget === "function") {
      options.rememberTarget(indexes, next);
    }
  }

  return result.ok(options.messageCode || "security-sync-results-recorded", {
      data: { server_id: serverId, updated_count: updated.length },
  });
}

export { recordSecuritySyncResults };
