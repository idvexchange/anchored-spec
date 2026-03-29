# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2025-07-18

### Breaking Changes

- **Removed `src/core/` entirely** — The legacy spec-anchored engine (REQ/CHG/ADR) has been removed. All functionality is now provided by the EA (Enterprise Architecture) module.
- **Removed legacy CLI commands** — `create requirement`, `create change`, `create decision`, `verify`, `generate`, `check`, `migrate`, `import` are no longer available. Use EA equivalents (`create --kind`, `validate`, `generate`, etc.).
- **Removed `anchored-spec/schemas/*` core schemas** — The `./schemas/*` export now points to EA schemas. Import from `anchored-spec/ea/schemas/*` or `anchored-spec/schemas/*`.
- **Changed public API** — `import { SpecRoot } from "anchored-spec"` is no longer available. Use `import { EaRoot } from "anchored-spec"`.
- **Removed `migrate-legacy` command** — Use v0.1.0 to migrate artifacts before upgrading to v1.0.
- **Config format change** — `.anchored-spec/config.json` now requires `"schemaVersion": "1.0"`. Run `anchored-spec migrate-config` to convert v0.x configs.

### Added

- **EA as sole implementation** — 44 artifact kinds across 7 domains (systems, delivery, data, information, business, transitions, legacy)
- **27 typed relations** with graph visualization (Mermaid, DOT, JSON)
- **5 resolvers** — OpenAPI, Kubernetes, Terraform, SQL DDL, dbt for auto-discovery
- **Anchors resolver** — Scan source code for exported symbols matching EA artifact anchors
- **42 drift rules** with domain-specific detection
- **EA workflow policy engine** — Evaluate policies against EA artifacts
- **EA plugin system** — `EaPlugin` interface with checks and hooks
- **EA verification engine** — 7 check categories for comprehensive validation
- **Evidence adapter framework** — Vitest adapter with extensible registry
- **EA status and transition commands** — Manage artifact lifecycle
- **Config migration tool** — `anchored-spec migrate-config` converts v0.x configs to v1.0
- **51 JSON schemas** — Full validation coverage including governance schemas
- **v1.0 configuration format** — Flat config with `schemaVersion: "1.0"`, domain paths, source roots
- **Top-level CLI commands** — All EA commands promoted to top level (no `ea` prefix needed)
- **Deprecated `ea` alias group** — `anchored-spec ea <cmd>` still works with deprecation warning

### Changed

- **`src/index.ts`** now re-exports from `./ea/` instead of `./core/`
- **`package.json` exports** — `./schemas/*` now maps to EA schemas
- **Build script** — No longer copies core schemas to dist
- **SKILL.md** — Rewritten for EA-only workflows (16 sections)
- **README.md** — Rewritten for EA-first documentation
- **All documentation** updated for v1.0 EA-only

### Removed

- `src/core/` — 16 source files, 13 test files, 6 schemas
- `src/ea/migrate-legacy.ts` — Legacy artifact migration (depends on removed core)
- `src/cli/commands/ea-migrate-legacy.ts` — CLI for legacy migration
- 9 legacy documentation files (getting-started, concepts, commands, configuration, drift-detection, plugins-and-hooks, evidence-pipeline, ci-integration, programmatic-api)

## [0.1.0] — 2025-07-17

Initial release with dual spec-anchored (REQ/CHG/ADR) and spec-as-source (EA) support.

### Added

- Spec-anchored core: requirements, changes, decisions with JSON schemas
- Workflow policy engine with path-based enforcement
- Drift detection with pluggable resolvers (including TypeScript AST)
- Evidence pipeline with test linking
- EA extension with 44 artifact kinds, 27 relations, 42 drift rules
- 5 resolvers (OpenAPI, Kubernetes, Terraform, SQL DDL, dbt)
- 2 generators (OpenAPI, JSON Schema)
- 6 report views
- Complete CLI with both core and EA commands
- SKILL.md agent instruction set
- 1200+ tests
