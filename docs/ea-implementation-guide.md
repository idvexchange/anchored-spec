# EA Implementation Guide

> **Status:** All phases (1 through 3) are fully implemented. This document serves as an architectural reference for the module layout, config schema, and CLI design. The phase-by-phase instructions below were the original implementation plan executed by AI agents.

This document provides step-by-step implementation instructions for each phase of the enterprise architecture extension. It is designed to be read by AI coding agents in fresh context windows.

Read these documents first:

1. [ea-design-overview.md](./ea-design-overview.md) — overview, decisions, positioning
2. [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) — artifact model, kinds, schemas
3. [ea-relationship-model.md](./ea-relationship-model.md) — relations, registry, graph
4. [ea-drift-resolvers-generators.md](./ea-drift-resolvers-generators.md) — resolvers, generators, discovery
5. [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md) — transitions, evidence, reporting

Also read the existing core code and documentation:

- [concepts.md](./concepts.md) — existing model
- [drift-detection.md](./drift-detection.md) — existing drift engine
- [plugins-and-hooks.md](./plugins-and-hooks.md) — existing plugins
- `src/core/types.ts` — all current TypeScript interfaces
- `src/core/loader.ts` — SpecRoot class and config resolution
- `src/core/drift.ts` — existing drift detection
- `src/core/evidence.ts` — existing evidence pipeline
- `src/core/validate.ts` — existing schema validation
- `src/cli/commands/` — existing CLI commands

## Repository Structure

### New Files

```text
specs/
  ea/
    systems/              # Phase A
    delivery/             # Phase A
    data/                 # Phase B
    information/          # Phase C
    business/             # Phase D
    transitions/          # Phase E
    generated/            # Generated reports and views

src/ea/
  index.ts               # Public API barrel
  types.ts               # All EA TypeScript types
  loader.ts              # EA artifact loader
  validate.ts            # EA schema validation + quality rules
  relation-registry.ts   # Relation type registry
  graph.ts               # Relation graph builder + query API
  drift.ts               # EA drift engine
  impact.ts              # EA impact analysis
  report.ts              # Report generation
  evidence.ts            # EA evidence extensions
  config.ts              # EA config types and resolution
  discovery.ts           # Discovery pipeline
  generator.ts           # Generator framework
  schemas/               # JSON Schema files for EA artifacts
    artifact-base.schema.json
    relation.schema.json
    anchors.schema.json
    application.schema.json
    service.schema.json
    api-contract.schema.json
    event-contract.schema.json
    integration.schema.json
    platform.schema.json
    deployment.schema.json
    runtime-cluster.schema.json
    network-zone.schema.json
    identity-boundary.schema.json
    # ... more per phase
  resolvers/             # Built-in resolver implementations
    openapi.ts
    kubernetes.ts
    terraform.ts
    # ... more per phase
  generators/            # Built-in generator implementations
    openapi.ts
    jsonschema.ts
    # ... more per phase
  __tests__/             # Tests for all EA modules
    types.test.ts
    loader.test.ts
    validate.test.ts
    relation-registry.test.ts
    graph.test.ts
    drift.test.ts
    discovery.test.ts
    generator.test.ts

src/cli/commands/
  ea.ts                  # EA command namespace (registers subcommands)
  ea-init.ts
  ea-create.ts
  ea-validate.ts
  ea-drift.ts
  ea-graph.ts
  ea-report.ts
  ea-discover.ts
  ea-generate.ts
  ea-impact.ts
  ea-evidence.ts
```

### Build Integration

Update `tsup.config.ts` to include `src/ea/**/*.ts` in the entry points. Update the build script to copy EA schemas:

```bash
tsup && cp -r src/core/schemas dist/core/ && cp -r src/ea/schemas dist/ea/
```

Update `package.json` exports to include:

```json
{
  "exports": {
    "./ea": { "import": "./dist/ea/index.js", "require": "./dist/ea/index.cjs", "types": "./dist/ea/index.d.ts" },
    "./ea/schemas/*": "./dist/ea/schemas/*"
  }
}
```

## Configuration Design

Add an `ea` section to `.anchored-spec/config.json`:

```json
{
  "ea": {
    "enabled": true,
    "rootDir": "specs/ea",
    "generatedDir": "specs/ea/generated",
    "idPrefix": null,
    "domains": {
      "systems": "specs/ea/systems",
      "delivery": "specs/ea/delivery",
      "data": "specs/ea/data",
      "information": "specs/ea/information",
      "business": "specs/ea/business",
      "transitions": "specs/ea/transitions"
    },
    "resolvers": [],
    "generators": [],
    "evidenceSources": [],
    "cache": {
      "dir": ".anchored-spec/cache/ea",
      "defaultTTL": 3600
    },
    "quality": {
      "requireOwners": true,
      "requireSummary": true,
      "requireRelations": false,
      "requireAnchors": false,
      "strictMode": false,
      "rules": {}
    }
  }
}
```

### Config Type

```typescript
export interface EaConfig {
  enabled: boolean;
  rootDir: string;
  generatedDir: string;
  idPrefix?: string | null;
  domains: Record<EaDomain, string>;
  resolvers: Array<{
    path: string;
    cacheTTL?: number;
    options?: Record<string, unknown>;
  }>;
  generators: Array<{
    path: string;
    outputDir: string;
    options?: Record<string, unknown>;
  }>;
  evidenceSources: string[];
  cache: {
    dir: string;
    defaultTTL: number;
  };
  quality: {
    requireOwners: boolean;
    requireSummary: boolean;
    requireRelations: boolean;
    requireAnchors: boolean;
    strictMode: boolean;
    rules: Record<string, "error" | "warning" | "info" | "off">;
  };
}
```

### Default Resolution

When `ea.enabled` is `true` but specific config is missing, use sensible defaults. The `resolveEaConfig()` function in `src/ea/config.ts` handles this.

## CLI Design

### Command Registration

Register a top-level `ea` command with subcommands:

```typescript
// src/cli/commands/ea.ts
import { Command } from "commander";

export function registerEaCommands(program: Command): void {
  const ea = program
    .command("ea")
    .description("Enterprise architecture management");

  ea.command("init")
    .description("Initialize EA directory structure and config")
    .action(eaInitAction);

  ea.command("create <kind>")
    .description("Create a new EA artifact")
    .option("--title <title>", "Artifact title")
    .option("--domain <domain>", "Override domain (auto-detected from kind)")
    .option("--id <id>", "Override generated ID")
    .action(eaCreateAction);

  ea.command("validate")
    .description("Validate all EA artifacts")
    .option("--domain <domain>", "Filter to domain")
    .option("--json", "Output as JSON")
    .option("--strict", "Treat warnings as errors")
    .action(eaValidateAction);

  ea.command("drift")
    .description("Detect EA drift")
    .option("--domain <domain>", "Filter to domain")
    .option("--json", "Output as JSON")
    .option("--fail-on-warning", "Exit non-zero on warnings")
    .option("--from-snapshot <path>", "Use snapshot instead of live resolvers")
    .option("--max-cache-age <seconds>", "Max age for cached resolver data")
    .option("--no-cache", "Disable resolver cache")
    .action(eaDriftAction);

  ea.command("graph")
    .description("Export relation graph")
    .option("--format <format>", "Output format: json, mermaid, dot", "json")
    .option("--domain <domain>", "Filter to domain")
    .option("--kind <kind>", "Filter to kind")
    .action(eaGraphAction);

  ea.command("report")
    .description("Generate architecture reports")
    .option("--view <view>", "Specific view to generate")
    .option("--json", "Output as JSON")
    .option("--domain <domain>", "Filter to domain")
    .action(eaReportAction);

  ea.command("discover")
    .description("Discover artifacts from external systems")
    .option("--resolver <name>", "Use specific resolver")
    .option("--from-snapshot <path>", "Use snapshot file")
    .option("--dry-run", "Show what would be created")
    .option("--json", "Output as JSON")
    .action(eaDiscoverAction);

  ea.command("generate")
    .description("Generate implementation artifacts from EA specs")
    .option("--kind <kind>", "Generate only for specific kind")
    .option("--generator <name>", "Use specific generator")
    .option("--dry-run", "Show what would be generated")
    .option("--check", "Check for generation drift")
    .action(eaGenerateAction);

  ea.command("impact")
    .description("Analyze impact of changes on EA artifacts")
    .option("--file <path>", "File to analyze impact for")
    .option("--artifact <id>", "Artifact to analyze impact for")
    .option("--json", "Output as JSON")
    .action(eaImpactAction);

  ea.command("evidence <subcommand>")
    .description("Manage EA evidence")
    .action(eaEvidenceAction);
}
```

### Init Command Behavior

`anchored-spec ea init` should:

1. Create `specs/ea/` directory structure (only the configured/enabled domains)
2. Add EA schemas to the project (or reference them from the package)
3. Add `ea` section to `.anchored-spec/config.json` with defaults
4. Optionally create example artifacts:

```bash
anchored-spec ea init --with-examples
```

### Create Command Behavior

`anchored-spec ea create <kind>` should:

1. Resolve the domain from the kind (using the kind taxonomy)
2. Generate an ID from the title: `{domain}/{PREFIX}-{kebab-slug}`
3. Create the artifact JSON from a per-kind template
4. Write to `specs/ea/{domain}/{id-slug}.json`
5. Print the created artifact path and ID

Example:

```bash
$ anchored-spec ea create application --title "Order Service"
Created: specs/ea/systems/APP-order-service.json (systems/APP-order-service)
```

## Phase A: Systems + Delivery Core

This is the first implementation phase. One PR should cover one sub-section.

### PR A1: EA Types, Config, and Schemas

**Files to create:**
- `src/ea/types.ts` — all TypeScript interfaces from [ea-unified-artifact-model.md](./ea-unified-artifact-model.md)
- `src/ea/config.ts` — `EaConfig` type and `resolveEaConfig()` function
- `src/ea/index.ts` — barrel export

**Files to modify:**
- `src/core/types.ts` — add `ea?: EaConfig` to `AnchoredSpecConfig`

**Schemas to create:**
- `src/ea/schemas/artifact-base.schema.json`
- `src/ea/schemas/relation.schema.json`
- `src/ea/schemas/anchors.schema.json`

**Tests:**
- Config resolution with defaults
- Config resolution with overrides
- Type compatibility (ensure EaArtifactBase can represent REQ/CHG/ADR fields as kind-specific extensions)

**Acceptance criteria:**
- `EaConfig` type exists and is part of `AnchoredSpecConfig`
- `resolveEaConfig()` produces valid defaults
- Base schemas validate correct and incorrect artifacts

### PR A2: Systems and Delivery Schemas

**Schemas to create:**
- `src/ea/schemas/application.schema.json`
- `src/ea/schemas/service.schema.json`
- `src/ea/schemas/api-contract.schema.json`
- `src/ea/schemas/event-contract.schema.json`
- `src/ea/schemas/integration.schema.json`
- `src/ea/schemas/platform.schema.json`
- `src/ea/schemas/deployment.schema.json`
- `src/ea/schemas/runtime-cluster.schema.json`
- `src/ea/schemas/network-zone.schema.json`
- `src/ea/schemas/identity-boundary.schema.json`

Each schema should `$ref` `artifact-base.schema.json` and add kind-specific fields with `additionalProperties: false` on kind-specific sections but `true` on `extensions`.

**Tests:**
- Each schema validates its example artifact from [ea-unified-artifact-model.md](./ea-unified-artifact-model.md)
- Invalid artifacts are rejected (missing required fields, wrong types, invalid status)
- `extensions` field accepts arbitrary data

**Acceptance criteria:**
- All 10 schemas validate correctly against test fixtures
- Schema validation catches at minimum: missing id, missing kind, invalid status, invalid relation shape

### PR A3: EA Loader and Validator

**Files to create:**
- `src/ea/loader.ts` — loads EA artifacts from `specs/ea/` directories
- `src/ea/validate.ts` — validates EA artifacts against schemas + quality rules

**Implementation details for loader:**

```typescript
export class EaRoot {
  constructor(projectRoot: string, config: AnchoredSpecConfig) {}

  /** Load all EA artifacts across all configured domains */
  async loadArtifacts(): Promise<EaArtifact[]>;

  /** Load artifacts from a specific domain */
  async loadDomain(domain: EaDomain): Promise<EaArtifact[]>;

  /** Get summary of loaded artifacts */
  getSummary(): EaSummary;

  /** Check if EA is initialized */
  isInitialized(): boolean;
}
```

The loader should:
- Walk each configured domain directory
- Read all `.json` files
- Parse and validate against the base schema first
- Resolve `kind` to select the per-kind schema
- Validate against per-kind schema
- Return typed artifacts
- Collect and return validation errors

**Implementation details for validator:**

```typescript
export function validateEaArtifacts(
  artifacts: EaArtifact[],
  options: EaValidationOptions
): ValidationResult;
```

Quality rules for Phase A:
- `ea:quality:missing-owner` — owner array is empty
- `ea:quality:missing-summary` — summary is empty or too short
- `ea:quality:duplicate-id` — two artifacts with the same ID
- `ea:quality:invalid-id-format` — ID doesn't match `{domain}/{PREFIX}-{slug}` pattern
- `ea:quality:orphan-artifact` — artifact with no relations (warning)

**Tests:**
- Loader finds artifacts in correct directories
- Loader ignores non-JSON files
- Loader handles empty directories
- Validator catches schema violations
- Validator runs quality rules
- Validator returns structured errors with path, message, severity, rule

**Acceptance criteria:**
- `EaRoot` can load artifacts from a test fixture directory
- Validation produces correct errors for invalid artifacts
- Quality rules fire correctly

### PR A4: Relation Registry and Graph Builder

**Files to create:**
- `src/ea/relation-registry.ts` — registry with Phase A relations
- `src/ea/graph.ts` — graph builder and query API

**Implementation details for registry:**

Use the Phase A relations from [ea-relationship-model.md](./ea-relationship-model.md). The registry should be a simple in-memory structure that can be extended by later phases.

```typescript
export class RelationRegistry {
  /** Register a relation type */
  register(entry: RelationRegistryEntry): void;

  /** Get registry entry by type name */
  get(type: string): RelationRegistryEntry | undefined;

  /** Get the inverse type name for a relation type */
  getInverse(type: string): string | undefined;

  /** Check if a source kind is valid for a relation type */
  isValidSource(type: string, sourceKind: string): boolean;

  /** Check if a target kind is valid for a relation type */
  isValidTarget(type: string, targetKind: string): boolean;

  /** Get all registered types */
  allTypes(): string[];

  /** Get all registered entries */
  allEntries(): RelationRegistryEntry[];
}

/** Create registry with built-in relations for the current phase */
export function createDefaultRegistry(): RelationRegistry;
```

**Implementation details for graph builder:**

Implement the `RelationGraph` interface from [ea-relationship-model.md](./ea-relationship-model.md). Use adjacency lists internally.

Key behaviors:
- Build forward edges from artifact relations
- Build virtual inverse edges using the registry
- Detect and handle explicit inverse overrides
- Support all query methods: `outgoing()`, `incoming()`, `traverse()`, `impactSet()`, `detectCycles()`
- Support export to adjacency JSON, Mermaid, and Graphviz DOT

**Relation validation in the validator:**

Add relation validation to `src/ea/validate.ts`:
- Target exists
- Self-reference disallowed
- Relation type registered
- Source kind valid
- Target kind valid
- No forbidden cycles
- Target status compatibility
- Duplicate detection

**Tests:**
- Registry correctly validates source/target kinds
- Registry returns correct inverses
- Graph builder creates virtual inverse edges
- Graph queries return correct results
- Cycle detection works
- Mermaid and DOT export produce valid output
- Relation validation catches all error cases from [ea-relationship-model.md](./ea-relationship-model.md)

**Acceptance criteria:**
- `createDefaultRegistry()` returns registry with all Phase A relations
- `buildRelationGraph()` creates correct forward + inverse edges
- All graph query methods work correctly
- Relation validation is integrated into `ea validate`
- Graph export produces valid Mermaid and DOT

### PR A5: CLI Commands — init, create, validate, graph

**Files to create:**
- `src/cli/commands/ea.ts` — top-level command registration
- `src/cli/commands/ea-init.ts`
- `src/cli/commands/ea-create.ts`
- `src/cli/commands/ea-validate.ts`
- `src/cli/commands/ea-graph.ts`

**Files to modify:**
- `src/cli/index.ts` — register the `ea` command namespace

**Implementation notes:**

Follow the existing CLI patterns:
- Use `chalk` for colored output
- Use `ora` for spinners on long operations
- Return structured exit codes (0 for success, 1 for validation errors, 2 for fatal errors)
- Support `--json` flag for machine-readable output
- Keep CLI commands thin — delegate to core library functions

**`ea init` behavior:**
1. Check if `specs/ea/` already exists (warn if so)
2. Create directory structure for enabled domains
3. Add `ea` section to config if not present
4. Print summary of created directories
5. If `--with-examples`, create one example artifact per enabled domain

**`ea create <kind>` behavior:**
1. Validate `kind` is in the kind taxonomy
2. Resolve domain from kind
3. Generate ID from `--title` option
4. Create JSON from kind-specific template
5. Write to disk
6. Print path and ID

**`ea validate` behavior:**
1. Load all EA artifacts via `EaRoot`
2. Run schema validation
3. Run quality rules
4. Run relation validation (if graph is buildable)
5. Print findings with severity and suggestions
6. Exit with code based on severity (0 for warnings-only, 1 for errors)

**`ea graph` behavior:**
1. Load and validate artifacts
2. Build relation graph
3. Export in requested format
4. Print to stdout or write to file

**Tests:**
- All commands tested with fixture directories (follow pattern from existing `commands.test.ts`)
- `ea init` creates expected directory structure
- `ea create` writes valid JSON
- `ea validate` detects known errors
- `ea graph` produces valid output formats

**Acceptance criteria:**
- All four commands work from the CLI
- `anchored-spec ea init && anchored-spec ea create application --title "Test" && anchored-spec ea validate` succeeds
- `anchored-spec ea graph --format mermaid` produces valid Mermaid

## Phase B: Data Layer

### PR B1: Data Schemas and Types

Add kind-specific types and schemas for:
- `logical-data-model`, `physical-schema`, `data-store`, `lineage`, `master-data-domain`, `data-quality-rule`, `data-product`

Add Phase B relations to the registry:
- `stores`, `hostedOn`, `lineageFrom`, `implementedBy`

Update `ea create` templates for data kinds.

### PR B2: Data Drift Rules

Add data-specific drift rules to the validator:
- `ea:data/logical-physical-mismatch`
- `ea:data/store-undeclared-entity`
- `ea:data/lineage-stale`
- `ea:data/quality-rule-not-enforced`
- `ea:data/orphan-store`

## Phase C: Information Layer

### PR C1: Information Schemas and Types

Add kind-specific types and schemas for:
- `information-concept`, `canonical-entity`, `information-exchange`, `classification`, `retention-policy`, `glossary-term`

Add Phase C relations to the registry:
- `classifiedAs`, `exchangedVia`

### PR C2: Information Drift Rules

Add information-specific drift rules.

## Phase D: Business Layer

### PR D1: Business Schemas and Types

Add kind-specific types and schemas for:
- `mission`, `capability`, `value-stream`, `process`, `org-unit`, `policy-objective`, `business-service`, `control`

Add Phase D relations to the registry:
- `supports`, `performedBy`, `governedBy`, `owns`

### PR D2: Business Drift Rules and Capability Map Report

Add business-specific drift rules. Implement the capability map report.

## Phase E: Transitions, Evidence, Reporting

### PR E1: Transition Schemas

Add schemas and types for:
- `baseline`, `target`, `transition-plan`, `migration-wave`, `exception`

Add Phase E relations:
- `supersedes`, `generates`, `mitigates`

### PR E2: Transition Validation Rules

Implement all transition drift rules from [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md).

### PR E3: Evidence Extension

Extend existing `src/core/evidence.ts`:
- Add new evidence kinds
- Add evidence ingestion for EA artifacts
- Add evidence policy validation
- Update `anchored-spec ea evidence` CLI

### PR E4: Report Generation

Implement report generation:
- System-data matrix
- Target gap report
- Exception report
- Add `anchored-spec ea report` CLI with all view options

## Phase F: Drift Engine and Resolvers

### PR F1: EA Drift Engine

Implement `src/ea/drift.ts`:
- Resolver chain execution
- Anchor resolution
- Observed state collection
- Finding generation
- Exception suppression
- `anchored-spec ea drift` CLI fully functional

### PR F2: Discovery Pipeline

Implement `src/ea/discovery.ts`:
- Resolver `discoverArtifacts()` chain
- Deduplication against existing artifacts
- Draft artifact writing
- Discovery report generation
- `anchored-spec ea discover` CLI

### PR F3: Resolver Cache

Implement `ResolverCache`:
- Disk-based cache at `.anchored-spec/cache/ea/`
- TTL-based expiry
- CLI flags: `--max-cache-age`, `--no-cache`

### PR F4: OpenAPI Resolver

Implement the first real resolver:
- `resolveAnchors` for `apis` anchors
- `collectObservedState` from OpenAPI files
- `discoverArtifacts` to bootstrap api-contract drafts

### PR F5: Kubernetes Resolver

### PR F6: Terraform Resolver

## Phase G: Generator Framework

### PR G1: Generator Interface and CLI

Implement `src/ea/generator.ts`:
- Generator interface loading
- Generation pipeline
- Generation drift detection
- `anchored-spec ea generate` CLI

### PR G2: OpenAPI Generator

First real generator: generate OpenAPI stubs from `api-contract` artifacts.

### PR G3: JSON Schema Generator

Generate JSON Schema from `canonical-entity` artifacts.

## Phase H: REQ/CHG/ADR Subsumption

### PR H1: Legacy Kind Schemas

Create `requirement.schema.json`, `change.schema.json`, `decision.schema.json` that extend the EA base.

### PR H2: Migration Tooling

Implement `anchored-spec ea migrate-legacy`:
- Read existing REQ/CHG/ADR artifacts
- Transform to EA format (map semanticRefs → anchors, etc.)
- Write to `specs/ea/legacy/` directory
- Update relations and cross-references

### PR H3: Backward-Compatible Loaders

Update `SpecRoot` to optionally load legacy artifacts through the EA pipeline when `ea.enabled` is true.

## Testing Strategy

### Unit Tests

Every module in `src/ea/` has a corresponding test file in `src/ea/__tests__/`. Tests should:

- Use temporary directories with fixture data (follow existing patterns)
- Test both valid and invalid inputs
- Test edge cases (empty arrays, missing optional fields, boundary values)
- Test error messages are helpful (include artifact ID, field path, suggestion)

### Integration Tests

Key integration scenarios:

1. **Full lifecycle**: init → create → validate → graph → report
2. **Drift detection**: create artifacts with anchors → run resolvers → check findings
3. **Discovery**: create snapshot → discover → validate discovered artifacts
4. **Generation**: create api-contract → generate OpenAPI → verify output
5. **Transition planning**: create baseline → create target → create plan → validate gap

### Test Fixtures

Create a comprehensive fixture directory at `src/ea/__tests__/fixtures/` with:

```text
fixtures/
  valid/
    systems/
      APP-order-service.json
      API-orders-api.json
    delivery/
      DEPLOY-order-service-prod.json
      PLAT-kubernetes-prod.json
  invalid/
    missing-id.json
    invalid-relation-target.json
    cycle-detection.json
  snapshots/
    kubernetes-state.json
    openapi-spec.yaml
    terraform-state.json
```

## Fresh-Context Agent Handoff Protocol

When an agent works on this extension in a fresh context window, it should recover state in this order:

### Step 1: Read Design Documents

1. Read [ea-design-overview.md](./ea-design-overview.md) — understand decisions and phase plan
2. Read the document relevant to the current phase:
   - Phase A: [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) + [ea-relationship-model.md](./ea-relationship-model.md)
   - Phase B-D: [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) (kind taxonomy section)
   - Phase E: [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md)
   - Phase F-G: [ea-drift-resolvers-generators.md](./ea-drift-resolvers-generators.md)
   - Phase H: [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) (subsumption section)

### Step 2: Read Existing Code

3. Read [docs/concepts.md](./concepts.md) — understand existing model
4. Inspect existing code:
   - `src/core/types.ts` — current type definitions
   - `src/core/loader.ts` — how SpecRoot works
   - `src/core/validate.ts` — how validation works
   - `src/core/drift.ts` — how drift detection works
5. If EA code already exists, inspect:
   - `src/ea/index.ts` — what's already exported
   - `src/ea/types.ts` — what types exist
   - `src/ea/__tests__/` — what's already tested

### Step 3: Determine Current State

6. Check which phase/PR is current by examining:
   - Which files exist in `src/ea/`
   - Which schemas exist in `src/ea/schemas/`
   - Which CLI commands are registered
   - Which tests pass

### Step 4: Implement

7. Implement only the current PR scope (see phase sections above)
8. Write tests first or alongside implementation
9. Run `pnpm verify` to ensure nothing is broken
10. One PR per sub-section unless explicitly asked to batch

### Agent Rules

Agents should:
- **Follow existing code patterns** — match the style of `src/core/` modules
- **Keep CLI thin** — all logic in `src/ea/`, CLI commands only parse args and format output
- **Write tests** — every module gets tests, follow existing vitest patterns
- **Not mix phases** — don't implement Phase B code in a Phase A PR
- **Not add dependencies** — use existing deps (ajv, commander, chalk) unless truly necessary
- **Not introduce a UI** — CLI and JSON outputs only
- **Not overload existing REQ semantics** — EA artifacts are separate until Phase H

Agents should not:
- Mix EA schema work with resolver implementation in the same PR
- Introduce a web UI before the CLI/data model stabilizes
- Add runtime agents or daemons
- Modify existing `REQ`, `CHG`, `ADR` schemas (those stay untouched until Phase H)
- Skip tests to save time

## Verification Checklist

Before marking any PR as complete, verify:

- [ ] All new TypeScript compiles without errors
- [ ] All new schemas validate their example fixtures
- [ ] All new tests pass
- [ ] `pnpm verify` passes (full existing test suite + new tests)
- [ ] `pnpm build` succeeds
- [ ] New files follow existing code style and patterns
- [ ] CLI commands produce helpful output (not just raw JSON)
- [ ] `--json` flag works on all new commands
- [ ] Error messages include artifact ID, field path, and suggestions where applicable
