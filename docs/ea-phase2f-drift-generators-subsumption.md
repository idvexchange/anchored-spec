# EA Phase 2F: Drift Engine, Resolvers, Generators, and Subsumption

This document specifies the final Phase 2 sub-phase: the full drift engine, real resolver packs, the generator framework, and REQ/CHG/ADR subsumption tooling.

## Prerequisites

- Phase 1 complete
- Phases 2A–2E complete (all 41 kinds, 27 relations, transition model, evidence extension)
- Read [ea-phase2-overview.md](./ea-phase2-overview.md) for Phase 2 context
- Read [ea-drift-resolvers-generators.md](./ea-drift-resolvers-generators.md) for the detailed interface definitions

## What This Phase Adds

| Deliverable | Description |
|---|---|
| EA Drift Engine | Full drift detection across all 5 NIST domains |
| Discovery Pipeline | `ea discover` command with reverse-resolver bootstrapping |
| Resolver Cache | Disk-based cache with configurable TTL |
| OpenAPI Resolver | Systems drift: API anchor resolution + discovery |
| Kubernetes Resolver | Delivery drift: deployment/service resolution + discovery |
| Terraform Resolver | Delivery drift: infrastructure resolution + discovery |
| SQL DDL Resolver | Data drift: schema resolution + discovery |
| dbt Resolver | Data drift: lineage resolution + discovery |
| Generator Framework | Plugin interface for spec-to-artifact generation |
| OpenAPI Generator | Generate OpenAPI stubs from `api-contract` artifacts |
| JSON Schema Generator | Generate JSON Schema from `canonical-entity` artifacts |
| Legacy Migration Tool | Migrate REQ/CHG/ADR to unified EA model |
| Legacy Kind Schemas | `requirement`, `change`, `decision` as EA kinds |

**New kinds (subsumption):** 3 (`requirement`, `change`, `decision`)

**New relations:** 1 (`implementedBy` extended for legacy)

**Final total after 2F:** 44 kinds, 28 relations

## Part 1: EA Drift Engine

### Implementation: `src/ea/drift.ts`

The drift engine extends the existing `detectDrift()` in `src/core/drift.ts`. It does NOT replace it — legacy drift (code symbol checking for REQ artifacts) continues to work.

```typescript
export async function detectEaDrift(options: EaDriftOptions): Promise<EaDriftReport> {
  const findings: EaDriftFinding[] = [];

  // 1. Anchor-level drift: for each artifact with anchors, run resolver chain
  for (const artifact of options.artifacts) {
    if (!artifact.anchors) continue;
    const anchorFindings = await resolveArtifactAnchors(artifact, options);
    findings.push(...anchorFindings);
  }

  // 2. Topology-level drift: collect observed state, compare to declared graph
  const observedStates = await collectAllObservedState(options);
  const topologyFindings = compareTopology(options.graph, observedStates, options.artifacts);
  findings.push(...topologyFindings);

  // 3. Graph-integrity drift: run domain-specific rules against the relation graph
  const graphFindings = runGraphIntegrityRules(options.graph, options.artifacts);
  findings.push(...graphFindings);

  // 4. Apply exception suppression
  const suppressedFindings = applySuppression(findings, options.exceptions);

  // 5. Apply severity overrides from config
  const finalFindings = applySeverityOverrides(suppressedFindings, options.ruleOverrides);

  // 6. Build report
  return buildReport(finalFindings, options);
}
```

### Anchor Resolution Implementation

For each artifact with anchors, iterate through configured resolvers:

```typescript
async function resolveArtifactAnchors(
  artifact: EaArtifact,
  options: EaDriftOptions
): Promise<EaDriftFinding[]> {
  const findings: EaDriftFinding[] = [];
  const anchors = artifact.anchors;

  for (const [anchorKind, anchorValues] of Object.entries(anchors)) {
    if (anchorKind === "other") {
      // Handle extensible anchors
      for (const [subKind, values] of Object.entries(anchorValues as Record<string, string[]>)) {
        for (const value of values) {
          const resolution = await resolveOneAnchor(artifact, subKind, value, options);
          if (resolution && resolution.status !== "found") {
            findings.push(anchorResolutionToFinding(artifact, resolution));
          }
        }
      }
    } else {
      for (const value of anchorValues as string[]) {
        const resolution = await resolveOneAnchor(artifact, anchorKind, value, options);
        if (resolution && resolution.status !== "found") {
          findings.push(anchorResolutionToFinding(artifact, resolution));
        }
      }
    }
  }

  return findings;
}
```

### Graph Integrity Rules

These rules don't require external resolvers — they analyze the relation graph for structural problems:

```typescript
function runGraphIntegrityRules(
  graph: RelationGraph,
  artifacts: EaArtifact[]
): EaDriftFinding[] {
  const findings: EaDriftFinding[] = [];

  // Run all registered graph-integrity drift rules
  // Each domain's rules are defined in Phase 2A-2E documents
  findings.push(...runBusinessDriftRules(graph, artifacts));
  findings.push(...runInformationDriftRules(graph, artifacts));
  findings.push(...runSystemsDriftRules(graph, artifacts));
  findings.push(...runDataDriftRules(graph, artifacts));
  findings.push(...runDeliveryDriftRules(graph, artifacts));
  findings.push(...runTransitionDriftRules(graph, artifacts));

  return findings;
}
```

### Drift Report: Heatmap View

The drift heatmap shows findings aggregated by domain and severity:

```json
{
  "generatedAt": "2026-03-29T07:00:00Z",
  "heatmap": {
    "systems": { "errors": 2, "warnings": 3, "info": 1 },
    "delivery": { "errors": 1, "warnings": 2, "info": 0 },
    "data": { "errors": 0, "warnings": 4, "info": 2 },
    "information": { "errors": 1, "warnings": 1, "info": 0 },
    "business": { "errors": 0, "warnings": 3, "info": 1 },
    "transitions": { "errors": 0, "warnings": 1, "info": 0 }
  },
  "topRules": [
    { "rule": "ea:data/store-undeclared-entity", "count": 3 },
    { "rule": "ea:systems/undocumented-api", "count": 2 },
    { "rule": "ea:business/no-realizing-systems", "count": 2 }
  ]
}
```

## Part 2: Discovery Pipeline

### Implementation: `src/ea/discovery.ts`

```typescript
export async function discoverArtifacts(
  options: EaDiscoveryOptions
): Promise<DiscoveryReport> {
  const drafts: EaArtifactDraft[] = [];
  const matches: DiscoveryMatch[] = [];
  const suggestions: DiscoverySuggestion[] = [];

  // 1. Run each resolver's discoverArtifacts()
  for (const resolver of options.resolvers) {
    if (!resolver.discoverArtifacts) continue;

    const discovered = await resolver.discoverArtifacts(options.ctx);
    if (!discovered) continue;

    for (const draft of discovered) {
      // 2. Deduplicate against existing artifacts
      const existingMatch = findMatchingArtifact(draft, options.existingArtifacts);

      if (existingMatch) {
        matches.push({ existingId: existingMatch.id, draft, matchedBy: computeMatchReason(draft, existingMatch) });

        // Check for suggested anchor additions
        const newAnchors = findNewAnchors(draft, existingMatch);
        if (newAnchors.length > 0) {
          suggestions.push({ existingId: existingMatch.id, newAnchors, source: resolver.name });
        }
      } else {
        drafts.push(draft);
      }
    }
  }

  // 3. Write draft artifacts to disk (unless dry-run)
  if (!options.dryRun) {
    for (const draft of drafts) {
      const artifact = draftToArtifact(draft);
      const filePath = computeFilePath(artifact, options.eaConfig);
      writeArtifactFile(filePath, artifact);
    }
  }

  // 4. Build report
  return { discoveredAt: new Date().toISOString(), drafts, matches, suggestions };
}
```

### Deduplication Logic

```typescript
function findMatchingArtifact(
  draft: EaArtifactDraft,
  existing: EaArtifact[]
): EaArtifact | undefined {
  // Strategy 1: Exact anchor match
  for (const artifact of existing) {
    if (artifact.kind !== draft.kind) continue;
    if (hasOverlappingAnchors(draft.anchors, artifact.anchors)) {
      return artifact;
    }
  }

  // Strategy 2: Title similarity (fuzzy)
  for (const artifact of existing) {
    if (artifact.kind !== draft.kind) continue;
    if (titleSimilarity(draft.title, artifact.title) > 0.8) {
      return artifact;
    }
  }

  return undefined;
}
```

## Part 3: Resolver Cache

### Implementation: `src/ea/cache.ts`

```typescript
export class DiskResolverCache implements ResolverCache {
  constructor(private cacheDir: string, private defaultTTL: number) {}

  get<T>(key: string, maxAge?: number): T | null {
    const filePath = this.keyToPath(key);
    if (!existsSync(filePath)) return null;

    const entry = JSON.parse(readFileSync(filePath, "utf-8"));
    const age = (Date.now() - entry.timestamp) / 1000;
    const ttl = maxAge ?? this.defaultTTL;

    if (age > ttl) return null;
    return entry.data as T;
  }

  set<T>(key: string, value: T): void {
    const filePath = this.keyToPath(key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ timestamp: Date.now(), data: value }));
  }

  invalidate(key: string): void { unlinkSync(this.keyToPath(key)); }
  invalidateAll(): void { rmSync(this.cacheDir, { recursive: true, force: true }); }

  private keyToPath(key: string): string {
    return join(this.cacheDir, key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
  }
}
```

## Part 4: Resolver Implementations

### OpenAPI Resolver

**File:** `src/ea/resolvers/openapi.ts`

```typescript
export class OpenApiResolver implements EaResolver {
  name = "openapi";
  domains = ["systems"] as EaDomain[];
  kinds = ["api-contract", "application", "service"];

  async resolveAnchors(artifact: EaArtifact, ctx: EaResolverContext): Promise<EaAnchorResolution[] | null> {
    if (!artifact.anchors?.apis?.length) return null;

    const specs = await this.loadOpenApiSpecs(ctx);
    const resolutions: EaAnchorResolution[] = [];

    for (const api of artifact.anchors.apis) {
      const [method, path] = api.split(" ");
      const found = specs.some(spec => this.hasEndpoint(spec, method, path));

      resolutions.push({
        anchorKind: "apis",
        anchorValue: api,
        status: found ? "found" : "missing",
        confidence: "high",
        resolvedAt: new Date().toISOString(),
        foundIn: found ? this.findEndpointLocations(specs, method, path) : undefined,
        message: found ? undefined : `API endpoint ${api} not found in any OpenAPI spec`
      });
    }

    return resolutions;
  }

  async collectObservedState(ctx: EaResolverContext): Promise<ObservedEaState | null> {
    const specs = await this.loadOpenApiSpecs(ctx);
    const entities: ObservedEntity[] = [];

    for (const spec of specs) {
      for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const method of Object.keys(methods as object)) {
          entities.push({
            externalId: `${method.toUpperCase()} ${path}`,
            inferredKind: "api-contract",
            inferredDomain: "systems",
            metadata: { specFile: spec._sourceFile, operationId: methods[method]?.operationId }
          });
        }
      }
    }

    return { source: "openapi", collectedAt: new Date().toISOString(), entities, relationships: [] };
  }

  async discoverArtifacts(ctx: EaResolverContext): Promise<EaArtifactDraft[] | null> {
    const specs = await this.loadOpenApiSpecs(ctx);
    const drafts: EaArtifactDraft[] = [];

    for (const spec of specs) {
      const title = spec.info?.title || "Untitled API";
      const slug = this.slugify(title);
      const apis = this.extractAllEndpoints(spec);

      drafts.push({
        suggestedId: `systems/API-${slug}`,
        kind: "api-contract",
        title,
        summary: spec.info?.description || `API contract discovered from ${spec._sourceFile}`,
        status: "draft",
        confidence: "observed",
        anchors: { apis },
        discoveredBy: "openapi",
        discoveredAt: new Date().toISOString(),
        kindSpecificFields: {
          protocol: "rest",
          specFormat: "openapi",
          specPath: spec._sourceFile,
          version: spec.info?.version
        }
      });
    }

    return drafts;
  }

  // ... helper methods
}
```

### Kubernetes Resolver

**File:** `src/ea/resolvers/kubernetes.ts`

**Input sources** (in order of preference):
1. K8s manifest YAML files in the repo (e.g., `k8s/`, `deploy/`)
2. Snapshot JSON file passed via `--from-snapshot`
3. (Future) Live K8s API via `kubectl`

**Discovery output:**
- Each Deployment → draft `deployment` artifact
- Each Service → matches against existing `application` artifacts
- Each Namespace → draft `environment` or `network-zone` artifact
- Each NetworkPolicy → draft `network-zone` artifact
- Each ServiceAccount → draft `identity-boundary` artifact

**Anchor resolution:**
- `infra` anchors matching `kubernetes:*` are checked against manifests

### Terraform Resolver

**File:** `src/ea/resolvers/terraform.ts`

**Input sources:**
1. Terraform state JSON (`terraform show -json`)
2. Terraform plan JSON (`terraform plan -out=plan && terraform show -json plan`)
3. Snapshot file via `--from-snapshot`

**Discovery output:**
- `aws_rds_*` → draft `cloud-resource` + `data-store` artifacts
- `aws_ecs_*` / `aws_eks_*` → draft `platform` artifacts
- `aws_s3_*` → draft `cloud-resource` artifacts
- `aws_security_group_*` → draft `network-zone` artifacts
- `aws_iam_role_*` → draft `identity-boundary` artifacts
- Similar mappings for GCP and Azure resources

**Anchor resolution:**
- `infra` anchors matching `terraform:*` are checked against state resources

### SQL DDL Resolver

**File:** `src/ea/resolvers/sql-ddl.ts`

**Input sources:**
1. SQL migration files (`.sql` files in configured directories)
2. DDL dump file via `--from-snapshot`

**Discovery output:**
- Each table → draft `physical-schema` artifact
- Each database/schema namespace → draft `data-store` artifact

**Anchor resolution:**
- `schemas` anchors matching `schema.table` format are checked against DDL definitions
- Column-level matching for logical-physical mismatch detection

### dbt Resolver

**File:** `src/ea/resolvers/dbt.ts`

**Input sources:**
1. `manifest.json` from `dbt build` or `dbt compile`
2. `catalog.json` from `dbt docs generate`

**Discovery output:**
- Each dbt model → draft `data-product` or `lineage` artifact
- Each dbt source → matched against existing `data-store` artifacts
- Each dbt test → draft `data-quality-rule` artifact
- Each dbt exposure → matched against existing `application` artifacts

**Anchor resolution:**
- `other.dbt` anchors matched against model/test/source names in manifest

## Part 5: Generator Framework

### Implementation: `src/ea/generator.ts`

```typescript
export async function runGenerators(options: EaGeneratorOptions): Promise<GenerationReport> {
  const outputs: GeneratedOutput[] = [];
  const drifts: GenerationDrift[] = [];

  for (const generatorConfig of options.generators) {
    const generator = await loadGenerator(generatorConfig.path);

    for (const artifact of options.artifacts) {
      if (!generator.kinds.includes(artifact.kind)) continue;

      if (options.checkOnly && generator.diff) {
        // Check mode: compare existing output against what would be generated
        const existingPath = resolveExistingOutput(artifact, generatorConfig);
        if (existingPath) {
          const existing = readFileSync(existingPath, "utf-8");
          const genDrift = await generator.diff(existing, artifact, options.ctx);
          drifts.push(...genDrift);
        }
      } else {
        // Generate mode: produce outputs
        const generated = await generator.generate(artifact, options.ctx);
        outputs.push(...generated);
      }
    }
  }

  // Write outputs (unless dry-run)
  if (!options.dryRun && !options.checkOnly) {
    for (const output of outputs) {
      writeGeneratedOutput(output, options.outputDir);
    }
  }

  return { generatedAt: new Date().toISOString(), outputs, drifts };
}
```

### OpenAPI Generator

**File:** `src/ea/generators/openapi.ts`

Generates OpenAPI 3.1 stubs from `api-contract` artifacts:

- Builds path stubs from `anchors.apis` (e.g., `POST /orders` → `paths./orders.post`)
- Sets `info.title` and `info.description` from artifact title/summary
- Sets `info.version` from artifact's `version` field
- Generates request/response stubs with `TODO` markers
- Respects `specFormat` field (only generates for `openapi` or unset)
- Links back to source artifact via `x-anchored-spec-artifact` extension

### JSON Schema Generator

**File:** `src/ea/generators/jsonschema.ts`

Generates JSON Schema from `canonical-entity` artifacts:

- Maps each attribute to a JSON Schema property
- Maps attribute `type` field to JSON Schema types (`uuid` → `string + format:uuid`, `decimal` → `number`, etc.)
- Sets `required` array from attributes with `required: true`
- Adds `title` and `description` from artifact fields
- Links back to source artifact via `$comment`

## Part 6: REQ/CHG/ADR Subsumption

### Legacy Kind Schemas

Create three new schemas that wrap the existing artifact shapes into the EA model:

**`src/ea/schemas/requirement.schema.json`** — extends `artifact-base.schema.json` with:
- `behaviorStatements` array (from current `Requirement.behaviorStatements`)
- `verification` object (from current `Requirement.verification`)
- `category` (from current `Requirement.category`)
- `priority` (from current `Requirement.priority`)
- `supersededBy`, `statusReason` (from current deprecation fields)

**`src/ea/schemas/change.schema.json`** — extends `artifact-base.schema.json` with:
- `changeType` (from current `Change.type`)
- `phase` (from current `Change.phase`)
- `changeStatus` (from current `Change.status`)
- `scope` (from current `Change.scope`)
- `requirements` array (from current `Change.requirements`)
- `bugfixSpec` (from current `Change.bugfixSpec`)
- `workflowVariant` (from current `Change.workflowVariant`)

**`src/ea/schemas/decision.schema.json`** — extends `artifact-base.schema.json` with:
- `decision` (from current `Decision.decision`)
- `context` (from current `Decision.context`)
- `rationale` (from current `Decision.rationale`)
- `alternatives` array (from current `Decision.alternatives`)
- `relatedRequirements` (from current `Decision.relatedRequirements`)

### Migration Tool

**File:** `src/ea/migrate-legacy.ts`

```typescript
export interface MigrationResult {
  migratedArtifacts: Array<{ legacyId: string; newId: string; filePath: string }>;
  errors: Array<{ legacyId: string; error: string }>;
  warnings: Array<{ legacyId: string; warning: string }>;
}

export async function migrateLegacyArtifacts(
  specRoot: SpecRoot,
  eaConfig: EaConfig,
  options: MigrationOptions
): Promise<MigrationResult>;
```

### Migration Process

1. Load all existing REQ, CHG, ADR artifacts via `SpecRoot`
2. For each artifact:
   a. Map to EA format (see mapping table below)
   b. Generate new ID: `legacy/REQ-{n}`, `legacy/CHG-{slug}`, `legacy/ADR-{n}`
   c. Map `semanticRefs` → `anchors` (using mapping from [ea-unified-artifact-model.md](./ea-unified-artifact-model.md))
   d. Map cross-references to EA relations:
      - `Change.requirements` → `generates` relations
      - `Decision.relatedRequirements` → `dependsOn` relations
      - `Requirement.implementation.changes` → `implementedBy` relations
   e. Write new artifact to `specs/ea/legacy/`
3. Generate a migration report

### Field Mapping

| Legacy Field | EA Field | Notes |
|---|---|---|
| `Requirement.id` | `id` → `legacy/REQ-{n}` | Prefix with `legacy/` domain |
| `Requirement.title` | `title` | Direct |
| `Requirement.status` | `status` | Direct (same enum values) |
| `Requirement.summary` | `summary` | Map from `description` if summary missing |
| `Requirement.owners` | `owners` | Map from `author` if owners missing |
| `Requirement.semanticRefs.interfaces` | `anchors.symbols` | Merge |
| `Requirement.semanticRefs.routes` | `anchors.apis` | Direct |
| `Requirement.semanticRefs.errorCodes` | `anchors.symbols` | Prefix with `error:` |
| `Requirement.semanticRefs.symbols` | `anchors.symbols` | Merge |
| `Requirement.semanticRefs.schemas` | `anchors.schemas` | Direct |
| `Requirement.semanticRefs.other` | `anchors.other` | Direct |
| `Requirement.testRefs` | `traceRefs` | Role: `test` |
| `Requirement.verification` | `verification` (kind-specific) | Direct |
| `Change.id` | `id` → `legacy/CHG-{slug}` | Prefix with `legacy/` domain |
| `Change.type` | `changeType` (kind-specific) | Direct |
| `Change.phase` | `phase` (kind-specific) | Direct |
| `Change.requirements` | `relations` | Type: `generates`, target: legacy REQ IDs |
| `Decision.id` | `id` → `legacy/ADR-{n}` | Prefix with `legacy/` domain |
| `Decision.status` | `status` | Map: `accepted` → `active`, `superseded` → `deprecated` |

### CLI Command

```bash
# Dry run — show what would be migrated
anchored-spec ea migrate-legacy --dry-run

# Migrate all legacy artifacts
anchored-spec ea migrate-legacy

# Migrate only requirements
anchored-spec ea migrate-legacy --kind requirement

# Output migration report
anchored-spec ea migrate-legacy --json
```

### Backward Compatibility

During the transition period (until teams are ready to switch fully):

1. The legacy `SpecRoot` loader continues to work unchanged
2. The EA `EaRoot` loader can optionally load from `specs/ea/legacy/`
3. Drift detection runs on both systems — existing code drift for REQ, EA drift for EA artifacts
4. The `ea validate` command can validate both legacy and EA artifacts
5. Reports can include both legacy and EA artifacts in the graph

## PR Breakdown

### PR 2F-1: EA Drift Engine Core

1. Implement `src/ea/drift.ts` with `detectEaDrift()`
2. Implement anchor resolution pipeline
3. Implement graph integrity rules (all domain rules from 2A-2E)
4. Implement exception suppression
5. Implement severity overrides from config
6. Add `anchored-spec ea drift` CLI (fully functional with graph rules, no external resolvers yet)
7. Add drift heatmap report view
8. Write comprehensive tests

### PR 2F-2: Discovery Pipeline

1. Implement `src/ea/discovery.ts`
2. Implement deduplication logic
3. Implement draft artifact writing
4. Implement discovery report generation
5. Add `anchored-spec ea discover` CLI
6. Write tests with mock resolvers

### PR 2F-3: Resolver Cache

1. Implement `src/ea/cache.ts` with `DiskResolverCache`
2. Integrate cache into resolver context
3. Add `--max-cache-age` and `--no-cache` CLI flags
4. Write tests for cache TTL, invalidation, and miss scenarios

### PR 2F-4: OpenAPI Resolver

1. Implement `src/ea/resolvers/openapi.ts`
2. Support loading from YAML/JSON OpenAPI files in the repo
3. Implement `resolveAnchors`, `collectObservedState`, `discoverArtifacts`
4. Write tests with OpenAPI fixture files

### PR 2F-5: Kubernetes Resolver

1. Implement `src/ea/resolvers/kubernetes.ts`
2. Support loading from K8s YAML manifests and snapshot JSON
3. Implement all three resolver methods
4. Write tests with K8s manifest fixtures

### PR 2F-6: Terraform Resolver

1. Implement `src/ea/resolvers/terraform.ts`
2. Support loading from `terraform show -json` output
3. Implement all three resolver methods
4. Write tests with Terraform state fixtures

### PR 2F-7: SQL DDL and dbt Resolvers

1. Implement `src/ea/resolvers/sql-ddl.ts`
2. Implement `src/ea/resolvers/dbt.ts`
3. Write tests with SQL migration and dbt manifest fixtures

### PR 2F-8: Generator Framework

1. Implement `src/ea/generator.ts` with `runGenerators()`
2. Implement generator loading from config
3. Implement generation drift detection (`--check` mode)
4. Add `anchored-spec ea generate` CLI
5. Write tests with mock generators

### PR 2F-9: OpenAPI and JSON Schema Generators

1. Implement `src/ea/generators/openapi.ts`
2. Implement `src/ea/generators/jsonschema.ts`
3. Write tests verifying generated output validity

### PR 2F-10: Legacy Kind Schemas and Migration Tool

1. Create `requirement.schema.json`, `change.schema.json`, `decision.schema.json`
2. Implement `src/ea/migrate-legacy.ts`
3. Add `anchored-spec ea migrate-legacy` CLI
4. Write tests with the todo-app example as fixture (migrate its REQ/CHG/ADR artifacts)
5. Verify migrated artifacts pass `ea validate`

## Phase 2 Completion Checklist

When all Phase 2F PRs are merged, verify:

- [ ] All 44 kinds registered and validated
- [ ] All 28 relations in the registry with correct source/target constraints
- [ ] `ea drift` runs with graph integrity rules across all domains
- [ ] `ea drift` runs with at least OpenAPI + Kubernetes resolvers
- [ ] `ea discover` bootstraps artifacts from at least OpenAPI + Kubernetes
- [ ] `ea generate` produces OpenAPI stubs and JSON Schemas
- [ ] `ea migrate-legacy` successfully migrates the todo-app example
- [ ] All reports generate correctly: system-data-matrix, classification-coverage, capability-map, target-gap, exceptions, drift-heatmap
- [ ] Resolver cache works with configurable TTL
- [ ] Exception suppression works for drift findings
- [ ] `pnpm verify` passes with all new + existing tests
- [ ] `pnpm build` succeeds with all new modules
