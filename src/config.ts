import { loadPackageConfig } from "@trebired/utils";
import type { CorsOptions } from "./cors.js";
import type {
  ContentSecurityPolicyOptions,
  NonceMiddlewareOptions,
  SecurityHeadersOptions,
} from "./policy.js";
import type { RequestLogOptions } from "./request-log.js";

const PACKAGE_NAME = "security";

type SecuritySystemConfig<TOptions> = {
  enabled?: boolean;
  order?: number;
  options?: TOptions;
};

type SecuritySystemsConfig = {
  cors?: SecuritySystemConfig<CorsOptions>;
  csp?: SecuritySystemConfig<ContentSecurityPolicyOptions>;
  headers?: SecuritySystemConfig<SecurityHeadersOptions>;
  nonce?: SecuritySystemConfig<NonceMiddlewareOptions>;
  requestLog?: SecuritySystemConfig<RequestLogOptions>;
};

type SecurityIpBanLevelConfig = {
  key: string;
  suffix?: string;
  durationMs?: number;
  permanent?: boolean;
};

type SecurityIpBanStoreConfig = {
  databaseUrlEnv?: string;
  entity?: string;
  table?: string;
  serverEntity?: string;
  serverTable?: string;
  schema?: string;
};

type SecurityIpBanRequestConfig = {
  defaultBaseOrigin?: string;
  ipv6MappedPrefix?: string;
  trustedProxyHops?: number;
  trustedProxyHopsEnv?: string;
};

type SecurityIpBansConfig = {
  enabled?: boolean;
  activeStatuses?: string[];
  currentServerCacheMs?: number;
  historyStatuses?: string[];
  levels?: SecurityIpBanLevelConfig[];
  request?: SecurityIpBanRequestConfig;
  scoreThreshold?: number;
  serverHostKey?: string;
  serverHostKeyEnv?: string;
  startupReconcile?: boolean;
  startupRepair?: boolean;
  store?: SecurityIpBanStoreConfig;
  syncTimeoutMs?: number;
  windowMs?: number;
};

type SecurityConfig = {
  forVersion: string;
  ipBans?: SecurityIpBansConfig;
  systems?: SecuritySystemsConfig;
};

type LoadSecurityConfigOptions = {
  cwd?: string;
};

function defineConfig(config: SecurityConfig): SecurityConfig {
  return config;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = Object.freeze({
    forVersion: "0.1.0",
});

let cachedSecurityConfig: SecurityConfig | null | undefined;

async function loadSecurityConfig(
  options: LoadSecurityConfigOptions = {},
): Promise<SecurityConfig|null> {
  const { config } = await loadPackageConfig<SecurityConfig>(PACKAGE_NAME, { cwd: options.cwd });
  return config;
}

async function resolveSecurityConfig(
  options: LoadSecurityConfigOptions = {},
): Promise<SecurityConfig> {
  if (cachedSecurityConfig !== undefined && !options.cwd) {
    return cachedSecurityConfig || DEFAULT_SECURITY_CONFIG;
  }

  const config = await loadSecurityConfig(options);
  if (!options.cwd) cachedSecurityConfig = config || DEFAULT_SECURITY_CONFIG;
  return config || DEFAULT_SECURITY_CONFIG;
}

function readResolvedSecurityConfigSync(): SecurityConfig {
  return cachedSecurityConfig || DEFAULT_SECURITY_CONFIG;
}

function setResolvedSecurityConfig(config: SecurityConfig | null | undefined): SecurityConfig {
  cachedSecurityConfig = config || DEFAULT_SECURITY_CONFIG;
  return cachedSecurityConfig;
}

async function bootstrapSecurityConfig(
  options: LoadSecurityConfigOptions = {},
): Promise<SecurityConfig> {
  const config = await loadSecurityConfig(options);
  return setResolvedSecurityConfig(config);
}

export {
  bootstrapSecurityConfig,
  defineConfig,
  loadSecurityConfig,
  readResolvedSecurityConfigSync,
  resolveSecurityConfig,
  setResolvedSecurityConfig,
};
export type {
  LoadSecurityConfigOptions,
  SecurityConfig,
  SecurityIpBanLevelConfig,
  SecurityIpBanRequestConfig,
  SecurityIpBanStoreConfig,
  SecurityIpBansConfig,
  SecuritySystemConfig,
  SecuritySystemsConfig,
};
