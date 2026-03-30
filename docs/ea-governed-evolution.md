# Governed Evolution Guide

This document covers the Spec-Driven Development (SDD) capabilities that enable governed evolution of EA artifacts: semantic diffing, compatibility assessment, the reconcile pipeline, and version policy enforcement.

## Overview

Traditional architecture documentation drifts silently. Anchored Spec's governed evolution features close this gap by providing:

1. **Spec Diffing** — semantic awareness of what changed (not YAML text diffs)
2. **Compatibility Assessment** — automatic classification of changes as breaking/additive/compatible
3. **Reconcile Pipeline** — single-command SDD control loop (generate → validate → drift)
4. **Version Policy Enforcement** — declared compatibility policies with automatic violation detection

These four capabilities form a pipeline: diff → compat → policy → reconcile.

---

## 1. Semantic Spec Diffing

### Basic Usage

```bash
# Compare working tree against main branch
npx anchored-spec diff main

# Compare two specific refs
npx anchored-spec diff --base v1.0.0 --head v2.0.0

# One-line summary for CI
npx anchored-spec diff main --summary

# JSON output for tooling
npx anchored-spec diff main --json

# Filter by domain
npx anchored-spec diff main --domain systems
```

### What Makes It Semantic?

Unlike `git diff` or YAML text comparisons, the diff engine understands EA artifact structure. Every field change is classified by semantic category:

| Semantic | Fields | Meaning |
|----------|--------|---------|
| **identity** | `id`, `kind`, `schemaVersion` | Reclassification — the artifact fundamentally changed |
| **metadata** | `title`, `summary`, `owners`, `tags` | Descriptive — no functional impact |
| **structural** | `relations`, `anchors`, `traceRefs` | Dependency graph changes |
| **behavioral** | `status`, `confidence`, `risk` | Lifecycle and governance state |
| **contractual** | Kind-specific fields (`protocol`, `attributes`, `tables`, etc.) | API/contract surface changes |
| **governance** | `compliance`, `extensions.driftSuppress`, `exceptions` | Governance posture changes |

### Diff Output

The diff command produces structured markdown:

```
# EA Spec Diff: main..HEAD

## Summary
- 3 artifacts added, 1 removed, 5 modified
- 12 field changes: 4 structural, 3 contractual, 3 metadata, 2 behavioral
- 6 relation changes: 3 added, 2 removed, 1 modified

## Added (3)
| Artifact | Kind | Domain |
|----------|------|--------|
| APP-new-service | application | systems |

## Removed (1)
| Artifact | Kind | Domain |
|----------|------|--------|
| API-old-endpoint | api-contract | systems |

## Modified (5)
### APP-idvx-core (application, systems)
| Field | Semantic | Change | Old → New |
|-------|----------|--------|-----------|
| status | behavioral | modified | planned → active |
| relations | structural | added | uses → SVC-auth |
```

### Array and Relation Handling

- **Relations** use `(type, target)` as a composite key for set-diff — reordering doesn't produce false changes
- **Tags and owners** use set semantics — order is irrelevant
- **TraceRefs** use document path as the key
- **Anchors** diff each sub-field independently (apis, events, files, etc.)

---

## 2. Compatibility Assessment

### Basic Usage

```bash
# Show compatibility classification
npx anchored-spec diff main --compat

# CI gate: fail if breaking changes detected
npx anchored-spec diff main --compat --fail-on breaking

# Stricter: also fail on ambiguous changes
npx anchored-spec diff main --compat --fail-on ambiguous
```

### Compatibility Levels

Every changed artifact receives a compatibility rating:

| Level | Meaning | Example |
|-------|---------|---------|
| **breaking** | Consumers will break | API endpoint removed, entity attribute deleted |
| **ambiguous** | Might break consumers | Protocol changed, confidence downgraded |
| **compatible** | Backward-compatible change | Deprecated artifact removed (expected lifecycle) |
| **additive** | New capability, no breakage | New relation, new anchor, new attribute |
| **none** | No functional impact | Title/summary/tags changed |

### Built-in Rules (16)

| Rule | Condition | Level |
|------|-----------|-------|
| `compat:artifact-removed` | Active/shipped artifact removed | breaking |
| `compat:artifact-removed-deprecated` | Deprecated artifact removed | compatible |
| `compat:status-regression` | Status went backward (active→draft) | breaking |
| `compat:status-deprecation` | Status set to deprecated | compatible |
| `compat:relation-removed` | Relation removed | breaking |
| `compat:relation-added` | Relation added | additive |
| `compat:contract-field-removed` | Kind-specific field removed | breaking |
| `compat:contract-field-added` | Kind-specific field added | additive |
| `compat:contract-field-modified` | Kind-specific field modified | ambiguous |
| `compat:anchor-removed` | Anchor entry removed | breaking |
| `compat:anchor-added` | Anchor entry added | additive |
| `compat:kind-changed` | Kind reclassified | breaking |
| `compat:owner-changed` | Owner changed | none |
| `compat:metadata-only` | Only title/summary/tags changed | none |
| `compat:confidence-downgrade` | Confidence decreased | ambiguous |
| `compat:artifact-added` | New artifact added | additive |

### Compatibility Output

```
# Compatibility Assessment: main..HEAD
## ⛔ Overall: BREAKING (2 breaking, 1 ambiguous, 3 additive)

### Breaking Changes (2)
| Artifact | Kind | Rule | Reason |
|----------|------|------|--------|
| API-payments | api-contract | compat:anchor-removed | Removed anchor entry |
| CE-order | canonical-entity | compat:contract-field-removed | Removed field: legacyId |

### Ambiguous Changes (1)
| Artifact | Kind | Rule | Reason |
|----------|------|------|--------|
| APP-gateway | application | compat:contract-field-modified | Modified field: protocol |
```

### CI Integration

```yaml
# In .github/workflows/ea.yml
- name: Check for breaking changes
  run: npx anchored-spec diff ${{ github.event.pull_request.base.ref }} --compat --fail-on breaking
```

---

## 3. Reconcile Pipeline

### Basic Usage

```bash
# Full pipeline in check mode (no file writes)
npx anchored-spec reconcile

# Generate files, then validate and check drift
npx anchored-spec reconcile --write

# Auto-fix validation issues
npx anchored-spec reconcile --fix

# Strict CI mode: fail on warnings too
npx anchored-spec reconcile --fail-on warning

# Skip specific steps
npx anchored-spec reconcile --skip-generate
npx anchored-spec reconcile --skip-drift

# Stop at first failure
npx anchored-spec reconcile --fail-fast

# JSON output
npx anchored-spec reconcile --json
```

### Pipeline Steps

The reconcile command runs three steps in sequence:

1. **Generate** — Runs all configured generators in check mode (detects generation drift without writing files)
2. **Validate** — Runs schema validation and quality rules against all artifacts
3. **Drift** — Runs all 42 drift detection rules, applies exception suppression

Each step reports pass/fail independently. The overall result requires all steps to pass.

### Output

```
⏳ Reconciling EA project...

  ✓ Generate: 2 generators, 5 artifacts — 0 drifts
  ✗ Validate: 3 errors, 2 warnings
    → APP-gateway: missing owner (ea:quality:active-needs-owner)
    → API-payments: broken relation target (ea:quality:relation-target)
    → CE-order: duplicate ID (ea:quality:duplicate-id)
  ✓ Drift: 42 rules, 0 errors, 4 warnings (2 suppressed)

✗ Reconcile FAILED (3 errors, 6 warnings)
```

### Why Reconcile?

Without reconcile, teams run validate, generate --check, and drift as separate CI steps. This creates three problems:

1. **Order-dependent failures** — A generation drift might mask a validation error
2. **Incomplete coverage** — Some teams skip drift or generate checks
3. **No single source of truth** — Each step has its own exit code and output format

Reconcile solves all three: one command, one exit code, one report.

### CI Integration

```yaml
# Recommended: single CI check
- name: EA Reconcile
  run: npx anchored-spec reconcile --fail-on error
```

---

## 4. Version Policy Enforcement

### Basic Usage

```bash
# Enforce version policies against changes
npx anchored-spec diff main --policy

# JSON output for tooling
npx anchored-spec diff main --policy --json
```

### Compatibility Modes

| Mode | Allowed Changes | Use Case |
|------|----------------|----------|
| `backward-only` | Additive, compatible, metadata | Public APIs, shared contracts |
| `full` | Only additive and metadata (no ambiguous) | Critical entities, data schemas |
| `breaking-allowed` | Everything (default) | Internal services, early-stage artifacts |
| `frozen` | Nothing — artifact is immutable | Archived, compliance-locked artifacts |

### Configuration

#### Global Config (`.anchored-spec/config.json`)

```json
{
  "versionPolicy": {
    "defaultCompatibility": "backward-only",
    "perKind": {
      "api-contract": {
        "compatibility": "backward-only",
        "deprecationWindow": "90d"
      },
      "event-contract": {
        "compatibility": "backward-only"
      },
      "canonical-entity": {
        "compatibility": "full"
      },
      "capability": {
        "compatibility": "breaking-allowed"
      }
    },
    "perDomain": {
      "systems": {
        "compatibility": "backward-only"
      },
      "business": {
        "compatibility": "breaking-allowed"
      }
    }
  }
}
```

#### Artifact-Level Override

```yaml
# In any artifact YAML
extensions:
  versionPolicy:
    compatibility: frozen
```

### Policy Resolution Order

When determining which policy applies to an artifact:

1. **Artifact-level** — `extensions.versionPolicy.compatibility` on the artifact itself
2. **Kind-level** — `versionPolicy.perKind[kind]` in config
3. **Domain-level** — `versionPolicy.perDomain[domain]` in config
4. **Global default** — `versionPolicy.defaultCompatibility` in config
5. **Built-in default** — `breaking-allowed` (no enforcement)

The first match wins. This allows broad defaults with surgical overrides.

### Policy Output

```
# Version Policy Report: main..HEAD
## ⛔ 2 violations

| Artifact | Kind | Policy | Compat Level | Reason |
|----------|------|--------|-------------|--------|
| API-payments | api-contract | backward-only | breaking | Removed anchor entry |
| CE-order | canonical-entity | full | ambiguous | Modified field: protocol |
```

### Migration Guide

For existing projects adopting version policies:

1. **Start with `breaking-allowed`** (default) — zero disruption, no enforcement
2. **Add `perKind` policies** for your most critical artifact types (API contracts, entities)
3. **Set a global default** of `backward-only` once the team is comfortable
4. **Use `frozen`** for compliance-locked or archived artifacts
5. **Add CI gating** with `diff main --policy` in your PR workflow

---

## Combined CI Pipeline

Here's a comprehensive CI workflow using all four capabilities:

```yaml
name: EA Governed Evolution
on: [pull_request]

jobs:
  ea-checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for diff
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci

      # Step 1: Full reconcile (generate + validate + drift)
      - name: Reconcile
        run: npx anchored-spec reconcile --fail-on error

      # Step 2: Compatibility check
      - name: Breaking change detection
        run: npx anchored-spec diff ${{ github.event.pull_request.base.ref }} --compat --fail-on breaking

      # Step 3: Version policy enforcement
      - name: Version policy
        run: npx anchored-spec diff ${{ github.event.pull_request.base.ref }} --policy
```

---

## API Reference

All SDD capabilities are available as programmatic APIs:

```typescript
import {
  // Diff engine
  diffEaArtifacts,
  loadArtifactsFromGitRef,
  diffEaGitRefs,
  renderDiffMarkdown,
  renderDiffSummary,

  // Compatibility
  assessCompatibility,
  renderCompatMarkdown,
  renderCompatSummary,

  // Reconcile
  reconcileEaProject,
  renderReconcileOutput,

  // Version policy
  resolveVersionPolicy,
  enforceVersionPolicies,
  renderPolicyMarkdown,
  renderPolicySummary,
} from "anchored-spec";
```

See the [TypeScript source](../src/ea/) for full type definitions.
