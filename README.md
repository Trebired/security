# @trebired/security

Express/Node security middleware for Trebired apps: CORS, security headers, CSP, nonce generation, and HTTP request logging, wired through `.trebired/security/config.ts`.

This package owns generic middleware attachment and option building for these five systems. It does not own authentication, session management, CSRF protection, rate limiting, IP bans, or firewall rules — those stay app-owned because they depend on the app's own routing conventions, response rendering, and persisted state.

## Install

Runtime support: Bun 1+.

```sh
bun i @trebired/security
```

## Quick Start

```ts
import { attachSecurity } from "@trebired/security";

await attachSecurity(app);
```

With no `.trebired/security/config.ts` present, all five systems attach in their default order with default options. Add the config file to customize order, disable a system, or pass per-system options.

## Concepts

### Systems

`attachSecurity` holds a fixed list of five systems: `nonce`, `headers`, `csp`, `cors`, `requestLog`. Each has a default order (`nonce: 0`, `headers: 10`, `csp: 20`, `cors: 30`, `requestLog: 40`) and attaches through its own existing function (`attachNonceMiddleware`, `attachSecurityHeadersMiddleware`, `attachContentSecurityPolicyMiddleware`, `attachCorsMiddleware`, `attachRequestLogger`), also exported individually for apps that want to attach a subset by hand instead of using `attachSecurity`.

### Response locals bridge

`nonce` writes to `res.locals.nonce`; `csp` reads it from there to build the `Content-Security-Policy` header (`nonce` must run first, hence its default order). Rendering code elsewhere in the app can read `res.locals.nonce` and `res.locals.csrfToken` (set by the app's own CSRF middleware) directly — no import from this package required.

## Configuration

### `.trebired/security/config.ts`

```ts
import { defineConfig } from "@trebired/security";
import { isAllowedOrigin } from "./access.js"; // app-owned origin policy

export default defineConfig({
  forVersion: "0.1.0",
  systems: {
    nonce: { order: 0 },
    headers: { order: 10 },
    csp: { order: 20 },
    cors: { order: 30, options: { isAllowedOrigin } },
    requestLog: { order: 40, options: { trustProxy: true } },
  },
});
```

Every system entry accepts `enabled` (default `true`), `order` (default per the list above), and `options` (passed straight to that system's attach function). Config files are plain TS modules; import app-owned functions (origin checks, a logger reader) directly into them the same way `.trebired/frontend/config.ts` imports palette and token values.

## Public API

- `attachSecurity(app, options?)`: reads `.trebired/security/config.ts` (or an inline `options.config`) and attaches every enabled system in order.
- `attachNonceMiddleware`, `createNonceMiddleware`: per-request CSP nonce, written to `res.locals`.
- `attachSecurityHeadersMiddleware`, `createSecurityHeadersMiddleware`, `applySecurityHeaders`: HSTS, frame options, referrer policy, permissions policy, and related headers.
- `attachContentSecurityPolicyMiddleware`, `createContentSecurityPolicyMiddleware`, `applyContentSecurityPolicy`, `contentSecurityPolicyHeader`, `defaultContentSecurityPolicyDirectives`: CSP header construction, nonce-aware.
- `attachCorsMiddleware`, `createCorsOptionsDelegate`, `defaultCorsOptions`: CORS, backed by the `cors` package.
- `attachRequestLogger`: structured request/response logging (skips static assets, source maps, and quiet 404 browser probes automatically; no route-suppression option).
- `defineConfig`, `loadSecurityConfig`: `.trebired/security/config.ts` support.

## What It Does Not Do

This package does not:

- Implement CSRF protection, session handling, or authentication.
- Implement rate limiting or IP/ban enforcement.
- Suppress request logging for specific routes. Every request logs.
- Persist or sync any state; every system is stateless per request.
