# EA Model Health Metrics and Status Dashboard

This document specifies the `ea status` command and the health metrics it reports, enabling teams to measure and improve their EA model adoption over time.

Read [ea-design-overview.md](./ea-design-overview.md) for context.

## The `ea status` Command

```bash
npx anchored-spec ea status
npx anchored-spec ea status --json
npx anchored-spec ea status --domain systems
```

The `ea status` command produces a dashboard showing the current health of the EA model across six dimensions: coverage, completeness, connectivity, drift health, freshness, and adoption.

## Health Dimensions

### 1. Coverage — "How much of our architecture is modeled?"

```typescript
export interface CoverageMetrics {
  /** Total EA artifacts by domain */
  byDomain: Record<EaDomain, number>;

  /** Total EA artifacts by status */
  byStatus: Record<ArtifactStatus, number>;

  /** Total EA artifacts by confidence */
  byConfidence: Record<ArtifactConfidence, number>;

  /** Artifacts still in draft (need review) */
  drafts: number;

  /** Ratio of active artifacts to total */
  activeRatio: number;

  /** Domains with zero artifacts */
  emptyDomains: EaDomain[];
}
```

**Indicators:**
- 🟢 Good: > 80% of artifacts are `active` or `shipped`; no empty enabled domains
- 🟡 Fair: > 50% active; one empty domain
- 🔴 Poor: < 50% active; multiple empty domains or many unreviewed drafts

### 2. Completeness — "How well-specified are our artifacts?"

```typescript
export interface CompletenessMetrics {
  /** % of active artifacts with at least one owner */
  ownerCoverage: number;

  /** % of active artifacts with non-empty summary */
  summaryCoverage: number;

  /** % of active artifacts with at least one anchor */
  anchorCoverage: number;

  /** % of active artifacts with at least one relation */
  relationCoverage: number;

  /** % of active artifacts with confidence: "declared" */
  declaredConfidenceRatio: number;

  /** Artifacts with no owners */
  unownedArtifacts: string[];

  /** Artifacts with no anchors (excludes business layer where anchors are optional) */
  unanchoredArtifacts: string[];
}
```

**Indicators:**
- 🟢 Good: > 90% owner coverage; > 70% anchor coverage; > 80% relation coverage
- 🟡 Fair: > 70% owner coverage; > 50% anchor coverage
- 🔴 Poor: < 70% owner coverage; many unanchored artifacts

### 3. Connectivity — "How well-connected is our architecture graph?"

```typescript
export interface ConnectivityMetrics {
  /** Total nodes in the graph */
  totalNodes: number;

  /** Total edges (forward only, excluding virtual inverses) */
  totalEdges: number;

  /** Average edges per node */
  averageEdgesPerNode: number;

  /** Number of disconnected subgraphs */
  connectedComponents: number;

  /** Orphan artifacts (zero relations) */
  orphans: string[];

  /** Hub artifacts (highest edge count) */
  hubs: Array<{ id: string; edgeCount: number }>;

  /** Cross-domain edges (relations spanning domains) */
  crossDomainEdgeCount: number;

  /** % of edges that cross domain boundaries */
  crossDomainRatio: number;
}
```

**Indicators:**
- 🟢 Good: average edges > 2; orphan count < 5% of total; cross-domain ratio > 30%
- 🟡 Fair: average edges > 1; some orphans; some cross-domain edges
- 🔴 Poor: many orphans; low cross-domain connectivity; isolated domains

### 4. Drift Health — "How aligned is our declared architecture with reality?"

```typescript
export interface DriftHealthMetrics {
  /** When drift was last checked */
  lastDriftCheck: string | null;

  /** Total findings from last drift run */
  totalFindings: number;

  /** Findings by severity */
  bySeverity: { errors: number; warnings: number; info: number };

  /** Findings by domain */
  byDomain: Record<EaDomain, { errors: number; warnings: number }>;

  /** % of artifacts with zero drift findings */
  cleanArtifactRatio: number;

  /** Active exceptions suppressing findings */
  activeExceptions: number;

  /** Expired exceptions (action needed) */
  expiredExceptions: number;

  /** Top recurring rules */
  topRules: Array<{ rule: string; count: number }>;
}
```

**Indicators:**
- 🟢 Good: zero errors; clean ratio > 90%; no expired exceptions
- 🟡 Fair: < 5 errors; clean ratio > 70%
- 🔴 Poor: many errors; low clean ratio; expired exceptions

### 5. Freshness — "How current is our evidence and metadata?"

```typescript
export interface FreshnessMetrics {
  /** Average age of evidence records (days) */
  averageEvidenceAge: number;

  /** % of artifacts with evidence within their freshness window */
  evidenceFreshnessRatio: number;

  /** Artifacts with stale evidence (past freshness window) */
  staleEvidence: string[];

  /** Average age of artifact `updatedAt` or file modification time (days) */
  averageArtifactAge: number;

  /** Artifacts not modified in > 90 days */
  staleArtifacts: string[];

  /** Last time reports were generated */
  lastReportGeneration: string | null;

  /** Last time discovery was run */
  lastDiscovery: string | null;
}
```

**Indicators:**
- 🟢 Good: average evidence age < 7 days; < 5% stale artifacts
- 🟡 Fair: average evidence age < 30 days; < 15% stale
- 🔴 Poor: evidence older than 30 days; many stale artifacts

### 6. Adoption — "How embedded is EA governance in our workflow?"

```typescript
export interface AdoptionMetrics {
  /** Is EA enabled in config? */
  eaEnabled: boolean;

  /** How many domains are configured? */
  configuredDomains: number;

  /** How many resolvers are configured? */
  configuredResolvers: number;

  /** How many generators are configured? */
  configuredGenerators: number;

  /** Is EA validation in CI? (heuristic: check for ea validate in workflow files) */
  ciIntegrated: boolean;

  /** Number of teams appearing as owners */
  uniqueOwners: number;

  /** Artifacts created in the last 30 days */
  recentlyCreated: number;

  /** Artifacts modified in the last 30 days */
  recentlyModified: number;
}
```

**Indicators:**
- 🟢 Good: > 3 unique owners; recent activity; CI integrated; resolvers configured
- 🟡 Fair: 1-3 owners; some recent activity
- 🔴 Poor: single owner; no recent activity; no CI integration

## Dashboard Output

### Console Output (Default)

```
┌─────────────────────────────────────────────────┐
│              EA Architecture Status              │
├─────────────────────────────────────────────────┤
│                                                  │
│  Coverage        🟢  42 artifacts across 4 domains│
│  Completeness    🟡  87% owners, 62% anchors     │
│  Connectivity    🟢  avg 2.4 edges/node, 3 orphans│
│  Drift Health    🟡  0 errors, 7 warnings         │
│  Freshness       🟢  avg evidence age: 3 days     │
│  Adoption        🟢  5 teams, CI integrated        │
│                                                   │
├───────────────────────────────────────────────────┤
│  Domain Breakdown                                 │
│                                                   │
│  systems     ████████████░░░  12 artifacts        │
│  delivery    ████████░░░░░░░   8 artifacts        │
│  data        ██████████████░  14 artifacts        │
│  information ████░░░░░░░░░░░   4 artifacts        │
│  business    ████░░░░░░░░░░░   4 artifacts        │
│  transitions ░░░░░░░░░░░░░░░   0 artifacts        │
│                                                   │
├───────────────────────────────────────────────────┤
│  Action Items                                     │
│                                                   │
│  ⚠ 3 unowned artifacts (run ea validate)          │
│  ⚠ 7 drift warnings (run ea drift)               │
│  ⚠ 2 stale evidence records                      │
│  ℹ transitions domain is empty                    │
│                                                   │
└───────────────────────────────────────────────────┘
```

### JSON Output

```json
{
  "generatedAt": "2026-03-29T08:00:00Z",
  "overallHealth": "good",
  "dimensions": {
    "coverage": { "status": "good", "metrics": { "...": "..." } },
    "completeness": { "status": "fair", "metrics": { "...": "..." } },
    "connectivity": { "status": "good", "metrics": { "...": "..." } },
    "driftHealth": { "status": "fair", "metrics": { "...": "..." } },
    "freshness": { "status": "good", "metrics": { "...": "..." } },
    "adoption": { "status": "good", "metrics": { "...": "..." } }
  },
  "actionItems": [
    { "severity": "warning", "message": "3 unowned artifacts", "action": "Run ea validate to see which artifacts need owners" },
    { "severity": "warning", "message": "7 drift warnings", "action": "Run ea drift --domain systems to investigate" },
    { "severity": "info", "message": "transitions domain is empty", "action": "Consider creating a baseline and target to enable strategic planning" }
  ]
}
```

## Health Score

An overall health score (0-100) is computed from the six dimensions:

```typescript
function computeHealthScore(metrics: AllMetrics): number {
  const weights = {
    coverage: 0.15,
    completeness: 0.20,
    connectivity: 0.15,
    driftHealth: 0.25,
    freshness: 0.15,
    adoption: 0.10
  };

  const scores = {
    coverage: scoreCoverage(metrics.coverage),         // 0-100
    completeness: scoreCompleteness(metrics.completeness), // 0-100
    connectivity: scoreConnectivity(metrics.connectivity), // 0-100
    driftHealth: scoreDriftHealth(metrics.driftHealth),     // 0-100
    freshness: scoreFreshness(metrics.freshness),          // 0-100
    adoption: scoreAdoption(metrics.adoption)              // 0-100
  };

  return Object.entries(weights).reduce(
    (total, [dim, weight]) => total + scores[dim] * weight,
    0
  );
}
```

**Health thresholds:**
- 80-100: 🟢 Good
- 60-79: 🟡 Fair
- 0-59: 🔴 Poor

## Trend Tracking

The `ea status` command can optionally write its metrics to a history file for trend tracking:

```bash
# Append current metrics to history
npx anchored-spec ea status --save-history
```

History is stored at `.anchored-spec/ea-metrics-history.json`:

```json
{
  "entries": [
    {
      "timestamp": "2026-03-01T00:00:00Z",
      "healthScore": 45,
      "artifactCount": 15,
      "driftErrors": 5
    },
    {
      "timestamp": "2026-03-15T00:00:00Z",
      "healthScore": 62,
      "artifactCount": 28,
      "driftErrors": 2
    },
    {
      "timestamp": "2026-03-29T00:00:00Z",
      "healthScore": 78,
      "artifactCount": 42,
      "driftErrors": 0
    }
  ]
}
```

This enables teams to see their adoption trajectory over time.

## Implementation Notes

### File: `src/ea/status.ts`

```typescript
export interface EaStatusOptions {
  artifacts: EaArtifact[];
  graph: RelationGraph;
  config: AnchoredSpecConfig;
  eaConfig: EaConfig;
  evidence?: Evidence;
  driftReport?: EaDriftReport;
  projectRoot: string;
}

export interface EaStatusReport {
  generatedAt: string;
  overallHealth: "good" | "fair" | "poor";
  healthScore: number;
  dimensions: {
    coverage: { status: string; metrics: CoverageMetrics };
    completeness: { status: string; metrics: CompletenessMetrics };
    connectivity: { status: string; metrics: ConnectivityMetrics };
    driftHealth: { status: string; metrics: DriftHealthMetrics };
    freshness: { status: string; metrics: FreshnessMetrics };
    adoption: { status: string; metrics: AdoptionMetrics };
  };
  actionItems: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    action: string;
  }>;
}

export function computeEaStatus(options: EaStatusOptions): EaStatusReport;
```

### CLI: `src/cli/commands/ea-status.ts`

Register as `anchored-spec ea status` with options:
- `--json` — JSON output
- `--domain <domain>` — filter metrics to one domain
- `--save-history` — append to history file
