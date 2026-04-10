# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Repository-evidence adapter framework** — `impact --with-commands` can now enrich architecture impact with adapter-derived repository targets and rendered suggestions through `repositoryEvidence.adapters`, including a built-in `node-workspaces` adapter and custom module loading support.
- **Structured impact output split** — `commandPlan` now exposes `architectureImpact`, `repositoryImpact`, and `suggestions` so repositories can compile local command plans without treating Anchored Spec as the final orchestrator. Legacy `commands`, `broaderCommands`, and `actionCommands` fields remain for compatibility.
- **Secondary file-link evidence** — `anchors.files` is now part of the anchors type/schema and participates in reverse resolution and command suggestion path collection as lower-confidence file evidence.
- **Repository harness boundary ADR** — Added `ADR-007` to formalize Anchored Spec as an architecture control plane with thin, repo-local harnesses owning last-mile execution.
- **Repository harness feedback guide** — Added a detailed field-feedback guide documenting what worked, what did not, and where the framework should stay generic.

### Changed

- **Framework positioning** — README, guides, AI-facing files, and developer docs now consistently describe Anchored Spec as a sparse architecture control plane rather than a full repository workflow engine.
- **Component-to-code guidance** — `anchored-spec.dev/code-location` is now documented as the primary architecture-level code link for `Component`, with file, symbol, test, and adapter evidence treated as supporting context.
- **Repository impact guidance** — `impact --with-commands`, repository harness patterns, and CI/testing docs now emphasize adapter-driven repository evidence and repository-owned command rendering instead of Node/package-manager-specific assumptions in the core model.
- **AI workflow guidance** — `llms.txt`, `llms-full.txt`, and `SKILL.md` now align human and agent workflows around the same control-plane model, explicit `code-location` usage, and structured impact handoff.

## [0.3.0] — 2026-04-06

### Added

- **Backstage-native primary code linkage for components** — Supports the `anchored-spec.dev/code-location` annotation on `kind: Component`, uses it during reverse resolution, and emits it from `catalog bootstrap` when a primary source location can be inferred.
- **Hybrid impact command suggestions** (`impact --with-commands`) — Produces a suggestion-oriented `commandPlan` that combines architecture impact, workflow policy, and detected workspace scripts into `commands`, `broaderCommands`, and `actionCommands` without turning Anchored Spec into an orchestrator.
- **Policy-driven read-first narrowing** (`context --focus-path`) — Lets workflow policy declare `readFirstRules` so context assembly can require the right architecture and design docs for a code path before implementation work starts.
- **Repository harness guidance** — Added a dedicated guide for using Anchored Spec as the architecture control plane alongside repo-local harnesses and execution workflows.
- **Markdown prose resolver** (`discover --resolver markdown`) — Extracts structured facts from tables, TypeScript/JSON code blocks, Mermaid state diagrams, heading+list patterns, and YAML frontmatter. Supports `@ea:events`, `@ea:states`, `@ea:endpoints`, `@ea:entities`, `@ea:enums`, `@ea:schema`, `@ea:transitions` annotation hints for precise fact classification.
- **Doc consistency drift domain** (`drift --domain docs`) — 8 new drift rules detecting value mismatches, naming inconsistencies, missing entries, extra entries, and state machine conflicts across documents. Total: 52 drift rules.
- **Fact-to-entity reconciliation** (`drift --domain docs --include-entities`) — Compares doc facts against entity anchor declarations to detect spec/prose divergence.
- **Doc consistency in reconcile pipeline** (`reconcile --include-docs`) — Adds a doc consistency step to the full SDD pipeline.
- **`@ea:suppress` inline annotations** — Mark intentional contradictions in markdown to suppress false-positive drift findings.
- **`@ea:canonical` / `@ea:derived` document markers** — Classify markdown documents as canonical sources of truth or derived copies. Derived markers include `source="file.md"` for provenance tracking. Affects consistency check severity.
- **`link-docs --annotate`** — Auto-suggest `@ea:*` annotation comments for markdown documents. Supports `--dry-run`, `--json`, and `--write` modes. Uses heuristic analysis to identify un-annotated fact regions.
- **Mapping table detection** — New `mapping-table` FactKind and `@ea:mapping` annotation for cross-reference/lookup tables (e.g., country-code → provider mappings). Mapping table column pairs downgrade naming-inconsistency findings from error to warning.
- **Extra-entry consistency check** — New `ea:docs/extra-entry` rule detects entries present in one annotated document but absent from another document covering the same fact kind.
- **Heuristic scoring for table classification** — Score-based multi-column matching replaces first-match heuristic, improving fact kind accuracy for ambiguous tables.
- **`statuses` and `transitions` anchor fields** — New `EaAnchors` properties for status-enum and state-transition reconciliation. Entities can now declare expected statuses (e.g., `statuses: ["open", "closed"]`) and state transitions (e.g., `transitions: ["open→processing"]`) for drift checking against prose.
- **`--write-facts` option** — Persist extracted fact manifests to disk for caching and downstream tooling.
- **New dependencies** — unified, remark-parse, remark-gfm, remark-frontmatter, mdast-util-to-string, unist-util-visit for markdown AST processing.
- **`link` command** (`anchored-spec link <from> <to> --type <relation-type>`) — Creates a relation between two entities by updating the source entity file. Options: `--type` (default: `"uses"`), `--description`, `--dry-run`, `--root-dir`. Supports YAML and JSON entities. Detects duplicate relations.
- **`search` command** (`anchored-spec search <query>`) — Full-text search across entities by ID, name, kind, summary, and tags. Filters: `--kind`, `--domain`, `--status`, `--tag`, `--confidence`. Outputs formatted table by default or `--json` for machine-readable output.
- **SchemaStore catalog** (`schemastore-catalog.json`) — Catalog file with 3 entries (config, workflow-policy, EA entities) ready to submit as a PR to [SchemaStore](https://github.com/SchemaStore/schemastore). Schemas reference raw GitHub URLs for JSON schema files, enabling automatic validation in any editor that supports SchemaStore.
- **Idempotent AI config regeneration** (`init --ai --force`) — `writeAiConfigFiles()` now accepts `options?: { force?: boolean }`. With `--force`, existing files are overwritten (reported as "overwritten"); without it, existing files are skipped. `WriteResult` now has 3 arrays: `created`, `skipped`, `overwritten`.
- **CI integration recipes** (`init --ci`) — Generates `.github/workflows/ea-validation.yml` (GitHub Action running validate --strict, trace --check, drift, and semantic diff on PRs) and `.anchored-spec/hooks/pre-commit` (shell script validating EA entities before commits). Supports `--force` to overwrite. New module: `src/cli/ci-recipes.ts`.
- **Interactive create wizard** (`create --interactive` / `-i`) — Step-by-step wizard for entity creation: domain selection, kind selection (filtered by domain), title, owner, and a relations loop. `[kind]` is now optional (was required `<kind>`); `--title` is optional when `--interactive` is used. Relations from the wizard are included in generated YAML/JSON. Without `--interactive`, behaves exactly as before.
- **Tree-sitter discovery resolver** — Language-agnostic source code analysis using Tree-sitter WASM. Discovers `api-contract`, `physical-schema`, `event-contract`, and `service` entities from code patterns. 8 built-in JavaScript/TypeScript query packs (Express, Next.js, Prisma, TypeORM, EventEmitter, Bull, fetch, axios). Optional `web-tree-sitter` peer dependency.
- **Config-driven resolver loading** — The `resolvers[]` config array in `.anchored-spec/config.json` is now wired at runtime. Reference built-in resolvers by `name`, tree-sitter with `queryPacks`/`customPacks` options, or load custom resolver modules via `path`.
- **Resolver loader module** — `loadResolver()` and `loadResolversFromConfig()` functions for programmatic resolver instantiation.
- **`EaResolverConfig.name` field** — Built-in resolvers can be referenced by name (e.g. `"openapi"`, `"tree-sitter"`) instead of file path. `path` is still supported for custom modules.
- **Spec diffing** (`diff` command) — Semantic diff of EA entities between git refs with compatibility and policy checks.
- **Reconcile pipeline** (`reconcile` command) — Full SDD pipeline: generate → validate → drift in a single pass.
- **Version policy enforcement** — Per-kind and global compatibility policies (`backward-only`, `full`, `breaking-allowed`) with automatic violation detection.
- **SKILL.md workflows** — 9 new AI agent workflows: Explain Change, Spec-First Implementation, Pre-Implementation Audit, Context Assembly, Architecture Onboarding, Confidence Audit, and more.
- **VS Code integration** (`init --ide`) — Generates `.vscode/settings.json` with schema-to-file mappings for all 48 entity kinds, `.vscode/anchored-spec.code-snippets` with 17 snippets, and `.vscode/extensions.json` recommending Red Hat YAML extension. Instant autocomplete, validation, and hovers.
- **AI assistant configuration** (`init --ai`) — Generates `.github/copilot-instructions.md` (GitHub Copilot), `CLAUDE.md` (Claude Code), `.kiro/steering/` files (Kiro IDE), and `.specify/extensions/anchored-spec/` (Spec-Kit). Targets: `copilot`, `claude`, `kiro`, `speckit`, `all`.
- **`$schema` injection** — `create` command now includes `$schema` in JSON entities for instant VS Code validation without settings.
- **Document traceability** — Bidirectional trace links between markdown docs (`ea-entities` frontmatter) and EA entities (`traceRefs`). New commands: `trace`, `link-docs`, `context`, `create-doc`.
- **`trace` command** — Show the traceability web for an entity or document. Supports `--check` (bidirectional integrity), `--orphans` (missing backlinks), `--summary` (counts), and `--json`.
- **`link-docs` command** — Auto-sync trace links. Scans docs for `ea-entities` frontmatter and adds missing `traceRefs` to entities. `--bidirectional` also updates doc frontmatter. `--dry-run` for preview.
- **`context` command** — Assemble AI context packages from the trace graph. Loads entity spec, traced docs, transitive `requires`, and related entities. Supports `--max-tokens` budget and `--depth` for relation traversal.
- **`create-doc` command** — Create markdown documents pre-linked to EA entities. Generates frontmatter, body with entity references, and optionally updates entities' `traceRefs` back.
- **Frontmatter parser** — `parseFrontmatter()`, `serializeFrontmatter()`, `extractEntityRefs()`, and `hasEaFrontmatter()` functions for YAML frontmatter in markdown documents. Supports `ea-entities` (primary) and `anchored-spec` (alternative) field names.
- **Document scanner** — `scanDocs()` and `buildDocIndex()` for finding markdown files with EA-relevant frontmatter across project directories.
- **Trace integrity drift rules** — 2 new drift rules: `ea:trace/ref-target-exists` (validates traceRef paths) and `ea:trace/duplicate-ref` (detects duplicate traceRefs). Total: 44 drift rules.
- **Document-driven discovery** (`discover --from-docs`) — Prose-first workflow: write docs with `ea-entities` frontmatter referencing entity IDs that don't yet exist, then run `discover --from-docs` to scaffold draft entities. Infers kind from ID prefix, uses doc context for summary.
- **Spec-Kit extension generation** (`init --ai speckit`) — Generates a complete Spec-Kit extension in `.specify/extensions/anchored-spec/` with `extension.yml` manifest, 4 AI commands (`enrich`, `scaffold`, `trace`, `context`), and an `after_tasks` hook. The `all` target now includes `speckit` alongside `copilot`, `claude`, and `kiro`.
- **Kiro event-driven hooks** (`init --ai kiro`) — Generates 4 agent hooks in `.kiro/hooks/` alongside the 3 steering files: `validate-entity.yml` (onSave, validates entities against JSON schemas), `enrich-spec.yml` (onCreate, auto-generates ea-entities frontmatter), `trace-integrity.yml` (onSave, checks bidirectional trace links), and `drift-detection.yml` (onSave, detects drift when implementation changes). Total Kiro output: 3 steering + 4 hooks = 7 files.
- **Reusable prompt commands** (`init --ai copilot`, `init --ai claude`) — Generates 6 slash-command prompt files for Copilot (`.github/prompts/ea-*.prompt.md`) and Claude (`.claude/commands/ea-*.md`): `ea-enrich`, `ea-scaffold`, `ea-trace`, `ea-context`, `ea-drift`, `ea-audit`. Gives plain-agent users the same workflows that Kiro and Spec-Kit users get via hooks.

### Changed

- **Framework positioning** — Anchored Spec is now documented as a sparse architecture control plane that feeds humans, agents, and repository-local harnesses, rather than as an end-to-end repo orchestrator.
- **Workflow policy schemas** — `changeRequiredRules` and verification settings now support graduated command classes (`commands`, `broaderCommands`, `actionCommands`) so policy can suggest what to run without owning execution.
- **CLI documentation and adoption guidance** — README, docs index, adoption playbook, reporting guidance, and SKILL guidance now align around the control-plane plus thin repo-harness model.
- **`EaResolverConfig` type** — `path` is now optional (either `name` or `path` required). Added `name?: string` for built-in references.
- **`config-v1.schema.json`** — `resolvers` items no longer require `path`; supports `name` for built-in resolvers.
- **`ea discover` command** — 3-way dispatch: `--resolver` flag → config `resolvers[]` → all built-ins fallback.
- **SKILL.md** — Now 27 sections with 16 workflows (was 16 sections in v1.0).

## [0.2.0] — 2026-03-30

### Breaking Changes

- **Removed `src/core/` entirely** — The previous spec-anchored engine (REQ/CHG/ADR) has been removed. All functionality is now provided by the EA (Enterprise Architecture) module.
- **Removed prior CLI commands** — `create requirement`, `create change`, `create decision`, `verify`, `generate`, `check`, `migrate`, `import` are no longer available. Use EA equivalents (`create --kind`, `validate`, `generate`, etc.).
- **Removed `anchored-spec/schemas/*` core schemas** — The `./schemas/*` export now points to EA schemas. Import from `anchored-spec/ea/schemas/*` or `anchored-spec/schemas/*`.
- **Changed public API** — `import { SpecRoot } from "anchored-spec"` is no longer available. Use `import { EaRoot } from "anchored-spec"`.
- **Removed migration command** — Use v0.1.0 to migrate entities before upgrading to v1.0.
- **Config format change** — `.anchored-spec/config.json` now requires `"schemaVersion": "1.0"`. Earlier config migration tooling has since been removed; update old configs manually before upgrading.

### Added

- **EA as sole implementation** — 44 entity kinds across 6 domains (systems, delivery, data, information, business, transitions)
- **27 typed relations** with graph visualization (Mermaid, DOT, JSON)
- **5 resolvers** — OpenAPI, Kubernetes, Terraform, SQL DDL, dbt for auto-discovery
- **Anchors resolver** — Scan source code for exported symbols matching EA entity anchors
- **42 drift rules** with domain-specific detection
- **EA workflow policy engine** — Evaluate policies against EA entities
- **EA plugin system** — `EaPlugin` interface with checks and hooks
- **EA verification engine** — 7 check categories for comprehensive validation
- **Evidence adapter framework** — Vitest adapter with extensible registry
- **EA status and transition commands** — Manage entity lifecycle
- **Config migration tool** — initially shipped for v0.x → v1.0 upgrades, but removed in the later v2 cleanup.
- **51 JSON schemas** — Full validation coverage including governance schemas
- **v1.0 configuration format** — Flat config with `schemaVersion: "1.0"`, domain paths, source roots
- **Top-level CLI commands** — All EA commands promoted to top level (no `ea` prefix needed)
- **Deprecated `ea` alias group** — initially retained for compatibility, but removed in the later v2 cleanup.

### Changed

- **`src/index.ts`** now re-exports from `./ea/` instead of `./core/`
- **`package.json` exports** — `./schemas/*` now maps to EA schemas
- **Build script** — No longer copies core schemas to dist
- **SKILL.md** — Rewritten for EA-only workflows (16 sections)
- **README.md** — Rewritten for EA-first documentation
- **All documentation** updated for v1.0 EA-only

### Removed

- `src/core/` — 16 source files, 13 test files, 6 schemas
- `src/ea/migrate-previous.ts` — prior entity migration support (depended on removed core)
- `src/cli/commands/ea-migrate-previous.ts` — CLI for prior-format migration
- 9 prior-format documentation files (getting-started, concepts, commands, configuration, drift-detection, plugins-and-hooks, evidence-pipeline, ci-integration, programmatic-api)

## [0.1.0] — 2026-03-29

Initial release with dual spec-anchored (REQ/CHG/ADR) and spec-as-source (EA) support.

### Added

- Spec-anchored core: requirements, changes, decisions with JSON schemas
- Workflow policy engine with path-based enforcement
- Drift detection with pluggable resolvers (including TypeScript AST)
- Evidence pipeline with test linking
- EA extension with 44 entity kinds, 27 relations, 42 drift rules
- 5 resolvers (OpenAPI, Kubernetes, Terraform, SQL DDL, dbt)
- 2 generators (OpenAPI, JSON Schema)
- 6 report views
- Complete CLI with both core and EA commands
- SKILL.md agent instruction set
- 1200+ tests
