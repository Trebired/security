import { resolveLogger, type LoggerAdapterLogger, type NormalizedLoggerAdapter } from "@package/logger-adapter";

type SecurityLoggerInput = LoggerAdapterLogger | null | undefined;

const SECURITY_PACKAGE_SOURCE = "@trebired/security";

function resolveSecurityLogger(logger: SecurityLoggerInput): NormalizedLoggerAdapter {
  return resolveLogger({
      defaultLogger: false,
      fallback: "noop",
      logger: logger || undefined,
      source: SECURITY_PACKAGE_SOURCE,
  });
}

export { resolveSecurityLogger, SECURITY_PACKAGE_SOURCE };
export type { SecurityLoggerInput };
