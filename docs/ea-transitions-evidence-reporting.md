# EA Transitions, Evidence, and Reporting

This document specifies the baseline/target/transition model, the evidence pipeline extension, the transition-to-change bridge, and the reporting/view generation system.

Read [ea-design-overview.md](./ea-design-overview.md) for context and [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) for the artifact model.

## Baseline, Target, and Transition Model

These three artifact kinds form the strategic planning layer of the EA model. They transform the framework from a static inventory into a living architecture governance tool.

### Baseline Artifact

A baseline represents a point-in-time snapshot of the current architecture. It does not embed artifact copies — it references artifacts by ID.

```typescript
export interface BaselineArtifact extends ArtifactBase {
  kind: "baseline";

  /** What this baseline covers (domain-level or cross-cutting) */
  scope: {
    domains?: EaDomain[];
    kinds?: string[];
    tags?: string[];
    description: string;
  };

  /** When this baseline was captured */
  capturedAt: string;

  /** IDs of all artifacts included in this baseline */
  artifactRefs: string[];

  /** Known assumptions at the time of capture */
  assumptions?: string[];

  /** Known exceptions at the time of capture */
  exceptions?: string[];

  /** Version of the artifact set — allows baseline versioning */
  baselineVersion?: string;
}
```

Example:

```json
{
  "id": "transitions/BASELINE-2026-q2",
  "schemaVersion": "1.0.0",
  "kind": "baseline",
  "title": "Current State Q2 2026",
  "status": "active",
  "summary": "Architecture baseline capturing the state of the order platform as of Q2 2026.",
  "owners": ["enterprise-architecture"],
  "confidence": "declared",
  "scope": {
    "domains": ["systems", "delivery", "data"],
    "description": "Order platform systems, deployments, and data stores"
  },
  "capturedAt": "2026-04-01T00:00:00Z",
  "artifactRefs": [
    "systems/APP-order-service",
    "systems/APP-billing-service",
    "systems/API-orders-api",
    "delivery/DEPLOY-order-service-prod",
    "delivery/PLAT-kubernetes-prod",
    "data/STORE-orders-postgres"
  ],
  "assumptions": [
    "Billing service is stable and not changing during this planning period",
    "Kubernetes cluster has sufficient capacity for planned migrations"
  ],
  "exceptions": [
    "transitions/EXCEPT-legacy-billing-api"
  ]
}
```

### Target Artifact

A target represents the desired future architecture state. Like baselines, it references artifacts by ID — but those artifacts may not yet exist (they may be in `draft` or `planned` status).

```typescript
export interface TargetArtifact extends ArtifactBase {
  kind: "target";

  /** What this target covers */
  scope: {
    domains?: EaDomain[];
    kinds?: string[];
    tags?: string[];
    description: string;
  };

  /** When this target state should be achieved */
  effectiveBy: string;

  /** IDs of artifacts that should exist in the target state */
  artifactRefs: string[];

  /** Architecture principles governing this target */
  principles?: string[];

  /** Measurable success metrics */
  successMetrics?: Array<{
    id: string;
    metric: string;
    target: string;
    currentValue?: string;
  }>;
}
```

Example:

```json
{
  "id": "transitions/TARGET-2026-q4",
  "schemaVersion": "1.0.0",
  "kind": "target",
  "title": "Target State Q4 2026",
  "status": "active",
  "summary": "Target architecture for the modernized order platform.",
  "owners": ["enterprise-architecture"],
  "confidence": "declared",
  "scope": {
    "domains": ["systems", "delivery", "data", "information"],
    "description": "Fully service-oriented order platform with canonical data contracts"
  },
  "effectiveBy": "2026-12-31T00:00:00Z",
  "artifactRefs": [
    "systems/APP-order-service",
    "systems/APP-payment-service",
    "systems/APP-notification-service",
    "systems/API-orders-api",
    "systems/EVT-order-events",
    "delivery/DEPLOY-order-service-prod",
    "delivery/DEPLOY-payment-service-prod",
    "delivery/DEPLOY-notification-service-prod",
    "delivery/PLAT-kubernetes-prod",
    "data/STORE-orders-postgres",
    "data/STORE-events-kafka",
    "information/CE-order",
    "information/CE-payment"
  ],
  "principles": [
    "Event-driven communication between services",
    "Canonical data contracts for all inter-service exchanges",
    "No direct database access between services"
  ],
  "successMetrics": [
    {
      "id": "SM-1",
      "metric": "Service independence",
      "target": "Zero shared databases between services",
      "currentValue": "2 shared databases"
    },
    {
      "id": "SM-2",
      "metric": "Contract coverage",
      "target": "100% of inter-service APIs have api-contract artifacts",
      "currentValue": "40%"
    }
  ]
}
```

### Transition Plan Artifact

A transition plan describes how to move from baseline to target. It contains milestones, a risk register, and approval metadata. Milestones can generate change records via the `generates` relation.

```typescript
export interface TransitionPlanArtifact extends ArtifactBase {
  kind: "transition-plan";

  /** Reference to the baseline artifact */
  baseline: string;

  /** Reference to the target artifact */
  target: string;

  /** Ordered milestones */
  milestones: TransitionMilestone[];

  /** Dependencies between milestones (implicit from deliverables, or explicit) */
  milestoneDependencies?: Array<{
    milestone: string;
    dependsOn: string;
  }>;

  /** Risk register */
  riskRegister?: TransitionRisk[];

  /** Approval metadata */
  approvalPolicy?: {
    requiredApprovers: string[];
    approvedAt?: string;
    approvedBy?: string[];
  };
}

export interface TransitionMilestone {
  /** Milestone identifier within this plan */
  id: string;

  /** Human-readable title */
  title: string;

  /** What this milestone delivers — references to EA artifact IDs */
  deliverables: string[];

  /** Change records this milestone generates or references */
  generates?: string[];

  /** Completion criteria */
  criteria?: string[];

  /** Current status */
  status?: "pending" | "in-progress" | "complete" | "blocked";

  /** Blocking reason if status is "blocked" */
  blockedReason?: string;
}

export interface TransitionRisk {
  id: string;
  description: string;
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  mitigation: string;
  owner?: string;
  status?: "open" | "mitigated" | "accepted" | "closed";
}
```

### Migration Wave Artifact

A migration wave groups related changes within a transition plan. It is the bridge between strategic planning and operational execution.

```typescript
export interface MigrationWaveArtifact extends ArtifactBase {
  kind: "migration-wave";

  /** Parent transition plan */
  transitionPlan: string;

  /** Which milestones this wave addresses */
  milestones: string[];

  /** Sequencing order within the transition */
  sequenceOrder: number;

  /** Artifacts being created, modified, or retired in this wave */
  scope: {
    create?: string[];
    modify?: string[];
    retire?: string[];
  };

  /** Change records generated by this wave */
  relations?: Relation[];  // uses "generates" relation type

  /** Pre-conditions that must be true before this wave starts */
  preconditions?: string[];

  /** Rollback strategy if the wave fails */
  rollbackStrategy?: string;
}
```

Example:

```json
{
  "id": "transitions/WAVE-2026-001-extract-payment",
  "schemaVersion": "1.0.0",
  "kind": "migration-wave",
  "title": "Extract Payment Service",
  "status": "active",
  "summary": "First migration wave: extract payment processing from the monolith into a standalone service.",
  "owners": ["platform-orders"],
  "confidence": "declared",
  "transitionPlan": "transitions/PLAN-2026-modernize-orders",
  "milestones": ["MS-1"],
  "sequenceOrder": 1,
  "scope": {
    "create": [
      "systems/APP-payment-service",
      "systems/API-payments-api",
      "delivery/DEPLOY-payment-service-prod"
    ],
    "modify": [
      "systems/APP-order-service"
    ],
    "retire": []
  },
  "relations": [
    {
      "type": "generates",
      "target": "legacy/CHG-2026-0010-extract-payment",
      "description": "Change record for the payment service extraction"
    }
  ],
  "preconditions": [
    "Canonical payment entity (information/CE-payment) is published",
    "Payment API contract (systems/API-payments-api) is reviewed and approved"
  ],
  "rollbackStrategy": "Feature flag: payment.use-legacy-flow. Roll back by disabling the flag."
}
```

## Transition ↔ Change Bridge

The transition model connects to the existing change management model through the `generates` relation type.

### How It Works

1. A `transition-plan` contains `milestones`
2. Each milestone has `deliverables` (EA artifact IDs) and optionally `generates` (change record IDs)
3. A `migration-wave` groups milestones and explicitly declares which change records it generates via `generates` relations
4. The `generates` relation is defined in the relation registry:
   - Valid source kinds: `transition-plan`, `migration-wave`
   - Valid target kinds: `change`, `requirement`
   - This creates a traceable link from strategy → execution

### Scaffolding

The `ea create migration-wave` command can optionally scaffold corresponding change records:

```bash
# Create a migration wave and scaffold change records for its scope
anchored-spec create migration-wave \
  --title "Extract Payment Service" \
  --plan transitions/PLAN-2026-modernize-orders \
  --scaffold-changes
```

This generates:
1. The migration wave artifact
2. A `CHG-*` change record (or `change` kind artifact) for each item in `scope.create` and `scope.modify`
3. `generates` relations linking the wave to the change records

### Transition Drift Rules

| Rule ID | Severity | Description |
|---|---|---|
| `ea:transition/invalid-target-reference` | error | Target artifact references an artifact that doesn't exist |
| `ea:transition/milestone-on-retired-artifact` | error | Milestone deliverable is a retired artifact |
| `ea:transition/unsequenced-breaking-change` | warning | Migration wave modifies artifacts that a later wave depends on, without explicit sequencing |
| `ea:transition/unresolved-dependency` | error | Transition plan has dependencies that aren't addressed by any milestone |
| `ea:transition/wave-missing-precondition` | warning | Migration wave precondition references an artifact not in a preceding wave's deliverables |
| `ea:transition/expired-target` | warning | Target effectiveBy date is in the past |
| `ea:transition/stale-baseline` | warning | Baseline capturedAt is significantly older than the transition plan |
| `ea:transition/orphan-wave` | warning | Migration wave not referenced by any transition plan |

### Target Gap Analysis

The target gap report compares baseline and target to identify:

- **New artifacts**: in target but not in baseline (must be created)
- **Modified artifacts**: in both, but target expects different status/relations
- **Retired artifacts**: in baseline but not in target (must be retired)
- **Blocked artifacts**: needed by target but blocked by unresolved dependencies
- **At-risk milestones**: milestones whose deliverables have drift findings

## Evidence Model Extension

The EA evidence pipeline provides `Evidence` and `EvidenceRecord` types in `src/ea/evidence.ts` with evidence kinds for architecture validation.

### Extended Evidence Kinds

Current kinds:
- `test` (unit test, integration test, e2e test)

New EA kinds:
- `contract` — API contract validation (OpenAPI lint, schema compatibility checks)
- `deployment` — deployment verification (health checks, smoke tests, resource verification)
- `inventory` — infrastructure inventory snapshots (cloud resource lists, K8s object counts)
- `catalog` — service catalog registration evidence
- `lineage` — data lineage verification (dbt test results, lineage graph snapshots)
- `policy` — policy compliance evidence (OPA results, security scan reports)
- `security` — security assessment evidence (vulnerability scans, penetration test results)
- `performance` — performance evidence (load test results, latency benchmarks)

### Extended Evidence Record

```typescript
export interface EvidenceRecord {
  /** The artifact ID this evidence supports (REQ-* for legacy, EA IDs for new) */
  artifactId: string;

  /** Test/check file or source */
  testFile?: string;

  /** Evidence kind */
  kind: "test" | "contract" | "deployment" | "inventory" | "catalog" |
        "lineage" | "policy" | "security" | "performance";

  /** Result status */
  status: "passed" | "failed" | "skipped" | "error";

  /** When the evidence was recorded */
  recordedAt: string;

  /** Execution duration in ms */
  duration?: number;

  /** Additional structured details (kind-specific) */
  details?: Record<string, unknown>;

  /** Which resolver or collector produced this evidence */
  source?: string;
}
```

### Evidence Collection for EA Artifacts

EA artifacts can declare evidence requirements in their `extensions`:

```json
{
  "id": "systems/API-orders-api",
  "extensions": {
    "evidencePolicy": {
      "required": ["contract"],
      "recommended": ["performance"],
      "freshnessWindow": "7d"
    }
  }
}
```

The `ea validate` command checks:
1. Required evidence kinds are present and passed
2. Evidence is within the freshness window
3. No required evidence has `status: "failed"`

### Evidence Ingestion

New evidence sources for EA:

```bash
# Ingest contract evidence from an OpenAPI lint report
anchored-spec evidence ingest --kind contract --source spectral-report.json --artifact systems/API-orders-api

# Ingest deployment evidence from a K8s health check
anchored-spec evidence ingest --kind deployment --source healthcheck-results.json --artifact delivery/DEPLOY-order-service-prod

# Ingest inventory evidence from a cloud snapshot
anchored-spec evidence ingest --kind inventory --source aws-inventory.json
```

Evidence is written to the existing `specs/generated/evidence.json` file with the extended kind values. No separate EA evidence file.

## Reporting and Views

The extension generates architecture views as both JSON (machine-readable) and Markdown (human-readable).

### Output Location

```text
specs/ea/generated/
  capability-map.json
  capability-map.md
  system-data-matrix.json
  system-data-matrix.md
  drift-report.json
  drift-report.md
  target-gap.json
  target-gap.md
  relation-graph.json
  discovery-report.json
  discovery-report.md
  exception-report.json
  exception-report.md
```

### Required Reports

#### Capability Map

Shows the mapping from business capabilities to supporting systems, processes, and org units.

Content:
- Each capability with its `level` and `parentCapability` hierarchy
- Supporting applications (via `realizes` / `supports` relations)
- Supporting processes (via `performedBy` relations)
- Owning org units (via `owns` relations)
- Target-state status for each capability (from transition plans)
- Drift summary per capability

Available after Phase D (business layer).

#### System-Data Matrix

Shows the mapping from applications to their data stores, APIs, and data classifications.

Content:
- Each application
- APIs/events exposed (via `exposes` relations)
- Data stores used (via `uses` relations)
- Classifications touched (via relation traversal: app → store → data model → classification)
- Deployment targets (via `deployedTo` relations)

Available after Phase B (data layer).

#### Target Gap Report

Shows the delta between baseline and target states.

Content:
- Artifacts in target but not in baseline (new work)
- Artifacts in baseline but not in target (planned retirements)
- Milestones with their status and blocking dependencies
- Success metrics with current vs target values
- At-risk items (artifacts with drift findings)

Available after Phase E (transitions layer).

#### Drift Report

Shows all drift findings organized by domain and severity.

Content:
- Summary counts by domain and severity
- Findings grouped by domain, then by artifact
- Suppressed findings shown separately with exception references
- Resolver execution metadata (which resolvers ran, cache hits, errors)

Available after Phase F (drift engine).

#### Exception Report

Shows all active and expired exceptions.

Content:
- Active exceptions with expiry dates and review schedules
- Recently expired exceptions (may need renewal or resolution)
- Coverage: which artifacts and rules are under exception
- Exception health: are exceptions being reviewed on schedule?

Available after Phase E.

### CLI Commands

```bash
# Generate all reports
anchored-spec report

# Generate specific view
anchored-spec report --view capability-map
anchored-spec report --view system-data-matrix
anchored-spec report --view target-gap
anchored-spec report --view drift
anchored-spec report --view exceptions

# Output format
anchored-spec report --json
anchored-spec report --view target-gap --json

# Filter by domain
anchored-spec report --domain systems
```

### Report Generation Pipeline

1. Load all EA artifacts
2. Build relation graph
3. Load evidence records
4. Load exception artifacts
5. For each report type:
   a. Query the graph for relevant nodes and edges
   b. Enrich with evidence status and drift findings (if available)
   c. Format as JSON
   d. Generate Markdown from JSON
   e. Write to `specs/ea/generated/`
