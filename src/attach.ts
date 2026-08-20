import { logPackageInitialized } from "@package/logger-adapter";
import { attachCorsMiddleware } from "./cors.js";
import {
  attachContentSecurityPolicyMiddleware,
  attachNonceMiddleware,
  attachSecurityHeadersMiddleware,
} from "./policy.js";
import { attachRequestLogger } from "./request-log.js";
import { bootstrapSecurityConfig, setResolvedSecurityConfig } from "./config.js";
import type { SecurityConfig, SecuritySystemConfig, SecuritySystemsConfig } from "./config.js";
import {
  SECURITY_PACKAGE_SOURCE,
  setSecurityRuntimeLogger,
} from "./logging.js";
import type { SecurityLoggerAdapter, SecurityLoggerInput } from "./logging.js";
import { runSecurityStartupMaintenance } from "./startup.js";

const DEFAULT_SYSTEM_ORDER: Record<keyof SecuritySystemsConfig, number> = {
  nonce: 0,
  headers: 10,
  csp: 20,
  cors: 30,
  requestLog: 40,
};

const SYSTEM_ATTACHERS: Record<keyof SecuritySystemsConfig, (app:unknown, options:any)=>void> = {
  nonce: attachNonceMiddleware,
  headers: attachSecurityHeadersMiddleware,
  csp: attachContentSecurityPolicyMiddleware,
  cors: attachCorsMiddleware,
  requestLog: attachRequestLogger,
};

type AttachSecurityOptions = {
  config?: SecurityConfig | null;
  cwd?: string;
  logger?: SecurityLoggerInput;
  loggerAdapter?: SecurityLoggerAdapter;
  startupMaintenance?: boolean;
};

function orderedSystemNames(systems: SecuritySystemsConfig): Array<keyof SecuritySystemsConfig> {
  const names = Object.keys(DEFAULT_SYSTEM_ORDER) as Array<keyof SecuritySystemsConfig>;
  return names
  .filter((name) => (systems[name] as SecuritySystemConfig<unknown>|undefined)?.enabled !== false)
  .sort((left, right) => resolveOrder(systems, left) - resolveOrder(systems, right));
}

function resolveOrder(systems: SecuritySystemsConfig, name: keyof SecuritySystemsConfig): number {
  const configured = (systems[name] as SecuritySystemConfig<unknown>|undefined)?.order;
  return typeof configured === "number" ? configured : DEFAULT_SYSTEM_ORDER[name];
}

async function attachSecurity(app: unknown, options: AttachSecurityOptions = {}): Promise<void> {
  setSecurityRuntimeLogger(options.logger, options.loggerAdapter);
  const config = options.config !== undefined
  ? options.config
  : await bootstrapSecurityConfig({ cwd: options.cwd });
  if (options.config !== undefined) setResolvedSecurityConfig(config);
  const systems = config?.systems || {};

  for (const name of orderedSystemNames(systems)) {
    const systemOptions = (systems[name] as SecuritySystemConfig<unknown>|undefined)?.options || {};
    SYSTEM_ATTACHERS[name](app, systemOptions);
  }

  logPackageInitialized({
      adapter: options.loggerAdapter || undefined,
      defaultLogger: false,
      fallback: "noop",
      logger: options.logger || undefined,
      source: SECURITY_PACKAGE_SOURCE,
  });
  if (options.startupMaintenance !== false) {
    await runSecurityStartupMaintenance({
        logger: options.logger,
        loggerAdapter: options.loggerAdapter,
    });
  }
}

export { attachSecurity };
export type { AttachSecurityOptions };
