# Changelog

All notable changes to `@trebired/security` will be documented here.

This project follows semantic versioning once published.

## 0.1.1

- Moved IP-ban startup repair/reconciliation ownership into `attachSecurity`.
- Added `startupRepair` and `startupReconcile` config flags under `ipBans`.
- Switched security package initialization logging to direct `@package/logger-adapter` usage and kept package-owned runtime logging for IP-ban internals.

## 0.1.0

- Added `attachNonceMiddleware`, `attachSecurityHeadersMiddleware`, `attachContentSecurityPolicyMiddleware`, `attachCorsMiddleware`, and their `create*`/`apply*` building blocks, moved from `@trebired/frontend/server`.
- Added `attachRequestLogger`, moved from `@trebired/frontend/server`'s `attachFrontendRequestLogger`. The `quietSuccessRoutes` option is gone; every request logs uniformly.
- Added `attachSecurity(app, options?)`, a single entry point that reads `.trebired/security/config.ts` and attaches every enabled system in configured order, replacing the per-file `attachCore*` wiring pattern.
- Added `defineConfig`/`loadSecurityConfig` for `.trebired/security/config.ts` support.
