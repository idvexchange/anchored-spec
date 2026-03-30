# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Tree-sitter discovery resolver** — Language-agnostic source code analysis using Tree-sitter WASM. Discovers `api-contract`, `physical-schema`, `event-contract`, and `service` artifacts from code patterns. 8 built-in JavaScript/TypeScript query packs (Express, Next.js, Prisma, TypeORM, EventEmitter, Bull, fetch, axios). Optional `web-tree-sitter` peer dependency.
- **Config-driven resolver loading** — The `resolvers[]` config array in `.anchored-spec/config.json` is now wired at runtime. Reference built-in resolvers by `name`, tree-sitter with `queryPacks`/`customPacks` options, or load custom resolver modules via `path`.
- **Resolver loader module** — `loadResolver()` and `loadResolversFromConfig()` functions for programmatic resolver instantiation.
- **`EaResolverConfig.name` field** — Built-in resolvers can be referenced by name (e.g. `"openapi"`, `"tree-sitter"`) instead of file path. `path` is still supported for custom modules.
- **Spec diffing** (`diff` command) — Semantic diff of EA artifacts between git refs with compatibility and policy checks.
- **Reconcile pipeline** (`reconcile` command) — Full SDD pipeline: generate → validate → drift in a single pass.
- **Version policy enforcement** — Per-kind and global compatibility policies (`backward-only`, `full`, `breaking-allowed`) with automatic violation detection.
- **SKILL.md workflows** — 9 new AI agent workflows: Explain Change, Spec-First Implementation, Pre-Implementation Audit, Context Assembly, Architecture Onboarding, Confidence Audit, and more.
- **VS Code integration** (`init --ide`) — Generates `.vscode/settings.json` with schema-to-file mappings for all 48 artifact kinds, `.vscode/anchored-spec.code-snippets` with 17 snippets, and `.vscode/extensions.json` recommending Red Hat YAML extension. Instant autocomplete, validation, and hovers.
- **AI assistant configuration** (`init --ai`) — Generates `.github/copilot-instructions.md` (GitHub Copilot), `CLAUDE.md` (Claude Code), `.kiro/steering/` files (Kiro IDE), and `.specify/extensions/anchored-spec/` (Spec-Kit). Targets: `copilot`, `claude`, `kiro`, `speckit`, `all`.
- **`$schema` injection** — `create` command now includes `$schema` in JSON artifacts for instant VS Code validation without settings.
- **Document traceability** — Bidirectional trace links between markdown docs (`ea-artifacts` frontmatter) and EA artifacts (`traceRefs`). New commands: `trace`, `link-docs`, `context`, `create-doc`.
- **`trace` command** — Show the traceability web for an artifact or document. Supports `--check` (bidirectional integrity), `--orphans` (missing backlinks), `--summary` (counts), and `--json`.
- **`link-docs` command** — Auto-sync trace links. Scans docs for `ea-artifacts` frontmatter and adds missing `traceRefs` to artifacts. `--bidirectional` also updates doc frontmatter. `--dry-run` for preview.
- **`context` command** — Assemble AI context packages from the trace graph. Loads artifact spec, traced docs, transitive `requires`, and related artifacts. Supports `--max-tokens` budget and `--depth` for relation traversal.
- **`create-doc` command** — Create markdown documents pre-linked to EA artifacts. Generates frontmatter, body with artifact references, and optionally updates artifacts' `traceRefs` back.
- **Frontmatter parser** — `parseFrontmatter()`, `serializeFrontmatter()`, `extractArtifactIds()`, and `hasEaFrontmatter()` functions for YAML frontmatter in markdown documents. Supports `ea-artifacts` (primary) and `anchored-spec` (alternative) field names.
- **Document scanner** — `scanDocs()` and `buildDocIndex()` for finding markdown files with EA-relevant frontmatter across project directories.
- **Trace integrity drift rules** — 2 new drift rules: `ea:trace/ref-target-exists` (validates traceRef paths) and `ea:trace/duplicate-ref` (detects duplicate traceRefs). Total: 44 drift rules.
- **Document-driven discovery** (`discover --from-docs`) — Prose-first workflow: write docs with `ea-artifacts` frontmatter referencing artifact IDs that don't yet exist, then run `discover --from-docs` to scaffold draft artifacts. Infers kind from ID prefix, uses doc context for summary.
- **Spec-Kit extension generation** (`init --ai speckit`) — Generates a complete Spec-Kit extension in `.specify/extensions/anchored-spec/` with `extension.yml` manifest, 4 AI commands (`enrich`, `scaffold`, `trace`, `context`), and an `after_tasks` hook. The `all` target now includes `speckit` alongside `copilot`, `claude`, and `kiro`.
- **Kiro event-driven hooks** (`init --ai kiro`) — Generates 4 agent hooks in `.kiro/hooks/` alongside the 3 steering files: `validate-artifact.yml` (onSave, validates artifacts against JSON schemas), `enrich-spec.yml` (onCreate, auto-generates ea-artifacts frontmatter), `trace-integrity.yml` (onSave, checks bidirectional trace links), and `drift-detection.yml` (onSave, detects drift when implementation changes). Total Kiro output: 3 steering + 4 hooks = 7 files.
- **Reusable prompt commands** (`init --ai copilot`, `init --ai claude`) — Generates 6 slash-command prompt files for Copilot (`.github/prompts/ea-*.prompt.md`) and Claude (`.claude/commands/ea-*.md`): `ea-enrich`, `ea-scaffold`, `ea-trace`, `ea-context`, `ea-drift`, `ea-audit`. Gives plain-agent users the same workflows that Kiro and Spec-Kit users get via hooks.

### Changed

- **`EaResolverConfig` type** — `path` is now optional (either `name` or `path` required). Added `name?: string` for built-in references.
- **`config-v1.schema.json`** — `resolvers` items no longer require `path`; supports `name` for built-in resolvers.
- **`ea discover` command** — 3-way dispatch: `--resolver` flag → config `resolvers[]` → all built-ins fallback.
- **SKILL.md** — Now 26 sections with 15 workflows (was 16 sections in v1.0).

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
