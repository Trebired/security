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

type SecurityConfig = {
  forVersion: string;
  systems?: SecuritySystemsConfig;
};

type LoadSecurityConfigOptions = {
  cwd?: string;
};

function defineConfig(config: SecurityConfig): SecurityConfig {
  return config;
}

async function loadSecurityConfig(
  options: LoadSecurityConfigOptions = {},
): Promise<SecurityConfig|null> {
  const { config } = await loadPackageConfig<SecurityConfig>(PACKAGE_NAME, { cwd: options.cwd });
  return config;
}

export { defineConfig, loadSecurityConfig };
export type {
  LoadSecurityConfigOptions,
  SecurityConfig,
  SecuritySystemConfig,
  SecuritySystemsConfig,
};
