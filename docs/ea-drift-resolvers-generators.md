# EA Drift, Resolvers, and Generators

This document specifies the three plugin interfaces that connect EA artifacts to the outside world: **resolvers** (read observed state), **generators** (write implementation artifacts), and **discovery** (bootstrap EA artifacts from observed state).

Read [ea-design-overview.md](./ea-design-overview.md) for context and [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) for the artifact model.

## Architectural Overview

The spec-as-source lifecycle forms a bidirectional loop:

```
                     ┌──────────────────────────────┐
                     │   EA Artifacts (Spec-as-Source) │
                     └──────┬───────────────┬────────┘
                            │               │
                     Generate (→)      Resolve (←)
                            │               │
                     ┌──────▼───────────────▼────────┐
                     │    Observable Reality           │
                     │  (APIs, infra, schemas, code)   │
                     └──────┬───────────────┬────────┘
                            │               │
                      Drift (Δ)       Discover (↑)
                            │               │
                     ┌──────▼───────────────▼────────┐
                     │   Findings & Draft Artifacts    │
                     └─────────────────────────────────┘
```

1. **Generators** transform EA artifacts → implementation artifacts (OpenAPI, Terraform, K8s, JSON Schema)
2. **Resolvers** read observed state ← external systems (K8s API, cloud inventory, API catalogs)
3. **Drift engine** compares declared (EA) vs observed (resolvers) and emits findings
4. **Discovery** reverses the resolver flow: observed state → draft EA artifacts

## Resolver Interface

### Core Interface

```typescript
export interface EaResolver {
  /** Unique name for this resolver */
  name: string;

  /** Which EA domains this resolver operates on */
  domains?: EaDomain[];

  /** Which artifact kinds this resolver can handle */
  kinds?: string[];

  /**
   * Resolve anchors for a specific artifact against observed reality.
   * Returns anchor resolutions indicating what was found/missing.
   * Return null to defer to the next resolver in the chain.
   */
  resolveAnchors?(
    artifact: EaArtifact,
    ctx: EaResolverContext
  ): Promise<EaAnchorResolution[] | null> | EaAnchorResolution[] | null;

  /**
   * Collect the full observed state from an external system.
   * Used for topology-level drift detection (comparing declared graph vs observed graph).
   * Return null if this resolver cannot collect state.
   */
  collectObservedState?(
    ctx: EaResolverContext
  ): Promise<ObservedEaState | null> | ObservedEaState | null;

  /**
   * Discover artifacts from observed state (reverse direction).
   * Returns draft artifacts with confidence: "inferred" or "observed".
   * Used by `ea discover` command.
   */
  discoverArtifacts?(
    ctx: EaResolverContext
  ): Promise<EaArtifactDraft[] | null> | EaArtifactDraft[] | null;
}
```

### Resolver Context

```typescript
export interface EaResolverContext {
  /** Absolute path to the project root */
  projectRoot: string;

  /** The full anchored-spec config */
  config: AnchoredSpecConfig;

  /** EA-specific configuration */
  eaConfig: EaConfig;

  /** All loaded EA artifacts (for cross-reference during resolution) */
  artifacts: EaArtifact[];

  /** The relation graph (for topology comparison) */
  graph: RelationGraph;

  /** Cache interface for storing/retrieving observed state */
  cache: ResolverCache;

  /** Logger for structured output */
  logger: ResolverLogger;
}
```

### Resolver Cache

Resolvers can cache observed state to avoid repeated expensive calls to external systems.

```typescript
export interface ResolverCache {
  /**
   * Get cached data. Returns null if not cached or expired.
   * @param key - Cache key (resolver chooses its own key space)
   * @param maxAge - Maximum age in seconds. If the cached entry is older, returns null.
   */
  get<T>(key: string, maxAge?: number): T | null;

  /**
   * Store data in cache.
   * @param key - Cache key
   * @param value - Data to cache
   */
  set<T>(key: string, value: T): void;

  /** Invalidate a specific cache key */
  invalidate(key: string): void;

  /** Invalidate all cached data for this resolver */
  invalidateAll(): void;
}
```

Cache is stored on disk at `.anchored-spec/cache/ea/`. Cache TTL is configurable per resolver in the EA config.

Resolvers can be referenced by `name` for built-in resolvers or by `path` for custom modules. When `resolvers[]` is configured, only the listed resolvers run. When omitted, all built-in resolvers run by default.

```json
{
  "resolvers": [
    { "name": "openapi" },
    { "name": "kubernetes", "cacheTTL": 3600 },
    { "name": "tree-sitter", "options": { "queryPacks": ["javascript"] } },
    { "path": "./ea/resolvers/custom-resolver.js", "options": { "source": "./specs" } }
  ]
}
```

### Resolver Logger

```typescript
export interface ResolverLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}
```

### Anchor Resolution

```typescript
export interface EaAnchorResolution {
  /** The anchor kind being resolved (apis, infra, schemas, etc.) */
  anchorKind: keyof Anchors | string;

  /** The specific anchor value being checked */
  anchorValue: string;

  /** Whether the anchor was found in observed state */
  status: "found" | "missing" | "changed" | "unknown";

  /** Where the anchor was found (file path, URL, resource ARN, etc.) */
  foundIn?: string[];

  /** If status is "changed", what the observed value looks like */
  observedValue?: string;

  /** Confidence in this resolution */
  confidence: "high" | "medium" | "low";

  /** When this resolution was performed */
  resolvedAt: string;

  /** Human-readable detail */
  message?: string;
}
```

### Observed State

For topology-level drift detection, resolvers collect the full observed state of an external system.

```typescript
export interface ObservedEaState {
  /** Which resolver produced this state */
  source: string;

  /** When the state was collected */
  collectedAt: string;

  /** Observed resources/entities */
  entities: ObservedEntity[];

  /** Observed relationships between entities */
  relationships: ObservedRelationship[];
}

export interface ObservedEntity {
  /** External identifier (K8s name, Terraform resource ID, etc.) */
  externalId: string;

  /** What EA kind this maps to */
  inferredKind?: string;

  /** What EA domain this belongs to */
  inferredDomain?: EaDomain;

  /** Matched EA artifact ID, if known */
  matchedArtifactId?: string;

  /** Raw metadata from the external system */
  metadata?: Record<string, unknown>;
}

export interface ObservedRelationship {
  sourceExternalId: string;
  targetExternalId: string;
  type: string;
}
```

### Artifact Draft (Discovery Output)

```typescript
export interface EaArtifactDraft {
  /** Suggested ID (may need human adjustment) */
  suggestedId: string;

  /** Inferred kind */
  kind: string;

  /** Inferred title */
  title: string;

  /** Generated summary */
  summary: string;

  /** Always "draft" for discovered artifacts */
  status: "draft";

  /** How the artifact was discovered */
  confidence: "observed" | "inferred";

  /** Populated anchors that link back to the source */
  anchors: Anchors;

  /** Inferred relations to other discovered or existing artifacts */
  relations?: Relation[];

  /** Which resolver discovered this */
  discoveredBy: string;

  /** When it was discovered */
  discoveredAt: string;

  /** Kind-specific fields inferred from the source */
  kindSpecificFields?: Record<string, unknown>;
}
```

## Resolver Chain

Resolvers are executed in the order they appear in config. The chain follows the same semantics as the existing drift resolver chain:

1. For each EA artifact with anchors, iterate resolvers in order
2. For each resolver, check if its `domains` and `kinds` match the artifact
3. Call `resolveAnchors()` — if it returns `EaAnchorResolution[]`, use the results (stop chain for resolved anchors)
4. If it returns `null`, defer to the next resolver
5. After all resolvers, any unresolved anchors are reported as `"unknown"` findings

For topology-level drift:

1. Call `collectObservedState()` on each resolver that implements it
2. Merge all observed states into a combined topology
3. Compare declared relation graph against observed topology
4. Emit findings for declared-but-not-observed and observed-but-not-declared

## Drift Detection Model

### Drift Categories

EA drift is organized into five domain-specific categories, each with its own set of rules.

#### 1. Systems Drift

Detect mismatches between declared system architecture and observed reality.

| Rule ID | Severity | Description |
|---|---|---|
| `ea:systems/undocumented-api` | error | Observed API endpoint not declared in any api-contract artifact |
| `ea:systems/missing-api` | error | Declared API endpoint not found in observed state |
| `ea:systems/runtime-integration-not-modeled` | warning | Observed integration between services has no EA integration artifact |
| `ea:systems/event-topology-mismatch` | warning | Declared event contract consumers/producers differ from observed |
| `ea:systems/dependency-graph-mismatch` | warning | Observed service dependencies differ from declared `uses`/`dependsOn` relations |
| `ea:systems/orphan-application` | warning | Application artifact with no relations to other artifacts |

#### 2. Delivery Drift

Detect mismatches between declared delivery architecture and deployed reality.

| Rule ID | Severity | Description |
|---|---|---|
| `ea:delivery/unmodeled-deployment` | error | Observed deployment has no corresponding EA deployment artifact |
| `ea:delivery/missing-deployment` | error | Declared deployment not found in observed state |
| `ea:delivery/platform-mismatch` | warning | Deployment running on different platform than declared |
| `ea:delivery/identity-boundary-mismatch` | warning | Service identity differs from declared identity boundary |
| `ea:delivery/technology-standard-violation` | error | Deployed technology not in approved technology-standard artifacts |
| `ea:delivery/zone-violation` | error | Deployment in wrong network zone compared to declaration |

#### 3. Data Drift (Phase B)

| Rule ID | Severity | Description |
|---|---|---|
| `ea:data/logical-physical-mismatch` | error | Physical schema diverges from logical data model |
| `ea:data/store-undeclared-entity` | warning | Data store contains tables/collections not declared in any data model |
| `ea:data/lineage-stale` | warning | Lineage declaration references entities that no longer exist |
| `ea:data/quality-rule-not-enforced` | warning | Data quality rule exists in EA but not in execution system (dbt, Great Expectations, etc.) |
| `ea:data/orphan-store` | warning | Data store artifact with no application or lineage references |

#### 4. Information Drift (Phase C)

| Rule ID | Severity | Description |
|---|---|---|
| `ea:information/entity-missing-implementation` | warning | Canonical entity has no physical implementation |
| `ea:information/exchange-missing-contract` | error | Information exchange has no API or event contract |
| `ea:information/classification-not-propagated` | warning | Classification not applied to stores/schemas that handle the classified entity |
| `ea:information/retention-not-enforced` | warning | Retention policy exists but no evidence of enforcement |

#### 5. Business Drift (Phase D)

| Rule ID | Severity | Description |
|---|---|---|
| `ea:business/no-realizing-systems` | warning | Business capability with no realizing applications or services |
| `ea:business/process-missing-owner` | warning | Process with no owning org unit |
| `ea:business/control-missing-evidence` | warning | Control with no supporting policy or evidence |
| `ea:business/retired-system-dependency` | error | Active capability depends on retired system |

### Drift Finding Shape

```typescript
export interface EaDriftFinding {
  /** The drift rule that triggered this finding */
  rule: string;

  /** error | warning | info */
  severity: "error" | "warning" | "info";

  /** The EA artifact that is the subject of the finding */
  artifactId: string;

  /** File path of the artifact */
  path: string;

  /** Which EA domain this finding belongs to */
  domain: EaDomain;

  /** Human-readable description of the drift */
  message: string;

  /** Suggested remediation */
  suggestion?: string;

  /** The specific anchor or relation that triggered the finding */
  anchor?: {
    kind: string;
    value: string;
  };

  /** Observed state that contradicts the declaration */
  observed?: {
    source: string;
    value: string;
  };

  /** Whether this finding is suppressed by an exception */
  suppressed: boolean;

  /** If suppressed, which exception artifact suppresses it */
  suppressedBy?: string;
}
```

### Drift Report Shape

```typescript
export interface EaDriftReport {
  /** Whether all checks passed (no errors) */
  passed: boolean;

  /** Summary counts */
  summary: {
    errors: number;
    warnings: number;
    info: number;
    suppressed: number;
  };

  /** Breakdown by domain */
  byDomain: Record<EaDomain, {
    errors: number;
    warnings: number;
    info: number;
  }>;

  /** All findings */
  findings: EaDriftFinding[];

  /** When the drift check was performed */
  checkedAt: string;

  /** Which resolvers contributed */
  resolversUsed: string[];
}
```

### Exception Suppression

The drift engine checks loaded `exception` artifacts before emitting findings:

1. For each finding, check if any active (non-expired) exception covers it
2. An exception covers a finding if:
   - the finding's `artifactId` is in the exception's `scope.artifactIds` (or scope is empty = all)
   - AND the finding's `rule` is in the exception's `scope.rules` (or scope is empty = all)
   - AND the exception's `status` is `"active"`
   - AND `expiresAt` is in the future
3. Suppressed findings are still included in the report with `suppressed: true` and `suppressedBy` set
4. Expired exceptions produce their own finding: `ea:exception/expired`

### Drift Engine Extension

The EA drift engine in `src/ea/drift.ts` provides domain-specific drift detection with 42 rules.

```typescript
// In src/ea/drift.ts

export interface EaDriftOptions {
  /** EA artifacts to check */
  artifacts: EaArtifact[];

  /** Relation graph */
  graph: RelationGraph;

  /** EA resolvers to use */
  resolvers: EaResolver[];

  /** Exception artifacts for suppression */
  exceptions: ExceptionArtifact[];

  /** EA config */
  eaConfig: EaConfig;

  /** Project root */
  projectRoot: string;

  /** Filter to specific domains */
  domains?: EaDomain[];

  /** Maximum age for cached resolver data (seconds) */
  maxCacheAge?: number;

  /** Severity override rules from config */
  ruleOverrides?: Record<string, "error" | "warning" | "info" | "off">;
}

export async function detectEaDrift(options: EaDriftOptions): Promise<EaDriftReport>;
```

### Drift Processing Pipeline

1. Load EA artifacts from `specs/ea/`
2. Build relation graph
3. Load exception artifacts
4. For each artifact with anchors:
   a. Run resolver chain to resolve anchors
   b. Collect anchor-level findings (missing, changed)
5. For each resolver with `collectObservedState`:
   a. Collect observed topology
   b. Compare declared graph vs observed topology
   c. Collect topology-level findings (undeclared deployments, missing integrations)
6. For each finding:
   a. Check exception suppression
   b. Apply severity overrides from config
7. Aggregate findings into `EaDriftReport`
8. Return report (or write to `specs/ea/generated/drift-report.json`)

### CLI Surface

```bash
# Run all EA drift checks
anchored-spec drift

# Filter to specific domain
anchored-spec drift --domain systems
anchored-spec drift --domain delivery

# Output formats
anchored-spec drift --json
anchored-spec drift --json > drift-report.json

# Fail CI on warnings
anchored-spec drift --fail-on-warning

# Use external snapshot instead of live resolvers
anchored-spec drift --from-snapshot ./snapshots/kubernetes-state.json

# Control cache behavior
anchored-spec drift --max-cache-age 3600
anchored-spec drift --no-cache
```

## Generator Framework

Generators transform EA artifacts into implementation artifacts. This is the "generative" half of spec-as-source.

### Generator Interface

```typescript
export interface EaGenerator {
  /** Unique name for this generator */
  name: string;

  /** Which artifact kinds this generator can process */
  kinds: string[];

  /** Output format identifier */
  outputFormat: string;

  /**
   * Generate implementation artifacts from an EA artifact.
   * Returns one or more generated outputs.
   */
  generate(
    artifact: EaArtifact,
    ctx: EaGeneratorContext
  ): Promise<GeneratedOutput[]>;

  /**
   * Compare current generated output against the EA artifact to detect generation drift.
   * Returns findings for cases where the generated artifact has been manually modified
   * and no longer matches what the spec would generate.
   */
  diff?(
    currentOutput: string,
    artifact: EaArtifact,
    ctx: EaGeneratorContext
  ): Promise<GenerationDrift[]>;
}
```

### Generator Context

```typescript
export interface EaGeneratorContext {
  /** Absolute path to the project root */
  projectRoot: string;

  /** EA config */
  eaConfig: EaConfig;

  /** All loaded EA artifacts (for cross-reference during generation) */
  artifacts: EaArtifact[];

  /** Relation graph (for generating relationship-aware outputs) */
  graph: RelationGraph;

  /** Output directory for generated files */
  outputDir: string;

  /** Logger */
  logger: ResolverLogger;
}
```

### Generated Output

```typescript
export interface GeneratedOutput {
  /** Relative path where this output should be written */
  relativePath: string;

  /** The generated content */
  content: string;

  /** Content type for logging/display */
  contentType: "yaml" | "json" | "hcl" | "markdown" | "typescript" | "sql" | "other";

  /** The EA artifact ID this was generated from */
  sourceArtifactId: string;

  /** Human-readable description of what was generated */
  description: string;

  /** Whether this output should overwrite existing files */
  overwrite: boolean;
}
```

### Generation Drift

When a generated file has been manually modified, the generator can detect divergence:

```typescript
export interface GenerationDrift {
  /** Path to the generated file that has drifted */
  filePath: string;

  /** The EA artifact that should govern this file */
  sourceArtifactId: string;

  /** Description of the drift */
  message: string;

  /** Whether the manual changes should be incorporated back into the spec */
  suggestion: "regenerate" | "update-spec" | "review";
}
```

### Generator Registration

Generators are registered in the EA config:

```json
{
  "ea": {
    "generators": [
      {
        "path": "./.anchored-spec/ea-generators/openapi.js",
        "outputDir": "generated/api",
        "options": {
          "specVersion": "3.1.0"
        }
      },
      {
        "path": "./.anchored-spec/ea-generators/jsonschema.js",
        "outputDir": "generated/schemas"
      }
    ]
  }
}
```

### CLI Surface

```bash
# Generate all outputs from all generators
anchored-spec generate

# Generate only from specific kinds
anchored-spec generate --kind api-contract
anchored-spec generate --kind canonical-entity

# Generate with specific generator
anchored-spec generate --generator openapi

# Dry run — show what would be generated without writing
anchored-spec generate --dry-run

# Check for generation drift (generated files modified manually)
anchored-spec generate --check
```

### Example Generator: OpenAPI from api-contract

This is a conceptual example of what a generator implementation looks like. Actual generators ship in later phases.

```typescript
const openapiGenerator: EaGenerator = {
  name: "openapi",
  kinds: ["api-contract"],
  outputFormat: "openapi",

  async generate(artifact, ctx) {
    const apiContract = artifact as ApiContractArtifact;
    if (apiContract.protocol !== "rest") return [];

    // Build OpenAPI skeleton from anchors
    const spec = {
      openapi: "3.1.0",
      info: {
        title: apiContract.title,
        description: apiContract.summary,
        version: apiContract.version || "1.0.0"
      },
      paths: {}
    };

    // Generate path stubs from anchors.apis
    for (const api of apiContract.anchors?.apis || []) {
      const [method, path] = api.split(" ");
      spec.paths[path] = spec.paths[path] || {};
      spec.paths[path][method.toLowerCase()] = {
        summary: `${method} ${path}`,
        operationId: `${method.toLowerCase()}${path.replace(/[/:]/g, "_")}`,
        responses: { "200": { description: "Success" } }
      };
    }

    return [{
      relativePath: `${apiContract.id.split("/")[1]}.openapi.yaml`,
      content: yamlStringify(spec),
      contentType: "yaml",
      sourceArtifactId: apiContract.id,
      description: `OpenAPI spec for ${apiContract.title}`,
      overwrite: false
    }];
  }
};
```

## Discovery Workflow

Discovery is the reverse of drift detection: instead of checking declared state against observed state, it creates declared state from observed state.

### Discovery Pipeline

1. Run each resolver's `discoverArtifacts()` method
2. Collect all `EaArtifactDraft` results
3. Deduplicate by matching against existing EA artifacts (by anchor overlap)
4. For artifacts that match existing EA artifacts, report them as "already modeled"
5. For new artifacts, write draft JSON files to `specs/ea/{domain}/` with `status: "draft"` and `confidence: "inferred"` or `"observed"`
6. Generate a discovery report showing what was found

### Deduplication Strategy

A discovered artifact matches an existing artifact if:

- same kind AND at least one anchor value matches, OR
- same kind AND title similarity above threshold (fuzzy match for human-authored titles)

Matches are reported but not overwritten. New anchors found during discovery can be suggested as additions to existing artifacts.

### CLI Surface

```bash
# Discover from all configured resolvers
anchored-spec discover

# Discover from specific resolver
anchored-spec discover --resolver kubernetes
anchored-spec discover --resolver terraform

# Discover from a snapshot file
anchored-spec discover --from-snapshot ./snapshots/k8s-inventory.json

# Dry run — show what would be created
anchored-spec discover --dry-run

# Output discovery report
anchored-spec discover --json

# Discover from source code using tree-sitter
anchored-spec discover --resolver tree-sitter

# Discover using resolvers from config.json (no --resolver flag needed)
anchored-spec discover
```

### Discovery Report

```json
{
  "discoveredAt": "2026-03-28T12:00:00Z",
  "resolversUsed": ["openapi", "kubernetes", "tree-sitter"],
  "summary": {
    "newArtifacts": 12,
    "matchedExisting": 5,
    "suggestedUpdates": 3
  },
  "newArtifacts": [
    {
      "suggestedId": "delivery/DEPLOY-payment-service-prod",
      "kind": "deployment",
      "title": "Payment Service Production Deployment",
      "confidence": "observed",
      "discoveredBy": "kubernetes",
      "writtenTo": "specs/ea/delivery/DEPLOY-payment-service-prod.json"
    }
  ],
  "matchedExisting": [
    {
      "existingId": "delivery/DEPLOY-order-service-prod",
      "matchedBy": "anchor:kubernetes:deployment/order-service",
      "suggestedAnchorsToAdd": []
    }
  ],
  "suggestedUpdates": [
    {
      "existingId": "systems/APP-order-service",
      "suggestion": "Add anchor: kubernetes:service/order-service",
      "source": "kubernetes"
    }
  ]
}
```

## Initial Resolver Targets

These resolvers are planned for implementation. Each is a separate module.

### OpenAPI Resolver (Systems)

- **Input**: OpenAPI/Swagger files in the repo or at configured URLs
- **resolveAnchors**: checks that declared `apis` anchors exist in OpenAPI specs
- **collectObservedState**: builds a list of all endpoints from OpenAPI files
- **discoverArtifacts**: creates draft `api-contract` artifacts from OpenAPI files

### AsyncAPI Resolver (Systems)

- **Input**: AsyncAPI files in the repo
- **resolveAnchors**: checks that declared `events` anchors exist in AsyncAPI specs
- **collectObservedState**: builds a list of all channels/messages
- **discoverArtifacts**: creates draft `event-contract` artifacts

### Kubernetes Resolver (Delivery)

- **Input**: K8s manifests in the repo, or K8s API snapshots
- **resolveAnchors**: checks that declared `infra` anchors (`kubernetes:*`) exist in manifests
- **collectObservedState**: lists all deployments, services, ingresses, configmaps
- **discoverArtifacts**: creates draft `deployment`, `platform`, `network-zone` artifacts

### Terraform Resolver (Delivery)

- **Input**: Terraform state files or plan JSON
- **resolveAnchors**: checks that declared `infra` anchors (`terraform:*`) exist in state
- **collectObservedState**: lists all managed resources
- **discoverArtifacts**: creates draft `cloud-resource`, `platform`, `data-store` artifacts

### SQL DDL Resolver (Data)

- **Input**: SQL migration files or DDL dumps
- **resolveAnchors**: checks that declared `schemas` anchors match DDL tables/columns
- **collectObservedState**: lists all tables, columns, constraints
- **discoverArtifacts**: creates draft `physical-schema` and `data-store` artifacts

### dbt Resolver (Data)

- **Input**: dbt manifest.json
- **resolveAnchors**: checks `other.dbt` anchors against dbt models
- **collectObservedState**: builds dbt model graph with sources and exposures
- **discoverArtifacts**: creates draft `lineage` and `data-product` artifacts

### Tree-sitter Resolver (Cross-Domain)

- **Input**: Application source code (any language with a Tree-sitter grammar)
- **Peer dependency**: `web-tree-sitter` (optional; resolver skips silently if not installed)
- **discoverArtifacts**: Scans source code using declarative query packs to discover:
  - **Routes** (Express, Fastify, Next.js) → `api-contract` artifacts
  - **DB access** (Prisma, TypeORM) → `physical-schema` artifacts
  - **Events** (EventEmitter, Bull/BullMQ) → `event-contract` artifacts
  - **External calls** (fetch, axios) → `service` artifacts

Query packs are language-specific collections of Tree-sitter S-expression patterns. Built-in packs cover JavaScript/TypeScript; custom packs can be added for any language via config:

```json
{
  "resolvers": [
    {
      "name": "tree-sitter",
      "options": {
        "queryPacks": ["javascript"],
        "customPacks": ["./ea/resolvers/packs/python-routes.js"]
      }
    }
  ]
}
```

All discovered artifacts are created with `status: "draft"` and `confidence: "observed"` or `"inferred"`. Human review and promotion is required.

## Config-Driven Resolver Loading

The `resolvers` array in `.anchored-spec/config.json` controls which resolvers run and how they are configured. When this array is populated, only the listed resolvers are used. When omitted or empty, all built-in resolvers run by default.

### Built-in Resolvers by Name

Reference any built-in resolver by `name`:

| Name | Resolver | Primary Artifacts |
|------|----------|-------------------|
| `openapi` | OpenAPI Resolver | `api-contract` |
| `kubernetes` | Kubernetes Resolver | `deployment`, `platform` |
| `terraform` | Terraform Resolver | `cloud-resource`, `platform` |
| `sql-ddl` | SQL DDL Resolver | `physical-schema`, `data-store` |
| `dbt` | dbt Resolver | `lineage`, `data-product` |
| `tree-sitter` | Tree-sitter Resolver | `api-contract`, `physical-schema`, `event-contract`, `service` |

### Custom Resolvers by Path

Load custom resolver modules via `path`. The module must export an `EaResolver` implementation (default export as class or instance):

```json
{
  "resolvers": [
    { "path": "./ea/resolvers/custom-graphql.js" }
  ]
}
```

```typescript
// ea/resolvers/custom-graphql.js
export default class GraphQLResolver {
  name = "graphql";
  discoverArtifacts(ctx) {
    // Scan for .graphql files and create api-contract drafts
    return [...];
  }
}
```

### Resolver Options

Both built-in and custom resolvers accept `options` and `cacheTTL`:

```json
{
  "resolvers": [
    { "name": "openapi", "cacheTTL": 3600 },
    { "name": "tree-sitter", "options": { "queryPacks": ["javascript"], "customPacks": ["./packs/vue.js"] } },
    { "path": "./custom.js", "options": { "endpoint": "https://api.example.com" } }
  ]
}
```

### Resolution Order

1. If `--resolver <name>` CLI flag is provided → only that resolver runs
2. Else if `config.resolvers[]` is non-empty → listed resolvers run in order
3. Else → all built-in resolvers run (including tree-sitter if `web-tree-sitter` is installed)
