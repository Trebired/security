import { readProcessEnvValue } from "@trebired/env";
import { normalizers as normalize } from "@trebired/utils";
import { readResolvedSecurityConfigSync } from "#t6wa0hlhh5fp";

const DEFAULT_IPV6_MAPPED_PREFIX = "::ffff:";
const DEFAULT_BASE_ORIGIN = "http://localhost";

function ipBanRequestConfig() {
  return readResolvedSecurityConfigSync().ipBans?.request || {};
}

function getHeader(req: any, name: string): string {
  if (!req || typeof req.get !== "function") return "";
  return normalize.toString(req.get(name));
}

function trustedProxyHops(): number {
  const config = ipBanRequestConfig();
  const configured = Number(config.trustedProxyHops);
  if (Number.isInteger(configured) && configured >= 0) return configured;

  const envName = normalize.toString(config.trustedProxyHopsEnv) || "TRUSTED_PROXY_HOPS";
  const raw = Number(readProcessEnvValue(envName).trim());
  if (Number.isInteger(raw) && raw >= 0) return raw;
  return 1;
}

function ipv6MappedPrefix(): string {
  return normalize.toString(ipBanRequestConfig().ipv6MappedPrefix) ||
    DEFAULT_IPV6_MAPPED_PREFIX;
}

function withoutIpv6MappedPrefix(value: unknown): string {
  const ip = normalize.toString(value);
  const prefix = ipv6MappedPrefix();
  return prefix && ip.startsWith(prefix) ? ip.slice(prefix.length) : ip;
}

function getSocketIp(req: any): string {
  return withoutIpv6MappedPrefix(
    req &&
      (req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress),
  );
}

function getClientIp(req: any): string {
  const hops = trustedProxyHops();
  const forwarded = getHeader(req, "x-forwarded-for");
  if (hops > 0 && forwarded) {
    const entries = forwarded
    .split(",")
    .map((entry) => normalize.toString(entry).trim())
    .filter(Boolean);
    if (entries.length >= hops) {
      const picked = entries[entries.length - hops];
      if (picked) return withoutIpv6MappedPrefix(picked);
    }
  }

  return getSocketIp(req);
}

function getUserAgent(req: any): string {
  return getHeader(req, "user-agent");
}

function defaultBaseOrigin(): string {
  return normalize.toString(ipBanRequestConfig().defaultBaseOrigin) ||
    DEFAULT_BASE_ORIGIN;
}

function normalizePathname(value: unknown): string {
  const raw = normalize.toString(value).trim();
  if (!raw) return "/";

  let pathname = raw;
  try {
    pathname = new URL(raw, defaultBaseOrigin()).pathname || raw;
  } catch {}

  try {
    pathname = decodeURIComponent(pathname);
  } catch {}

  pathname = pathname.split("?")[0].split("#")[0];
  pathname = pathname.replace(/\/{2,}/g, "/");

  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/g, "");

  return pathname || "/";
}

function getPathname(req: any): string {
  return normalizePathname(req && (req.originalUrl || req.url));
}

export {
  getClientIp,
  getPathname,
  getUserAgent,
  normalizePathname,
  trustedProxyHops,
  withoutIpv6MappedPrefix,
};
