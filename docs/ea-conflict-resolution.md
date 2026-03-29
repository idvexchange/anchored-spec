# EA Conflict Resolution Semantics

This document defines the precedence model for resolving conflicts between declared architecture, observed reality, generated artifacts, and discovered state.

Read [ea-design-overview.md](./ea-design-overview.md) for context, especially DD-1 (spec-as-source means both generative and authoritative).

## The Three Sources of Truth

In a spec-as-source system, information flows in multiple directions. Conflicts arise when these directions disagree:

| Source | Direction | Example |
|---|---|---|
| **Declared** | Human → spec → system | An architect writes `api-contract` artifact declaring `POST /orders` |
| **Observed** | System → resolver → finding | The OpenAPI resolver finds `POST /orders` AND `POST /orders/bulk` in the running API |
| **Generated** | Spec → generator → file | The OpenAPI generator produces an `openapi.yaml` from the `api-contract` artifact |

## Precedence Rules

### Rule 1: Declared State Is Authoritative

**The declared EA artifact is always the source of truth.** If declared state conflicts with observed state, it is a **drift finding**, not an override.

The spec does not auto-update from observed reality. Drift findings tell humans "reality doesn't match your declared architecture." Humans decide what to do:
- Update the spec to match reality (spec was wrong)
- Fix reality to match the spec (reality drifted)
- Create an exception (known gap, accepted temporarily)

### Rule 2: Discovery Creates Drafts, Never Overwrites

When `ea discover` finds something in observed state that matches an existing declared artifact:
- It does **not** modify the existing artifact
- It reports the match in the discovery report
- If the observed state has additional information (new anchors, new relations), it suggests additions

When discovery finds something entirely new:
- It creates a **draft** artifact with `confidence: "inferred"` or `"observed"`
- Draft artifacts are never authoritative until a human promotes them to `status: "active"` with `confidence: "declared"`

### Rule 3: Generated Artifacts Are Derived, Not Source

Generated files (OpenAPI stubs, JSON Schema, K8s manifests) are **outputs of** EA artifacts, not inputs. If a generated file is manually edited:
- The `ea generate --check` command detects the divergence
- The finding suggests either regenerating (overwrite manual edits) or updating the source spec
- Generated files never feed back into the EA artifact automatically

### Rule 4: Resolvers May Disagree — First Match Wins

When multiple resolvers can resolve the same anchor, the resolver chain order (from config) determines precedence. The first resolver to return a non-null result wins.

If two resolvers resolve the same anchor differently (one says "found", another says "missing"):
- Only the first resolver's result is used
- Teams should order resolvers from most authoritative to least authoritative

### Rule 5: Explicit Overrides Trump Virtual Inference

- Explicit inverse relations override virtual inverses
- Explicit severity overrides (in config) override default rule severities
- Explicit exceptions override drift findings
- Explicit `confidence: "declared"` overrides any inference

## Conflict Scenarios and Resolutions

### Scenario A: Undocumented API Endpoint

**Situation:** Resolver finds `GET /orders/search` in observed OpenAPI spec. No EA artifact declares this endpoint.

**Resolution:**
- Drift engine emits `ea:systems/undocumented-api` finding
- The finding says: "Observed API GET /orders/search is not declared in any api-contract artifact"
- Human options:
  1. Add the endpoint to the existing `api-contract` artifact's `anchors.apis`
  2. Create a new `api-contract` artifact for the search API
  3. Create an `exception` artifact if this is a known gap
  4. Remove the endpoint from the running API (if it shouldn't exist)

### Scenario B: Discovery Conflicts with Declared State

**Situation:** `ea discover` with the Kubernetes resolver finds a deployment `order-service` running 5 replicas. The declared `deployment` artifact says `replicas: 3`.

**Resolution:**
- Discovery does NOT overwrite the existing artifact
- Discovery report includes the match and notes: "Observed replicas: 5, declared replicas: 3"
- This becomes a drift finding: declared state says 3, reality says 5
- Human decides which is correct and updates accordingly

### Scenario C: Generated File Was Manually Edited

**Situation:** The OpenAPI generator produced `generated/api/orders.openapi.yaml`. A developer added a `security` section manually.

**Resolution:**
- `ea generate --check` detects the divergence
- Finding: "Generated file orders.openapi.yaml has been manually modified"
- Suggestion: `"update-spec"` — incorporate the security metadata into the `api-contract` artifact, then regenerate
- If the team regenerates without updating the spec, the manual security section is lost
- Teams should treat generated files as read-only and push changes upstream to the EA artifact

### Scenario D: Two Resolvers Disagree

**Situation:** The OpenAPI resolver (reading a local file) says `POST /orders` exists. The service catalog resolver (reading a registry) says `POST /orders` does not exist.

**Resolution:**
- Resolver chain order determines the winner
- If OpenAPI resolver is listed first in config, the anchor is marked "found"
- The service catalog resolver's result is never consulted for this anchor
- Teams should put the most authoritative resolver first in their config

### Scenario E: Exception vs New Drift

**Situation:** An exception suppresses `ea:systems/undocumented-api` for `APP-billing-service`. The billing team adds a new undocumented endpoint.

**Resolution:**
- If the exception's `scope.rules` includes `ea:systems/undocumented-api` AND `scope.artifactIds` includes `APP-billing-service`, **all** undocumented API findings for that artifact are suppressed
- The new endpoint is suppressed too — which may hide a real problem
- Recommendation: scope exceptions narrowly. Use `scope.rules` to target specific rules, not blanket suppression
- Exception review schedule (`reviewSchedule: "monthly"`) exists to catch this

### Scenario F: Baseline Artifact Changed After Capture

**Situation:** A baseline captures `STORE-orders-postgres` at `capturedAt: 2026-04-01`. The artifact is later modified (new columns added). The baseline still references the old state.

**Resolution:**
- Baselines reference artifacts by ID, not by snapshot. They reflect the **current** state of referenced artifacts, not the state at `capturedAt`.
- If point-in-time state matters, the team should version their artifacts using `schemaVersion` or create new baselines periodically
- The `ea:transition/stale-baseline` rule warns when `capturedAt` is too old

## Confidence Model and Conflict Prevention

The `confidence` field is the primary mechanism for preventing conflicts:

| Confidence | Who Sets It | Modifiable By | Precedence |
|---|---|---|---|
| `declared` | Human (via manual creation or review) | Human only | Highest |
| `observed` | Resolver (from authoritative source like K8s API) | Human promotion or resolver re-run | Medium |
| `inferred` | Discovery heuristic | Human promotion only | Lowest |

**Rules:**
- `inferred` artifacts are never used by drift detection (they are drafts, not truth)
- `observed` artifacts can be used by drift detection but produce lower-confidence findings
- `declared` artifacts are always used by drift detection and produce full-confidence findings
- An artifact can only move UP in confidence: `inferred → observed → declared`
- Moving down requires explicit human action (rare — usually means deleting and re-discovering)

## Exception Best Practices

Exceptions are the governance pressure release valve. Use them wisely:

### DO:
- Scope exceptions to specific artifact IDs and specific rules
- Set expiry dates (30-90 days typical)
- Set review schedules
- Include a clear `reason` explaining why the exception is needed
- Link exceptions to transition plans or migration waves

### DON'T:
- Create exceptions with empty scope (suppresses everything)
- Set expiry dates years in the future
- Use exceptions instead of fixing the underlying problem
- Create exceptions without approval metadata

### Exception Lifecycle

```
create (draft) → approve (active) → review (still needed?) → expire → close/renew
```

The `ea:exception/expired` drift rule catches exceptions past their expiry. The `ea:exception/overdue-review` rule catches exceptions past their review schedule.
