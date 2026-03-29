# EA Phase 2E: Transitions, Evidence Extension, and Reporting

This document specifies the transitions domain (5 kinds), the evidence pipeline extension for EA artifacts, the transition-to-change bridge, and the complete reporting system.

## Prerequisites

- Phase 1 complete
- Phases 2A–2D complete (all NIST domain kinds registered)
- Read [ea-phase2-overview.md](./ea-phase2-overview.md) for Phase 2 context
- Read [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md) for the detailed type definitions — this document provides the implementation guide and PR breakdown

## What This Phase Adds

| Kind | Prefix | Description |
|---|---|---|
| `baseline` | `BASELINE` | A point-in-time architecture snapshot |
| `target` | `TARGET` | A desired future architecture state |
| `transition-plan` | `PLAN` | A plan to move from baseline to target |
| `migration-wave` | `WAVE` | A batch of related changes within a transition |
| `exception` | `EXCEPT` | An approved exception to architecture policy |

**New relations:** 3 (`supersedes`, `generates`, `mitigates`)

**Running total after 2E:** 41 kinds, 27 relations

## Implementation Notes

The full type definitions, examples, and JSON examples for all 5 transition kinds are in [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md). This document focuses on implementation guidance, edge cases, and PR structure.

## Phase 2E Relations

### Registry Entries

```typescript
const PHASE_2E_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "supersedes",
    inverse: "supersededBy",
    validSourceKinds: "*",
    validTargetKinds: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "none",
    description: "Source artifact supersedes target (newer version or replacement)."
  },
  {
    type: "generates",
    inverse: "generatedBy",
    validSourceKinds: ["transition-plan", "migration-wave"],
    validTargetKinds: ["change", "requirement"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Transition plan or migration wave generates change records."
  },
  {
    type: "mitigates",
    inverse: "mitigatedBy",
    validSourceKinds: ["exception"],
    validTargetKinds: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "none",
    description: "Exception mitigates (suppresses) drift findings for target artifacts."
  }
];
```

## Transition Validation Rules

These rules are critical for ensuring transition plans are internally consistent.

### Baseline Validation

| Rule ID | Severity | Description |
|---|---|---|
| `ea:transition/baseline-missing-artifacts` | warning | Baseline `artifactRefs` references artifacts that don't exist |
| `ea:transition/baseline-stale` | info | Baseline `capturedAt` is more than 90 days old |

### Target Validation

| Rule ID | Severity | Description |
|---|---|---|
| `ea:transition/invalid-target-reference` | error | Target `artifactRefs` references non-existent artifact (and it's not a draft/planned artifact) |
| `ea:transition/expired-target` | warning | Target `effectiveBy` is in the past |
| `ea:transition/target-missing-metrics` | warning | Active target with empty `successMetrics` |

### Transition Plan Validation

| Rule ID | Severity | Description |
|---|---|---|
| `ea:transition/missing-baseline` | error | Plan references non-existent baseline |
| `ea:transition/missing-target` | error | Plan references non-existent target |
| `ea:transition/milestone-on-retired-artifact` | error | Milestone deliverable is a retired artifact |
| `ea:transition/unresolved-dependency` | error | Plan has dependencies not addressed by any milestone |
| `ea:transition/unsequenced-breaking-change` | warning | Wave modifies artifacts that a later wave depends on without explicit sequencing |

### Migration Wave Validation

| Rule ID | Severity | Description |
|---|---|---|
| `ea:transition/wave-missing-precondition` | warning | Wave precondition references artifact not delivered by any preceding wave |
| `ea:transition/orphan-wave` | warning | Wave not referenced by any transition plan |
| `ea:transition/wave-scope-conflict` | warning | Two waves in the same plan modify the same artifact without sequencing |

### Exception Validation

| Rule ID | Severity | Description |
|---|---|---|
| `ea:exception/expired` | warning | Exception `expiresAt` is in the past |
| `ea:exception/missing-scope` | error | Exception with empty scope (would suppress everything) |
| `ea:exception/overdue-review` | warning | Exception past its review schedule without update |

## Target Gap Analysis Algorithm

The target gap analysis is one of the most valuable reports. Here's the detailed algorithm:

### Input

- Baseline artifact (with `artifactRefs`)
- Target artifact (with `artifactRefs`)
- All EA artifacts (for status checking)
- Transition plan (with milestones and waves)
- Current drift report (for at-risk items)

### Algorithm

```
1. Compute artifact sets:
   baseline_set = resolve all IDs in baseline.artifactRefs
   target_set = resolve all IDs in target.artifactRefs

2. Classify each artifact:
   new_work = target_set - baseline_set                    (must be created)
   retirements = baseline_set - target_set                 (must be retired)
   continuing = baseline_set ∩ target_set                  (carried forward)

3. For each item in new_work:
   - Check if artifact exists (it may be in draft/planned status)
   - Check which milestone delivers it
   - Check which wave creates it
   - If no milestone/wave covers it, flag as "unplanned gap"

4. For each item in retirements:
   - Check current status (is it already retired?)
   - Check if anything still depends on it (impact analysis)
   - Check which milestone/wave handles the retirement
   - If still depended on by continuing artifacts, flag as "blocked retirement"

5. For each milestone in transition plan:
   - Check if all deliverables are in target_set
   - Check if any deliverable has drift findings
   - Check milestone dependencies (are preceding milestones complete?)
   - Compute status: pending | in-progress | blocked | complete

6. For each success metric in target:
   - Show current value vs target value
   - Compute progress percentage where measurable

7. Aggregate at-risk items:
   - Artifacts with active drift findings
   - Milestones with blocked dependencies
   - Waves with unmet preconditions
```

### Output Shape

```json
{
  "generatedAt": "2026-03-29T07:00:00Z",
  "baseline": { "id": "transitions/BASELINE-2026-q2", "capturedAt": "2026-04-01T00:00:00Z" },
  "target": { "id": "transitions/TARGET-2026-q4", "effectiveBy": "2026-12-31T00:00:00Z" },
  "summary": {
    "newWork": 5,
    "retirements": 2,
    "continuing": 8,
    "blockedRetirements": 1,
    "unplannedGaps": 0,
    "atRiskMilestones": 1
  },
  "newWork": [
    {
      "artifactId": "systems/APP-payment-service",
      "status": "draft",
      "milestone": "MS-1",
      "wave": "transitions/WAVE-2026-001-extract-payment"
    }
  ],
  "retirements": [
    {
      "artifactId": "systems/INT-legacy-payment-bridge",
      "currentStatus": "active",
      "dependedOnBy": ["systems/APP-order-service"],
      "milestone": "MS-3",
      "blocked": true,
      "blockedReason": "APP-order-service still uses this integration"
    }
  ],
  "milestones": [
    {
      "id": "MS-1",
      "title": "Publish canonical order contract",
      "status": "in-progress",
      "deliverables": { "total": 3, "complete": 1, "inProgress": 1, "pending": 1 },
      "atRisk": false
    }
  ],
  "successMetrics": [
    {
      "id": "SM-1",
      "metric": "Service independence",
      "target": "Zero shared databases",
      "currentValue": "2 shared databases",
      "progress": "0%"
    }
  ]
}
```

## Evidence Pipeline Extension

### Changes to `src/core/evidence.ts`

The existing `EvidenceRecord` interface gains new `kind` values. This is a non-breaking additive change.

```typescript
// Add to the existing kind union:
export type EvidenceKind =
  | "test"           // existing
  | "contract"       // API contract validation
  | "deployment"     // deployment verification
  | "inventory"      // infrastructure inventory snapshot
  | "catalog"        // service catalog registration
  | "lineage"        // data lineage verification
  | "policy"         // policy compliance check
  | "security"       // security assessment
  | "performance";   // performance evidence
```

### Changes to Evidence Validation

Update `validateEvidence()` in `src/core/evidence.ts` to support:

1. **EA artifact references**: `artifactId` field can now reference EA artifact IDs (e.g., `systems/APP-order-service`) in addition to legacy `REQ-*` IDs
2. **Freshness validation**: Check evidence `recordedAt` against the artifact's evidence policy freshness window
3. **Kind coverage**: Check that all required evidence kinds are present for artifacts with evidence policies

### Evidence Ingestion Command

```bash
# New subcommand under ea evidence
anchored-spec ea evidence ingest \
  --kind contract \
  --source ./reports/spectral-lint.json \
  --artifact systems/API-orders-api \
  --format spectral

anchored-spec ea evidence ingest \
  --kind deployment \
  --source ./reports/k8s-healthcheck.json \
  --artifact delivery/DEPLOY-order-service-prod \
  --format kubernetes-healthcheck

anchored-spec ea evidence ingest \
  --kind policy \
  --source ./reports/opa-results.json \
  --format opa
```

### Evidence Parsers

Add new evidence parsers alongside the existing `VitestParser`:

```typescript
// New parsers to implement
export class SpectralParser implements EvidenceParser { ... }
export class KubernetesHealthcheckParser implements EvidenceParser { ... }
export class OpaResultParser implements EvidenceParser { ... }
```

Each parser follows the existing `EvidenceParser` interface:

```typescript
export interface EvidenceParser {
  parse(reportPath: string, artifacts: Array<{ id: string }>): EvidenceRecord[];
}
```

## Complete Report Catalog

After Phase 2E, the following reports are available:

| Report | View Flag | Available After | Description |
|---|---|---|---|
| System-Data Matrix | `--view system-data-matrix` | Phase 2B | Apps → stores → models → classifications |
| Classification Coverage | `--view classification-coverage` | Phase 2C | Classifications → entities → enforcement gaps |
| Capability Map | `--view capability-map` | Phase 2D | Mission → capability → system hierarchy |
| Target Gap | `--view target-gap` | Phase 2E | Baseline vs target delta analysis |
| Exception Report | `--view exceptions` | Phase 2E | Active/expired exceptions |
| Drift Heatmap | `--view drift-heatmap` | Phase 2F | Drift findings by domain and severity |

### All-Reports Generation

```bash
# Generate all available reports
anchored-spec ea report --all

# Generate all reports in JSON only
anchored-spec ea report --all --json
```

This writes all reports to `specs/ea/generated/`.

### Report Index

When `--all` is used, also generate an index file:

```json
{
  "generatedAt": "2026-03-29T07:00:00Z",
  "reports": [
    { "name": "system-data-matrix", "path": "specs/ea/generated/system-data-matrix.json", "artifactCount": 22 },
    { "name": "capability-map", "path": "specs/ea/generated/capability-map.json", "capabilityCount": 15 },
    { "name": "target-gap", "path": "specs/ea/generated/target-gap.json", "gapCount": 5 },
    { "name": "exceptions", "path": "specs/ea/generated/exception-report.json", "activeExceptions": 3 }
  ],
  "summary": {
    "totalArtifacts": 41,
    "byDomain": { "systems": 12, "delivery": 8, "data": 9, "information": 5, "business": 4, "transitions": 3 },
    "driftFindings": { "errors": 2, "warnings": 7 }
  }
}
```

## PR Breakdown

### PR 2E-1: Transition Schemas and Types

1. Add 5 TypeScript interfaces to `src/ea/types.ts` (refer to [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md) for full definitions):
   - `BaselineArtifact`
   - `TargetArtifact`
   - `TransitionPlanArtifact`
   - `MigrationWaveArtifact`
   - `ExceptionArtifact`
2. Create 5 JSON Schema files in `src/ea/schemas/`
3. Register 5 kinds in the kind taxonomy
4. Add `ea create` templates for all 5 kinds
5. Write schema validation tests

### PR 2E-2: Transition Relations and Validation Rules

1. Add `PHASE_2E_RELATIONS` to relation registry
2. Implement all transition validation rules (baseline, target, plan, wave, exception)
3. Implement exception expiry checking
4. Write comprehensive tests for:
   - Invalid target references
   - Milestone on retired artifact
   - Unsequenced breaking changes
   - Expired exceptions

### PR 2E-3: Target Gap Analysis

1. Implement the target gap algorithm in `src/ea/report.ts`
2. Generate JSON and Markdown output
3. Add `anchored-spec ea report --view target-gap` CLI option
4. Write tests with fixtures that exercise:
   - New work detection
   - Blocked retirements
   - Milestone dependency checking
   - Success metric tracking

### PR 2E-4: Evidence Pipeline Extension

1. Extend `EvidenceRecord` with new kind values (non-breaking)
2. Extend `validateEvidence()` for EA artifact references and freshness
3. Add at least one new evidence parser (SpectralParser for contract evidence)
4. Add `anchored-spec ea evidence ingest` CLI subcommand
5. Write tests for evidence ingestion and validation

### PR 2E-5: Exception Report and Report Index

1. Implement exception report in `src/ea/report.ts`
2. Implement report index generation
3. Add `anchored-spec ea report --all` CLI option
4. Write tests
