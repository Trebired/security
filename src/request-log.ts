import { resolveSecurityLogger, type SecurityLoggerInput } from "./logging.js";

type RequestLogOptions = {
  browserProbe404Prefixes?: false | readonly string[];
  logger?: SecurityLoggerInput;
  readLogger?: () => SecurityLoggerInput;
  trustProxy?: unknown;
};

type RequestContext = {
  ip: string;
  method: string;
  startedAt: number;
  url: string;
};

const attachedRequestLogApps = new WeakSet<object>();
const STATIC_ASSET_PREFIX_RE = /^\/(?:css|js)(?:\/|$)/i;
const STATIC_ASSET_FILE_RE =
/\.(?:avif|css|gif|ico|jpe?g|js|json|mjs|png|svg|ttf|webp|woff2?)(?:$|[?#])/i;
const SOURCE_MAP_FILE_RE = /\.map(?:$|[?#])/i;
const DEFAULT_BROWSER_PROBE_404_PREFIXES = ["/.well-known/appspecific/"];

function text(value: unknown) {
  return String(value == null ? "" : value).trim();
}

function pickClientIp(req: any): string {
  const forwardedFor = text(req?.headers?.["x-forwarded-for"]);
  if (forwardedFor) return text(forwardedFor.split(",")[0]);

  const realIp = text(req?.headers?.["x-real-ip"]);
  if (realIp) return realIp;

  return text(req?.ip || req?.connection?.remoteAddress);
}

function requestLogContext(req: any): RequestContext {
  return {
    ip: pickClientIp(req),
    method: text(req?.method).toUpperCase(),
    startedAt: performance.now(),
    url: text(req?.originalUrl || req?.url),
  };
}

function requestLogPath(ctx: RequestContext) {
  return ctx.url.split(/[?#]/)[0] || "/";
}

function isStaticAssetPath(pathname: string) {
  return (
    STATIC_ASSET_PREFIX_RE.test(pathname) ||
      pathname === "/favicon.svg" ||
      pathname === "/favicon.ico" ||
      STATIC_ASSET_FILE_RE.test(pathname)
  );
}

function browserProbePrefixes(options: RequestLogOptions) {
  if (options.browserProbe404Prefixes === false) return [];
  return Array.isArray(options.browserProbe404Prefixes)
  ? [...options.browserProbe404Prefixes]
  : DEFAULT_BROWSER_PROBE_404_PREFIXES;
}

function isQuietBrowserProbe404(pathname: string, options: RequestLogOptions) {
  return browserProbePrefixes(options).some((prefix) =>
    prefix && pathname.startsWith(prefix));
}

function shouldSkipFinishedRequestLog(
  ctx: RequestContext,
  status: number,
  options: RequestLogOptions,
) {
  const pathname = requestLogPath(ctx);
  if (status === 404 && SOURCE_MAP_FILE_RE.test(pathname)) return true;
  if (status === 404 && isQuietBrowserProbe404(pathname, options)) return true;
  if (status < 200 || status >= 400) return false;
  return isStaticAssetPath(pathname);
}

function requestLogMeta(ctx: RequestContext, status: number, outcome: string) {
  return {
    ip: ctx.ip,
    method: ctx.method,
    url: ctx.url,
    status,
    outcome,
    duration_ms: Math.max(0, Math.round(performance.now() - ctx.startedAt)),
  };
}

function readRequestLogger(options: RequestLogOptions) {
  return resolveSecurityLogger(options.readLogger?.() || options.logger);
}

function logFinishedRequest(
  res: any,
  ctx: RequestContext,
  options: RequestLogOptions,
) {
  const status = Number(res?.statusCode || 0);
  if (shouldSkipFinishedRequestLog(ctx, status, options)) return;

  const ok = status >= 200 && status < 400;
  const outcome = ok ? "success" : "fail";
  const msg = `${ctx.ip} ${ctx.method} ${ctx.url} ${status} ${outcome}`;
  const logger = readRequestLogger(options);
  const meta = requestLogMeta(ctx, status, outcome);

  if (ok) logger.log("success", "client.http", msg, meta);
  else if (status >= 500) logger.fail("client.http", msg, meta);
  else logger.warn("client.http", msg, meta);
}

function logClosedRequest(
  res: any,
  ctx: RequestContext,
  options: RequestLogOptions,
) {
  if (res?.writableEnded) return;
  if (isStaticAssetPath(requestLogPath(ctx))) return;

  readRequestLogger(options).warn(
    "client.http",
    `${ctx.ip} ${ctx.method} ${ctx.url} closed fail`,
    requestLogMeta(ctx, Number(res?.statusCode || 0), "fail"),
  );
}

function attachRequestLogger(
  app: any,
  options: RequestLogOptions = {},
) {
  if (!app || typeof app.use !== "function") return false;
  if (attachedRequestLogApps.has(app)) return false;
  attachedRequestLogApps.add(app);

  if (
    Object.prototype.hasOwnProperty.call(options, "trustProxy") &&
      typeof app.set === "function"
  ) {
    app.set("trust proxy", options.trustProxy);
  }

  app.use((req: any, res: any, next: any) => {
      const ctx = requestLogContext(req);
      res.on("finish", () => logFinishedRequest(res, ctx, options));
      res.on("close", () => logClosedRequest(res, ctx, options));
      next();
  });
  return true;
}

export { attachRequestLogger };
export type { RequestLogOptions };
