# ADR-006: Catalog Bootstrap and Repository Synthesis

## Status

Proposed

## Context

Anchored Spec can discover source-level signals, validate authored entities, and work from a manifest such as `catalog-info.yaml`, but it cannot yet synthesize a useful repository-specific catalog on its own.

Today the gap shows up in three ways:

- raw discovery is often too low-level to become an authored catalog directly
- the framework does not infer a small set of canonical top-level entities for the repository
- users must learn validator-specific authoring expectations after generation instead of getting valid output by default

This is a problem because the framework already has enough evidence to propose a strong first-pass catalog in many repositories:

- package metadata
- CLI commands
- public exports
- docs structure and document content
- discovery resolver evidence
- current config and storage mode

The missing capability is not extraction. It is semantic consolidation.

## Decision

Anchored Spec will add an opinionated but configurable repository synthesis workflow that can propose, preview, and write a curated catalog from repository evidence.

The workflow will:

- prefer a small, reviewable model over exhaustive low-level discovery output
- generate Backstage-aligned entities with validator-safe defaults
- remain adaptable through profiles, evidence weights, and mapping rules rather than repository-specific hardcoding
- treat generated output as a proposal to review, not an undisclosed source-of-truth rewrite

This capability will be introduced as a new `catalog` command family and a new configuration section in schema version `1.2`.

## Goals

- produce a valid first-pass `catalog-info.yaml` in manifest-mode repositories
- synthesize meaningful top-level entities from code, docs, and package metadata
- emit explanations showing what evidence justified each entity
- keep defaults strong enough to work out of the box
- allow repositories with different layouts and naming conventions to steer the result without custom code

## Non-Goals

- replace explicit authoring with fully automatic architecture ownership
- emit every discovered internal module as a top-level entity
- require one repository layout, language, or documentation structure
- infer relationships that have weak or no supporting evidence

## Command Surface

### 1. `anchored-spec catalog bootstrap`

Generate a proposed catalog from repository evidence.

```bash
npx anchored-spec catalog bootstrap
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --format json
npx anchored-spec catalog bootstrap --write catalog-info.yaml
npx anchored-spec catalog bootstrap --merge
npx anchored-spec catalog bootstrap --profile library
npx anchored-spec catalog bootstrap --include requirements,decisions,capabilities
npx anchored-spec catalog bootstrap --source docs --source src
```

Behavior:

- loads repository config and current storage mode
- collects evidence from configured evidence sources
- synthesizes a proposed catalog
- prints a reviewable plan in human-readable form by default
- writes YAML only when `--write` or `--merge` is supplied

Defaults:

- in manifest mode, `--write` defaults to `manifestPath`
- in inline mode, bootstrap runs in plan mode unless `--output-mode manifest` is passed
- default output is curated, not exhaustive

Flags:

- `--dry-run`: print the proposed plan without writing files
- `--write <path>`: write a complete proposed manifest to a target file
- `--merge`: merge missing entities into the existing manifest instead of overwriting it
- `--format <text|json|yaml>`: select output format for the proposal
- `--profile <auto|library|cli|service|webapp|workspace>`: force or override repo archetype detection
- `--include <list>`: control optional entity families such as `capabilities`, `requirements`, `decisions`, `resources`
- `--source <dir>`: add evidence scan roots
- `--min-confidence <n>`: suppress entities below a confidence threshold
- `--max-components <n>`: cap the number of synthesized top-level components
- `--explain`: include evidence traces and confidence scoring in the output

### 2. `anchored-spec catalog plan`

Produce a normalized synthesis plan without writing entities.

```bash
npx anchored-spec catalog plan
npx anchored-spec catalog plan --format json
```

Behavior:

- emits planner stages, inferred archetype, candidate entities, suppressed evidence, and merge actions
- intended for CI previews, editor integrations, and debugging synthesis behavior

### 3. `anchored-spec catalog apply`

Apply a previously generated plan or regenerate and write in one step.

```bash
npx anchored-spec catalog apply
npx anchored-spec catalog apply --plan .anchored-spec/cache/catalog-plan.json
npx anchored-spec catalog apply --merge
```

Behavior:

- validates the plan before writing
- writes manifest entities in canonical order
- refuses to overwrite existing authored entities unless `--merge` or `--force` is supplied

### 4. `anchored-spec catalog explain`

Show why a given entity was proposed.

```bash
npx anchored-spec catalog explain component:default/anchored-spec-cli
```

Behavior:

- displays evidence, weights, naming decisions, inferred relationships, and suppressed alternatives

## Configuration Shape

Configuration moves to schema version `1.2`.

Repositories that do not opt in continue to work without this section.

```json
{
  "schemaVersion": "1.2",
  "entityMode": "manifest",
  "manifestPath": "catalog-info.yaml",
  "catalog": {
    "bootstrap": {
      "enabled": true,
      "profile": "auto",
      "outputMode": "curated",
      "writeTarget": "catalog-info.yaml",
      "minConfidence": 0.6,
      "maxTopLevelComponents": 8,
      "include": {
        "owners": true,
        "domain": true,
        "system": true,
        "components": true,
        "apis": true,
        "capabilities": true,
        "requirements": true,
        "decisions": true,
        "resources": false
      },
      "defaults": {
        "ownerRef": "group:default/maintainers",
        "ownerKind": "Group",
        "ownerType": "team",
        "ownerUnitType": "team",
        "componentLifecycle": "production",
        "apiLifecycle": "production",
        "capabilityLevel": 1
      },
      "evidence": {
        "sources": [
          { "type": "package-json", "enabled": true, "weight": 1.0 },
          { "type": "exports", "enabled": true, "weight": 0.9 },
          { "type": "cli-commands", "enabled": true, "weight": 0.9 },
          { "type": "docs", "enabled": true, "weight": 1.0 },
          { "type": "discovery", "enabled": true, "weight": 0.7 },
          { "type": "git", "enabled": false, "weight": 0.3 }
        ]
      },
      "mappings": {
        "docs": {
          "decisionSections": ["decision-record"],
          "requirementSections": ["requirement"],
          "capabilitySections": ["architecture"],
          "apiSections": ["architecture"],
          "componentSections": ["architecture"]
        },
        "archetypes": {
          "cliSignals": ["bin", "src/cli", "commands"],
          "librarySignals": ["exports", "src/index", "src/lib", "src/ea"],
          "serviceSignals": ["Dockerfile", "server", "app", "api"],
          "webappSignals": ["next.config", "vite.config", "src/routes", "src/app"]
        },
        "entityKinds": {
          "owner": "Group",
          "topLevelRuntime": "Component",
          "publicApi": "API",
          "businessCapability": "Capability",
          "decisionRecord": "Decision",
          "requirementRecord": "Requirement"
        }
      },
      "naming": {
        "systemFromPackageName": true,
        "stripPrefixes": [],
        "stripSuffixes": [],
        "componentSuffixes": {
          "cli": "cli",
          "runtime": "runtime",
          "api": "api"
        }
      }
    }
  }
}
```

### Configuration Semantics

- `catalog.bootstrap.profile`: archetype selection strategy
- `catalog.bootstrap.outputMode`: `curated` or `expanded`
- `catalog.bootstrap.defaults`: validator-safe fallback values when evidence is incomplete
- `catalog.bootstrap.evidence.sources`: enabled evidence collectors and their weights
- `catalog.bootstrap.mappings.docs`: semantic document section mapping, not physical hardcoding
- `catalog.bootstrap.mappings.archetypes`: lightweight signals used to classify repository shape
- `catalog.bootstrap.naming`: naming normalization rules

### Why This Stays Adaptable

The workflow is opinionated in output shape, not hardcoded to one repository layout.

It adapts by:

- reading semantic `docs.sections[].kind` values rather than specific folder names
- classifying archetypes from weighted signals rather than path equality
- allowing source weighting and inclusion to vary per repository
- using naming rules and defaults instead of fixed entity names
- treating extracted evidence as candidate support, not as a mandatory final entity

## Planner Stages

The synthesis planner runs as a deterministic staged pipeline.

### Stage 1. Evidence Collection

Collect normalized evidence records from:

- package metadata
- public exports
- CLI command registration
- configured docs scan directories
- discovery resolvers
- existing catalog entities when present

Output:

- `EvidenceRecord[]`

Example evidence record:

```json
{
  "source": "docs",
  "kind": "component-doc",
  "path": "docs/04-component/anchored-spec-cli.md",
  "title": "Anchored Spec CLI",
  "signals": ["public-surface", "cli", "src/cli"],
  "weight": 1,
  "confidence": 0.95
}
```

### Stage 2. Archetype Detection

Infer the repository shape using weighted evidence:

- `library`
- `cli`
- `service`
- `webapp`
- `workspace`
- hybrid combinations such as `cli+library`

Output:

- `RepoArchetype`
- supporting reasons

Example:

```json
{
  "archetype": "cli+library",
  "reasons": [
    "package.json has a bin entry",
    "package exports expose a node API",
    "src/cli and src/ea are both present"
  ]
}
```

### Stage 3. Canonical Structure Planning

Build the smallest useful top-level model:

- owner
- domain
- system
- top-level runtime components
- public APIs

Planner rules:

- top-level components should represent meaningful runtime or public seams
- internal modules should attach under those seams, not compete with them
- the planner should prefer stable conceptual boundaries over file-count boundaries

Output:

- `CanonicalStructurePlan`

### Stage 4. Entity Family Expansion

Expand optional entity families when the evidence is strong enough:

- requirements from requirement documents
- decisions from ADR-style docs
- capabilities from business architecture or capability docs
- resources only when clearly modeled and stable

Planner rules:

- do not emit optional entities when the repository has weak support for them
- use validator-safe defaults for required fields
- attach source annotations to all synthesized entities

### Stage 5. Relationship Synthesis

Infer only relationships with strong support:

- `Component -> providesApis -> API`
- `Component -> dependsOn -> Component`
- `System -> domain -> Domain`
- `Component -> system -> System`
- `Capability -> supportedBy -> Component|API`
- `Decision -> dependsOn -> Decision`
- `Requirement -> dependsOn -> Requirement`

Planner rules:

- never invent high-risk relationships from naming similarity alone
- do not emit relations disallowed by the live relation registry
- prefer omission over weak inference

### Stage 6. Merge and Conflict Resolution

Compare the plan to the current manifest if one exists.

Cases:

- missing entity in manifest: propose add
- same entity with missing fields: propose enrich
- conflicting authored field: preserve authored value and emit a warning
- low-confidence candidate: suppress from apply and keep in the explanation report

Output:

- `CatalogPlan`
- `MergeAction[]`
- `SuppressedCandidate[]`

### Stage 7. Validation and Explainability

Before write:

- validate against schemas
- validate against quality rules
- validate against relation registry
- render an explanation graph for each proposed entity

The planner must fail before write if:

- synthesized entities do not validate
- required defaults are missing
- the target write strategy would overwrite authored entities without approval

## Output Modes

### `curated`

Default mode.

Characteristics:

- small set of top-level entities
- major public surfaces only
- optional families included only when evidence is strong
- suitable for first-pass `catalog-info.yaml`

### `expanded`

For deeper bootstrapping.

Characteristics:

- includes more synthesized subcomponents and resources
- still grouped under the canonical top-level structure
- intended for repositories that want more aggressive first-pass modeling

## Expected Output Examples

### Example 1. Dry Run Summary

```text
$ npx anchored-spec catalog bootstrap --dry-run

Anchored Spec — Catalog Bootstrap

Archetype: cli+library
Confidence: 0.93

Planned entities:
  + Group        anchored-spec-maintainers
  + Domain       anchored-spec
  + System       anchored-spec-framework
  + Component    anchored-spec-cli
  + Component    anchored-spec-ea-runtime
  + Component    anchored-spec-model-core
  + Component    anchored-spec-discovery-engine
  + API          anchored-spec-cli-api
  + API          anchored-spec-node-api
  + Capability   explicit-architecture-authoring
  + Requirement  req-001-entity-model-as-source-of-truth
  + Decision     adr-001-backstage-aligned-entity-envelope

Suppressed candidates:
  - Resource physical-schema report-row-model
    reason: low-value internal implementation artifact
  - Resource physical-schema status-summary-shape
    reason: grouped under runtime internals

Write target:
  catalog-info.yaml
```

### Example 2. JSON Plan

```json
{
  "archetype": "cli+library",
  "confidence": 0.93,
  "writeTarget": "catalog-info.yaml",
  "actions": [
    {
      "action": "create",
      "entityRef": "component:default/anchored-spec-cli",
      "reason": "docs component page, src/cli presence, package bin entry"
    },
    {
      "action": "create",
      "entityRef": "api:default/anchored-spec-node-api",
      "reason": "package exports and node API docs"
    }
  ],
  "suppressed": [
    {
      "candidateRef": "resource:default/report-row-model",
      "reason": "internal implementation detail below top-level synthesis threshold"
    }
  ]
}
```

### Example 3. Generated YAML Shape

```yaml
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: anchored-spec-framework
  title: Anchored Spec Framework
  annotations:
    anchored-spec.dev/source: docs/02-system-context/system-context.md
spec:
  owner: group:default/anchored-spec-maintainers
  domain: domain:default/anchored-spec
  status: active
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: anchored-spec-cli
  title: Anchored Spec CLI
  annotations:
    anchored-spec.dev/source: docs/04-component/anchored-spec-cli.md
spec:
  type: tool
  lifecycle: production
  owner: group:default/anchored-spec-maintainers
  system: system:default/anchored-spec-framework
  providesApis:
    - api:default/anchored-spec-cli-api
```

## Validation and Authoring Defaults

Bootstrap output must satisfy the framework as it actually validates today, not only the nominal kind schemas.

Required generated defaults include:

- `Group.spec.type`
- `Group.spec.unitType`
- `Group.spec.children`
- default non-draft status for foundational ownership entities
- `Capability.spec.level`
- safe default lifecycle for synthesized `Component` and `API` entities

The generator must use the live relation registry when deciding which inferred relationships are allowed.

## Backward Compatibility

- repositories without `catalog.bootstrap` continue to behave unchanged
- `schemaVersion: 1.1` remains supported
- `schemaVersion: 1.2` is required only for repositories that want explicit bootstrap configuration
- `catalog bootstrap --dry-run` should still work with legacy config by using built-in defaults

## Implementation Notes

### Runtime

Add new modules:

- `src/ea/catalog/evidence.ts`
- `src/ea/catalog/archetype.ts`
- `src/ea/catalog/planner.ts`
- `src/ea/catalog/merge.ts`
- `src/ea/catalog/explain.ts`

### CLI

Add new commands:

- `src/cli/commands/ea-catalog-bootstrap.ts`
- `src/cli/commands/ea-catalog-plan.ts`
- `src/cli/commands/ea-catalog-apply.ts`
- `src/cli/commands/ea-catalog-explain.ts`

### Config

Extend:

- `src/ea/config.ts`
- `docs/schemas/config-v1.schema.json`

### Tests

Add coverage for:

- archetype detection
- curated vs expanded synthesis
- merge behavior against an existing manifest
- validation-safe default generation
- docs-driven capability, requirement, and decision extraction
- suppression of noisy discovery artifacts

## Consequences

### Positive

- repositories get a much stronger first-pass catalog without manual assembly
- generated output is smaller, clearer, and more Backstage-aligned than raw discovery
- framework behavior becomes easier to explain to humans and agents
- existing docs and code structure become materially more useful during adoption

### Negative

- planner logic adds a new opinionated layer that must be tested carefully
- users may disagree with some synthesis boundaries and need config knobs to tune them
- explainability must stay strong or the planner will feel arbitrary

## Acceptance Criteria

- `npx anchored-spec catalog bootstrap --dry-run` can produce a valid curated plan in a typical manifest-mode repository
- `npx anchored-spec catalog apply` writes a manifest that passes `npx anchored-spec validate`
- the planner suppresses low-value implementation artifacts by default
- the planner can work with multiple docs layouts using semantic section mappings
- the planner never emits relations disallowed by the live relation registry
- the explanation output shows the evidence used for each synthesized entity
