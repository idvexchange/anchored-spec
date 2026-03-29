# EA Phase 2: Full Domain Expansion — Overview

This document is the master index for Phase 2 of the enterprise architecture extension. Phase 1 delivered the core infrastructure and 10 artifact kinds across the systems and delivery domains. Phase 2 expands the model to cover all NIST architecture layers with 36+ total artifact kinds, the full drift engine, resolver packs, generators, and REQ/CHG/ADR subsumption.

## Prerequisites

Phase 1 must be complete before starting Phase 2. Phase 1 deliverables:

- ✅ Unified artifact base shape (`ArtifactBase` in `src/ea/types.ts`)
- ✅ Namespaced ID scheme (`{domain}/{PREFIX}-{slug}`)
- ✅ Confidence model (`declared | observed | inferred`)
- ✅ Anchors model (replacing/extending `SemanticRefs`)
- ✅ EA config (`ea` section in `.anchored-spec/config.json`)
- ✅ EA loader (`EaRoot` in `src/ea/loader.ts`)
- ✅ Schema validation with per-kind schemas (`src/ea/validate.ts`)
- ✅ Relation registry with Phase A relations (`src/ea/relation-registry.ts`)
- ✅ Graph builder with virtual inverses (`src/ea/graph.ts`)
- ✅ CLI commands: `ea init`, `ea create`, `ea validate`, `ea graph`
- ✅ 10 artifact kinds: `application`, `service`, `api-contract`, `event-contract`, `integration` (systems) + `platform`, `deployment`, `runtime-cluster`, `network-zone`, `identity-boundary` (delivery)
- ✅ 10 relation types: `realizes`, `uses`, `exposes`, `consumes`, `dependsOn`, `deploys`, `runsOn`, `boundedBy`, `authenticatedBy`, `deployedTo`

## Phase 2 Document Map

Read the sub-documents in order. Each is self-contained for a fresh-context AI agent working on that specific sub-phase.

| Sub-Phase | Document | Kinds Added | Relations Added | Key Deliverables |
|---|---|---|---|---|
| 2A | [ea-phase2a-systems-delivery-completion.md](./ea-phase2a-systems-delivery-completion.md) | 5 | 3 | Complete systems + delivery domains |
| 2B | [ea-phase2b-data-layer.md](./ea-phase2b-data-layer.md) | 7 | 4 | Full data architecture domain |
| 2C | [ea-phase2c-information-layer.md](./ea-phase2c-information-layer.md) | 6 | 3 | Full information architecture domain |
| 2D | [ea-phase2d-business-layer.md](./ea-phase2d-business-layer.md) | 8 | 4 | Full business architecture domain |
| 2E | [ea-phase2e-transitions-evidence-reporting.md](./ea-phase2e-transitions-evidence-reporting.md) | 5 | 3 | Transitions, evidence extension, reporting |
| 2F | [ea-phase2f-drift-generators-subsumption.md](./ea-phase2f-drift-generators-subsumption.md) | 3 | 1 | Drift engine, resolvers, generators, legacy migration |

**Cumulative kind count:**

| After Phase | Total Kinds | Total Relations |
|---|---|---|
| Phase 1 (A) | 10 | 10 |
| Phase 2A | 15 | 13 |
| Phase 2B | 22 | 17 |
| Phase 2C | 28 | 20 |
| Phase 2D | 36 | 24 |
| Phase 2E | 41 | 27 |
| Phase 2F (subsumption) | 44 | 28 |

## Implementation Principles for Phase 2

### Additive Only

Every Phase 2 sub-phase is strictly additive to Phase 1:
- New schemas are added to `src/ea/schemas/`
- New kinds are registered in the kind taxonomy
- New relations are added to the registry via `registry.register()`
- New drift rules are added to the rule catalog
- New CLI options extend existing commands (no breaking changes)

### One Domain Per PR

Each sub-phase should be implemented as 1-3 PRs:
1. **Schemas + Types**: kind-specific interfaces, JSON schemas, kind taxonomy registration
2. **Relations + Drift**: relation registry additions, domain-specific drift rules, validation integration
3. **CLI + Reports** (where applicable): `ea create` templates, domain-specific reports

### Pattern Consistency

Every new kind follows the exact same pattern established in Phase 1:
1. TypeScript interface extending `ArtifactBase`
2. JSON Schema `$ref`-ing `artifact-base.schema.json`
3. Entry in the kind taxonomy (domain, prefix, description)
4. `ea create` template
5. Example fixture in `src/ea/__tests__/fixtures/`
6. Schema validation test (valid + invalid)

### Relation Registry Growth

New relations are added via the existing `RelationRegistry.register()` method. The `createDefaultRegistry()` function grows to include all phases. A phase-awareness pattern is recommended:

```typescript
export function createDefaultRegistry(): RelationRegistry {
  const registry = new RelationRegistry();

  // Phase A: Systems + Delivery core
  PHASE_A_RELATIONS.forEach(r => registry.register(r));

  // Phase 2A: Systems + Delivery completion
  PHASE_2A_RELATIONS.forEach(r => registry.register(r));

  // Phase 2B: Data
  PHASE_2B_RELATIONS.forEach(r => registry.register(r));

  // ... etc

  return registry;
}
```

## Dependency Graph Between Sub-Phases

```
Phase 1 (complete)
    │
    ├── 2A: Systems + Delivery Completion (no dependencies beyond Phase 1)
    │
    ├── 2B: Data Layer (no dependencies beyond Phase 1)
    │       │
    │       └── 2C: Information Layer (depends on 2B for implementedBy relation to data kinds)
    │               │
    │               └── 2D: Business Layer (depends on 2C for classifiedAs traversal)
    │
    └── 2E: Transitions + Evidence + Reporting (depends on 2A-2D for full artifact coverage)
            │
            └── 2F: Drift, Generators, Subsumption (depends on 2E for exception suppression)
```

**Parallelizable:** 2A and 2B can be implemented in parallel. 2C depends on 2B. 2D depends on 2C. 2E depends on all of 2A-2D. 2F depends on 2E.

## Fresh-Context Agent Protocol for Phase 2

When starting any Phase 2 sub-phase in a fresh context:

1. Read [ea-design-overview.md](./ea-design-overview.md) — understand design decisions (especially DD-1 through DD-10)
2. Read this file — understand Phase 2 structure and cumulative state
3. Read the specific sub-phase document you are implementing
4. Inspect existing code:
   - `src/ea/types.ts` — current type definitions (will grow each sub-phase)
   - `src/ea/relation-registry.ts` — current registry entries
   - `src/ea/schemas/` — current schema files
   - `src/ea/__tests__/` — current test patterns
5. Implement the sub-phase following the PR breakdown in the sub-phase document
6. Run `pnpm verify` after each PR to confirm no regressions

## Success Criteria for Phase 2

Phase 2 is complete when:

- All 5 NIST architecture domains have complete artifact kind coverage
- The relation registry covers all cross-domain relationships
- Drift rules exist for all 5 domains
- The transition model bridges to the existing change management system
- Evidence pipeline is extended (not forked) for EA evidence kinds
- At least 3 report views are generated (system-data matrix, capability map, target gap)
- The drift engine runs with at least one real resolver (OpenAPI)
- The generator plugin interface is implemented with at least one generator
- REQ/CHG/ADR migration tooling exists and produces valid EA artifacts
- `anchored-spec ea discover` can bootstrap drafts from at least one source
