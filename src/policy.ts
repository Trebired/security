import crypto from "node:crypto";

import {
  setResponseHeader,
  type ServerRequestLike,
  type ServerResponseLike,
} from "@trebired/utils";
import {
  attachUseMiddleware,
  responseLocals,
  securityText,
} from "./helpers.js";

type NonceMiddlewareOptions = {
  bytes?: number;
  localsKey?: string;
};

type SecurityHeadersOptions = {
  acceptClientHints?: readonly string[];
  crossOriginOpenerPolicy?: string | false;
  crossOriginResourcePolicy?: string | false;
  dnsPrefetchControl?: string | false;
  frameOptions?: string | false;
  hsts?:
  |false
  |string
  | {
    header?: string;
    shouldSend?: (req: ServerRequestLike) => boolean;
  };
  originAgentCluster?: string | false;
  permittedCrossDomainPolicies?: string | false;
  permissionsPolicy?: false | readonly string[] | string;
  referrerPolicy?: string | false;
};

type ContentSecurityPolicyOptions = {
  directives?:
  |readonly string[]
  |((context: ContentSecurityPolicyContext) => readonly string[]);
  nonceLocalKey?: string;
  shouldUpgradeInsecureRequests?: (req: ServerRequestLike) => boolean;
};

type ContentSecurityPolicyContext = {
  nonce: string;
  req: ServerRequestLike;
};

function createNonceMiddleware(options: NonceMiddlewareOptions = {}) {
  const bytes = Math.max(8, Math.floor(Number(options.bytes) || 16));
  const localsKey = options.localsKey || "nonce";
  return function nonceMiddleware(
    _req: unknown,
    res: ServerResponseLike,
    next: () => unknown,
  ) {
    const locals = responseLocals(res);
    if (locals) locals[localsKey] = crypto.randomBytes(bytes).toString("base64");
    return next();
  };
}

function attachNonceMiddleware(
  app: unknown,
  options: NonceMiddlewareOptions = {},
) {
  attachUseMiddleware(app, createNonceMiddleware(options));
}

function hstsHeader(options: SecurityHeadersOptions["hsts"]) {
  if (options === false) return "";
  if (typeof options === "string") return options;
  if (options && typeof options === "object" && options.header) {
    return options.header;
  }
  return "max-age=31536000; includeSubDomains; preload";
}

function shouldSendHsts(
  req: ServerRequestLike,
  options: SecurityHeadersOptions["hsts"],
) {
  if (options === false) return false;
  if (options && typeof options === "object" && options.shouldSend) {
    return options.shouldSend(req);
  }
  return Boolean(req && req.secure);
}

function defaultPermissionsPolicy() {
  return [
    "geolocation=()",
    "camera=()",
    "microphone=()",
    "payment=()",
    "gamepad=()",
    "gyroscope=()",
    "magnetometer=()",
    "display-capture=()",
  ];
}

function permissionsPolicyHeader(
  input: SecurityHeadersOptions["permissionsPolicy"],
) {
  if (input === false) return "";
  if (typeof input === "string") return input;
  const entries = input || defaultPermissionsPolicy();
  return Array.from(entries).join(", ");
}

function applySecurityHeaders(
  req: ServerRequestLike,
  res: ServerResponseLike,
  options: SecurityHeadersOptions = {},
) {
  const hsts = hstsHeader(options.hsts);
  if (hsts && shouldSendHsts(req, options.hsts)) {
    setResponseHeader(res, "Strict-Transport-Security", hsts);
  }
  setResponseHeader(res, "X-Content-Type-Options", "nosniff");
  if (options.dnsPrefetchControl !== false) {
    setResponseHeader(
      res,
      "X-DNS-Prefetch-Control",
      options.dnsPrefetchControl || "off",
    );
  }
  if (options.permittedCrossDomainPolicies !== false) {
    setResponseHeader(
      res,
      "X-Permitted-Cross-Domain-Policies",
      options.permittedCrossDomainPolicies || "none",
    );
  }
  if (options.frameOptions !== false) {
    setResponseHeader(res, "X-Frame-Options", options.frameOptions || "SAMEORIGIN");
  }
  if (options.referrerPolicy !== false) {
    setResponseHeader(
      res,
      "Referrer-Policy",
      options.referrerPolicy || "strict-origin-when-cross-origin",
    );
  }
  const permissions = permissionsPolicyHeader(options.permissionsPolicy);
  if (permissions) setResponseHeader(res, "Permissions-Policy", permissions);
  if (options.crossOriginOpenerPolicy !== false) {
    setResponseHeader(
      res,
      "Cross-Origin-Opener-Policy",
      options.crossOriginOpenerPolicy || "same-origin",
    );
  }
  if (options.crossOriginResourcePolicy !== false) {
    setResponseHeader(
      res,
      "Cross-Origin-Resource-Policy",
      options.crossOriginResourcePolicy || "same-origin",
    );
  }
  if (options.originAgentCluster !== false) {
    setResponseHeader(res, "Origin-Agent-Cluster", options.originAgentCluster || "?1");
  }
  if (options.acceptClientHints && options.acceptClientHints.length) {
    setResponseHeader(res, "Accept-CH", options.acceptClientHints.join(", "));
  }
}

function createSecurityHeadersMiddleware(
  options: SecurityHeadersOptions = {},
) {
  return function securityHeadersMiddleware(
    req: ServerRequestLike,
    res: ServerResponseLike,
    next: () => unknown,
  ) {
    applySecurityHeaders(req, res, options);
    return next();
  };
}

function attachSecurityHeadersMiddleware(
  app: unknown,
  options: SecurityHeadersOptions = {},
) {
  attachUseMiddleware(app, createSecurityHeadersMiddleware(options));
}

function cspNonce(
  res: ServerResponseLike,
  options: ContentSecurityPolicyOptions,
) {
  const key = options.nonceLocalKey || "nonce";
  const nonce = res && res.locals ? res.locals[key] : "";
  return securityText(nonce) || "";
}

function defaultContentSecurityPolicyDirectives(
  context: ContentSecurityPolicyContext,
) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${context.nonce}'`,
    `script-src-elem 'self' 'nonce-${context.nonce}'`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
}

function contentSecurityPolicyDirectives(
  context: ContentSecurityPolicyContext,
  options: ContentSecurityPolicyOptions,
) {
  if (typeof options.directives === "function") {
    return options.directives(context);
  }
  return options.directives || defaultContentSecurityPolicyDirectives(context);
}

function contentSecurityPolicyHeader(
  context: ContentSecurityPolicyContext,
  options: ContentSecurityPolicyOptions = {},
) {
  const values = Array.from(contentSecurityPolicyDirectives(context, options))
  .map((directive) => String(directive || "").trim())
  .filter(Boolean);
  if (
    options.shouldUpgradeInsecureRequests &&
      options.shouldUpgradeInsecureRequests(context.req)
  ) {
    values.push("upgrade-insecure-requests");
  }
  return values.join("; ");
}

function applyContentSecurityPolicy(
  req: ServerRequestLike,
  res: ServerResponseLike,
  options: ContentSecurityPolicyOptions = {},
) {
  const nonce = cspNonce(res, options);
  if (!nonce) {
    throw new Error(
      "Content security policy nonce is missing. Ensure nonce middleware runs first.",
    );
  }
  setResponseHeader(
    res,
    "Content-Security-Policy",
    contentSecurityPolicyHeader({ nonce, req }, options),
  );
}

function createContentSecurityPolicyMiddleware(
  options: ContentSecurityPolicyOptions = {},
) {
  return function contentSecurityPolicyMiddleware(
    req: ServerRequestLike,
    res: ServerResponseLike,
    next: (error?: unknown) => unknown,
  ) {
    try {
      applyContentSecurityPolicy(req, res, options);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function attachContentSecurityPolicyMiddleware(
  app: unknown,
  options: ContentSecurityPolicyOptions = {},
) {
  attachUseMiddleware(app, createContentSecurityPolicyMiddleware(options));
}

export {
  applyContentSecurityPolicy,
  applySecurityHeaders,
  attachContentSecurityPolicyMiddleware,
  attachNonceMiddleware,
  attachSecurityHeadersMiddleware,
  contentSecurityPolicyHeader,
  createContentSecurityPolicyMiddleware,
  createNonceMiddleware,
  createSecurityHeadersMiddleware,
  defaultContentSecurityPolicyDirectives,
};
export type {
  ContentSecurityPolicyContext,
  ContentSecurityPolicyOptions,
  NonceMiddlewareOptions,
  SecurityHeadersOptions,
};
