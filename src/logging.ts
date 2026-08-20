import {
  resolveLogger,
  type LoggerAdapterLogger,
  type LoggerAdapterWriter,
  type NormalizedLoggerAdapter,
} from "@package/logger-adapter";

type SecurityLoggerInput = LoggerAdapterLogger | null | undefined;
type SecurityLoggerAdapter = LoggerAdapterWriter | null | undefined;

const SECURITY_PACKAGE_SOURCE = "@trebired/security";
let activeLogger: SecurityLoggerInput = null;
let activeLoggerAdapter: SecurityLoggerAdapter = null;

function setSecurityRuntimeLogger(
  logger: SecurityLoggerInput,
  adapter?: SecurityLoggerAdapter,
): void {
  activeLogger = logger || null;
  activeLoggerAdapter = adapter || null;
}

function resolveSecurityLogger(
  logger: SecurityLoggerInput,
  adapter?: SecurityLoggerAdapter,
): NormalizedLoggerAdapter {
  return resolveLogger({
      adapter: adapter || activeLoggerAdapter || undefined,
      defaultLogger: false,
      fallback: "noop",
      logger: logger || activeLogger || undefined,
      source: SECURITY_PACKAGE_SOURCE,
  });
}

export {
  resolveSecurityLogger,
  SECURITY_PACKAGE_SOURCE,
  setSecurityRuntimeLogger,
};
export type { SecurityLoggerAdapter, SecurityLoggerInput };
