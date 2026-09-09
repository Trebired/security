# Changelog

All notable changes to `@trebired/security` will be documented here.

This project follows semantic versioning once published.

## 0.2.0

- Updated the `@trebired/utils` dependency range to `^0.9.0`, keeping every `@trebired` package on one range so a project cannot resolve two copies.
- Updated the shipped `.trebired/logger/config.ts` `forVersion` to `2.7.0` and the `@trebired/code-discipline` / `@trebired/configs` ranges to `^7.2.0` / `^0.4.0`. The logger config named an older release, so under `@trebired/logger` 2.7 the version check threw and this package's log prefix was dropped.

## 0.1.3

- Updated env, result, and store dependency ranges to the current package releases so consumers do not retain older nested logger-adapter installs.

## 0.1.2

- Updated the logger-adapter dependency so security startup initialization logs remain idempotent.

## 0.1.1

- Moved IP-ban startup repair/reconciliation ownership into `attachSecurity`.
- Added `startupRepair` and `startupReconcile` config flags under `ipBans`.
- Switched security package initialization logging to direct `@package/logger-adapter` usage and kept package-owned runtime logging for IP-ban internals.

## 0.1.0

- Added `attachNonceMiddleware`, `attachSecurityHeadersMiddleware`, `attachContentSecurityPolicyMiddleware`, `attachCorsMiddleware`, and their `create*`/`apply*` building blocks, moved from `@trebired/frontend/server`.
- Added `attachRequestLogger`, moved from `@trebired/frontend/server`'s `attachFrontendRequestLogger`. The `quietSuccessRoutes` option is gone; every request logs uniformly.
- Added `attachSecurity(app, options?)`, a single entry point that reads `.trebired/security/config.ts` and attaches every enabled system in configured order, replacing the per-file `attachCore*` wiring pattern.
- Added `defineConfig`/`loadSecurityConfig` for `.trebired/security/config.ts` support.
