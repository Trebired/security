import { readResolvedSecurityConfigSync } from "./config.js";
import { readBanConfig } from "./ip-bans/config.js";
import {
  reconcileActiveBans,
  repairCorruptedBanTargets,
} from "./ip-bans/index.js";
import { resolveSecurityLogger } from "./logging.js";
import type { SecurityLoggerAdapter, SecurityLoggerInput } from "./logging.js";

type SecurityStartupMaintenanceOptions = {
  logger?: SecurityLoggerInput;
  loggerAdapter?: SecurityLoggerAdapter;
  reason?: string;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultCode(response: any, fallback: string): string {
  return response && response.status_code
  ? String(response.status_code)
  : fallback;
}

function resultMessage(response: any, fallback: string): string {
  return response && response.message ? String(response.message) : fallback;
}

function maintenanceEnabled() {
  const config = readResolvedSecurityConfigSync();
  const banConfig = readBanConfig();
  return Boolean(config.ipBans) && banConfig.enabled;
}

async function runStartupBanTargetRepair(
  options: SecurityStartupMaintenanceOptions,
) {
  const logger = resolveSecurityLogger(options.logger, options.loggerAdapter);
  try {
    const repairRes: any = await repairCorruptedBanTargets({
        reason: options.reason || "startup",
    });
    if (!repairRes || repairRes.ok !== true) {
      logger.warn("security.bans.repair", "startup ban target repair failed", {
          status_code: resultCode(repairRes, "ban-target-repair-failed"),
          message: resultMessage(repairRes, "Ban target repair failed."),
      });
    }
    return repairRes;
  } catch (error) {
    logger.warn("security.bans.repair", "startup ban target repair failed", {
        error: errorMessage(error),
    });
    return null;
  }
}

async function runStartupActiveBanReconciliation(
  options: SecurityStartupMaintenanceOptions,
) {
  const logger = resolveSecurityLogger(options.logger, options.loggerAdapter);
  try {
    const reconcileRes: any = await reconcileActiveBans({
        reason: options.reason || "startup",
    });
    if (!reconcileRes || reconcileRes.ok !== true) {
      logger.warn("security.bans", "startup reconciliation failed", {
          status_code: resultCode(reconcileRes, "reconcile-failed"),
          message: resultMessage(
            reconcileRes,
            "Security bans reconciliation failed.",
          ),
      });
    } else {
      logger.info("security.bans", "startup reconciliation complete", {
          reconciled_count:
          reconcileRes.data &&
            Number.isFinite(Number(reconcileRes.data.reconciled_count))
          ? Number(reconcileRes.data.reconciled_count)
          : 0,
          drift_count:
          reconcileRes.data &&
            Number.isFinite(Number(reconcileRes.data.drift_count))
          ? Number(reconcileRes.data.drift_count)
          : 0,
      });
    }
    return reconcileRes;
  } catch (error) {
    logger.warn("security.bans", "startup reconciliation failed", {
        error: errorMessage(error),
    });
    return null;
  }
}

async function runSecurityStartupMaintenance(
  options: SecurityStartupMaintenanceOptions = {},
) {
  if (!maintenanceEnabled()) {
    return {
      activeBanReconciliation: null,
      banTargetRepair: null,
      skipped: true,
    };
  }

  const banConfig = readBanConfig();
  const banTargetRepair = banConfig.startup_repair
  ? await runStartupBanTargetRepair(options)
  : null;
  const activeBanReconciliation = banConfig.startup_reconcile
  ? await runStartupActiveBanReconciliation(options)
  : null;

  return {
    activeBanReconciliation,
    banTargetRepair,
    skipped: false,
  };
}

export { runSecurityStartupMaintenance };
export type { SecurityStartupMaintenanceOptions };
