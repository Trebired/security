import { normalizers as normalize } from "@trebired/utils";

function securityTargetWhere(options: any = null, relatedIdKey: string) {
  const opts = options && typeof options === "object" ? options : {};
  const where: Record<string, string> = {};
  if (opts.server_id) where.server_id = normalize.toString(opts.server_id);
  if (opts[relatedIdKey])
  where[relatedIdKey] = normalize.toString(opts[relatedIdKey]);
  if (opts.status) where.status = normalize.toString(opts.status);
  if (opts.desired_state)
  where.desired_state = normalize.toString(opts.desired_state);
  return where;
}

export { securityTargetWhere };
