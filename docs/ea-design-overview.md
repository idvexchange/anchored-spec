# EA Spec-as-Source Design Overview

This document is the master index for the Anchored Spec enterprise architecture extension. It describes the design philosophy, key decisions, architectural positioning, and links to detailed specification documents.

It is written as an implementation design document. The goal is to give human engineers and AI agents enough structure to implement the extension across multiple fresh context windows without re-deriving the model.

## Related Documents

Read these documents in order for full implementation context:

### Core Design

1. **This file** — overview, decisions, positioning
2. [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) — unified artifact base, kind taxonomy, ID scheme, subsumption path
3. [ea-relationship-model.md](./ea-relationship-model.md) — relation types, directionality, registry, graph validation
4. [ea-drift-resolvers-generators.md](./ea-drift-resolvers-generators.md) — drift detection, resolver interface, generator interface, discovery workflow
5. [ea-transitions-evidence-reporting.md](./ea-transitions-evidence-reporting.md) — baseline/target/transition model, evidence extension, reporting views
6. [ea-implementation-guide.md](./ea-implementation-guide.md) — phased plan, module layout, CLI design, config schema

### Supplementary

7. [ea-ci-integration.md](./ea-ci-integration.md) — CI/CD pipeline integration, GitHub Actions examples, staged adoption
8. [ea-adoption-playbook.md](./ea-adoption-playbook.md) — practical brownfield adoption guide, first 30 min to first month
9. [ea-conflict-resolution.md](./ea-conflict-resolution.md) — declared vs observed vs inferred precedence, resolver chain conflicts
10. [ea-model-health-metrics.md](./ea-model-health-metrics.md) — model health dimensions, scoring algorithm
11. [ea-schema-evolution.md](./ea-schema-evolution.md) — versioning model, migration strategies
12. [ea-testing-guide.md](./ea-testing-guide.md) — test patterns for schema, graph, anchors, drift, resolvers, generators
13. [ea-multi-repo-federation.md](./ea-multi-repo-federation.md) — cross-repo references, federated graph, manifest publishing
14. [ea-glossary.md](./ea-glossary.md) — NIST/TOGAF term mapping, comprehensive glossary
15. [ea-visualization.md](./ea-visualization.md) — `ea graph` output formats, filtering

### Reference

- [examples/ea/](../examples/ea/) — 15-artifact e-commerce platform fixture set
- [SKILL.md](../SKILL.md) Section 13 — AI agent skill rules for EA workflows

### Existing Core Documentation

- [concepts.md](./concepts.md) — existing requirement, change, and decision model
- [drift-detection.md](./drift-detection.md) — existing semantic drift engine
- [plugins-and-hooks.md](./plugins-and-hooks.md) — existing plugin and hook system
- [evidence-pipeline.md](./evidence-pipeline.md) — existing test evidence pipeline

## Purpose

Anchored Spec already provides a strong SpecOps foundation for:

- JSON-first specification artifacts
- workflow policy and lifecycle enforcement
- semantic drift detection
- evidence and impact analysis
- plugin-based verification

This extension moves the framework from **spec-anchored** (specs track and verify reality) to **spec-as-source** (specs are the generative authority from which implementation is derived, and against which reality is verified).

To support enterprise architecture, the framework must move beyond software requirements and change records into a broader architecture meta-model that can represent:

- business intent
- information concepts
- application/system structure
- data architecture
- delivery/runtime architecture
- transitions between current and target state

The resulting system allows teams to:

1. **Define** architecture as governed data
2. **Generate** implementation artifacts from specs where possible (OpenAPI, Terraform, K8s manifests, JSON Schema)
3. **Detect drift** between declared enterprise architecture and operational reality
4. **Discover** existing infrastructure and bootstrap EA artifacts from observed state

## Problem Statement

The current Anchored Spec model is optimized for software delivery governance:

- `REQ-*` captures behavioral software requirements
- `CHG-*` captures implementation work
- `ADR-*` captures architectural decisions
- `workflow-policy.json` governs process

That model is not sufficient for enterprise architecture because it lacks:

- enterprise architecture artifact types beyond software requirements
- typed relationships between architecture elements
- baseline and target state modeling
- transition planning as a first-class artifact
- resolvers for infrastructure, API catalogs, schema registries, and data platforms
- drift detection across architecture layers, not just code anchors
- a generative pipeline from spec to implementation artifact
- a discovery pipeline from observed infrastructure to draft spec artifacts
- a path to subsume REQ/CHG/ADR into a unified artifact model

## Design Decisions

These decisions were made during design review and are binding on implementation.

### DD-1: Spec-as-Source Means Both Generative and Authoritative

Specs are **generative** where possible: an `api-contract` artifact can generate an OpenAPI stub, a `deployment` artifact can generate a K8s manifest template. Specs are **authoritative** as fallback: where generation is not supported, specs remain the canonical source of truth that reality must conform to.

The framework ships a **generator plugin interface** first, then specific generators as separate phases.

### DD-2: Bottom-Up Is the Easier On-Ramp

The primary adopter path is bottom-up: engineering teams describe their systems, architecture is aggregated upward. Top-down (enterprise architects define capabilities, teams conform) is also supported but is not the required entry point.

This means the `systems` and `delivery` layers are implemented first. The `business` layer comes later.

### DD-3: Monorepo Deployment Topology

EA artifacts live alongside code in a monorepo. The ID scheme must support scoping within a single large repository. Federation across repositories is a future concern, not a Phase 1 requirement, but the ID scheme should not prevent it.

### DD-4: REQ/CHG/ADR Will Be Subsumed

The existing `Requirement`, `Change`, and `Decision` artifact types will eventually become specialized **kinds** within the unified EA artifact model. The EA base artifact shape must be designed now to accommodate this subsumption, even though migration is implemented later.

Specifically:
- `Requirement` becomes kind `requirement` in the EA model
- `Change` becomes kind `change` in the EA model
- `Decision` becomes kind `decision` in the EA model
- `semanticRefs` maps to EA `anchors`
- All existing schemas and validation continue to work during the transition period

### DD-5: Discovery Is Critical for Adoption

An `ea discover` command must exist that can scan existing infrastructure (K8s, Terraform, OpenAPI specs, etc.) and bootstrap EA artifact drafts automatically. Discovered artifacts are written with `status: "draft"` and `confidence: "inferred"`. This is the brownfield on-ramp.

Resolvers gain a `discoverArtifacts()` method that runs in the reverse direction from `resolveAnchors()`.

### DD-6: Relation Inverses Are Virtual

Relations are stored directionally on the source artifact. Inverse relations are computed virtually by the graph builder. Explicit inverse overrides are allowed only when the virtual inverse is incorrect.

The relation vocabulary is halved: only canonical directions are stored. `*By` variants exist only in query results.

### DD-7: Generator Plugin Interface Ships Before Specific Generators

The generator framework defines a plugin interface for transforming EA artifacts into implementation artifacts. Specific generators (OpenAPI, Terraform, K8s, JSON Schema) ship as separate phases after the interface stabilizes.

### DD-8: Evidence Model Is Extended, Not Forked

EA evidence reuses the existing evidence pipeline with new evidence kinds. There is no parallel `EVID-*` scheme. The existing `Evidence` and `EvidenceRecord` types gain new `kind` values: `contract`, `deployment`, `inventory`, `catalog`, `lineage`, `policy`, `security`, `performance`.

### DD-9: Phase 1 Is Narrow — Systems and Delivery Only

Phase 1 ships 10 artifact kinds (5 systems, 5 delivery), 8 relation types, and the core infrastructure (loader, validator, CLI). It does not attempt all 35+ kinds across all 6 layers. Each subsequent phase adds one layer.

### DD-10: Open Questions Resolved

| Question | Resolution |
|---|---|
| Same or parallel markdown pipeline? | **Parallel generator** — EA views are structurally different from REQ markdown |
| Physical or virtual inverses? | **Virtual with override** — store directional, compute inverse, allow explicit override |
| Baseline snapshots: IDs only or embedded? | **IDs only** — baselines reference artifacts by ID, no embedded copies |
| Evidence location? | **Extend existing evidence.json** with new evidence kinds |
| Exception suppression? | **First-class exception artifact** with expiry, approver, and scope |

## Architectural Positioning

The extension treats enterprise architecture as a **generative and governing control plane** that integrates with, and eventually subsumes, the current software-spec model.

The resulting model has four levels:

1. **Declared architecture** (spec-as-source)
   - EA artifacts across business, information, systems, data, delivery layers
   - existing requirements, changes, decisions (migrated to EA kinds over time)
   - typed relationships forming a queryable graph
   - baseline, target, and transition plans

2. **Generated artifacts** (spec → implementation)
   - OpenAPI specs, K8s manifests, Terraform modules, JSON Schemas
   - generated via the generator plugin interface
   - drift between generated and actual is a first-class finding

3. **Observed reality** (resolver-collected)
   - code symbols, APIs, schemas, deployments, cloud assets, runtime telemetry
   - collected by resolver plugins from external systems
   - cached with configurable staleness windows

4. **Reconciliation** (drift + discovery)
   - drift detection compares level 1 and 2 against level 3
   - discovery works in reverse: level 3 → draft level 1 artifacts
   - findings are categorized by domain and severity

## NIST Layer Mapping

For implementation purposes, model the architecture in five layers plus a transition layer:

| NIST Layer | EA Domain | Primary Purpose | Phase |
|---|---|---|---|
| Information Systems Architecture | `systems` | Applications, services, APIs, events, integrations | Phase A |
| Data Delivery Systems | `delivery` | Runtime platforms, deployments, cloud resources, networks, identity boundaries | Phase A |
| Data Architecture | `data` | Logical/physical data models, stores, lineage, stewardship, quality | Phase B |
| Information Architecture | `information` | Business information concepts, exchanges, classifications, retention | Phase C |
| Business Architecture | `business` | Mission, capabilities, processes, ownership, policy intent | Phase D |
| (Cross-cutting) | `transitions` | Baseline/target states, transition plans, migration waves | Phase E |

Implementation order is bottom-up: systems → delivery → data → information → business → transitions. This matches the adoption model (DD-2).

Each layer supports:

- core artifact kinds (see [ea-unified-artifact-model.md](./ea-unified-artifact-model.md))
- typed relationships (see [ea-relationship-model.md](./ea-relationship-model.md))
- governance metadata (owners, tags, compliance, risk)
- drift anchors and resolver integration (see [ea-drift-resolvers-generators.md](./ea-drift-resolvers-generators.md))
- impact propagation across the relation graph

## Phase Plan Overview

Detailed implementation instructions are in [ea-implementation-guide.md](./ea-implementation-guide.md). This is the summary:

### Phase A: Systems + Delivery Core

- Unified artifact base shape with subsumption hooks for REQ/CHG/ADR
- 10 artifact kinds: `application`, `service`, `api-contract`, `event-contract`, `integration` (systems) + `platform`, `deployment`, `runtime-cluster`, `network-zone`, `identity-boundary` (delivery)
- 8 relation types: `realizes`, `uses`, `exposes`, `deployedTo`, `dependsOn`, `runsOn`, `boundedBy`, `authenticatedBy`
- Relation registry with virtual inverses
- EA loader, schema validation, config integration
- `ea init`, `ea create`, `ea validate`, `ea graph` CLI commands
- Namespaced ID scheme

### Phase B: Data Layer

- 7 data kinds: `logical-data-model`, `physical-schema`, `data-store`, `lineage`, `master-data-domain`, `data-quality-rule`, `data-product`
- Additional relation types: `stores`, `hostedOn`, `lineageFrom`
- Data-specific drift rules

### Phase C: Information Layer

- 6 information kinds: `information-concept`, `canonical-entity`, `information-exchange`, `classification`, `retention-policy`, `glossary-term`
- Additional relation types: `classifiedAs`, `implementedBy`, `exchangedVia`
- Information-specific drift rules

### Phase D: Business Layer

- 8 business kinds: `mission`, `capability`, `value-stream`, `process`, `org-unit`, `policy-objective`, `business-service`, `control`
- Additional relation types: `supports`, `performedBy`, `governedBy`
- Business-specific drift rules

### Phase E: Transitions, Evidence, Reporting

- 5 transition kinds: `baseline`, `target`, `transition-plan`, `migration-wave`, `exception`
- Evidence model extension (reuse existing pipeline)
- Transition ↔ change bridge
- Report generation (capability map, gap analysis, drift heatmap)

### Phase F: Drift Engine + Resolver Packs

- EA drift engine extension with all 5 domain categories
- Discovery workflow (`ea discover`)
- OpenAPI, Kubernetes, Terraform resolver packs
- Resolver caching and staleness

### Phase G: Generator Framework

- Generator plugin interface
- `ea generate` CLI command
- Initial generators: OpenAPI from `api-contract`, JSON Schema from `canonical-entity`

### Phase H: REQ/CHG/ADR Subsumption

- Migration tooling from current schemas to unified EA kinds
- Backward-compatible loaders
- Deprecation of separate REQ/CHG/ADR paths

## Success Criteria

The extension is minimally successful when all of the following are true:

- teams can model enterprise architecture across systems and delivery domains in JSON
- relationships are type-checked, queryable, and reportable with virtual inverses
- existing REQ/CHG/ADR artifacts can coexist with EA artifacts in the same project
- the unified artifact base shape is designed to accommodate future subsumption of REQ/CHG/ADR
- drift can be detected against at least APIs, schemas, and deployments
- `ea discover` can bootstrap draft artifacts from at least one external source
- the generator plugin interface is defined and at least one generator exists
- the model can be adopted incrementally starting from the systems layer in a brownfield monorepo

## Risks And Tradeoffs

### Model Complexity

Adding too many artifact kinds too early will make adoption harder. Phase A ships only 10 kinds (systems + delivery). Each subsequent phase adds one layer. Teams should get value from systems + delivery before expanding.

### False Positives

EA drift detection will be noisier than code drift unless resolver quality is high. Resolvers must support `null` or partial confidence paths. Findings carry source provenance and confidence indicators.

### Brownfield Incompleteness

Many organizations will not have complete inventories. The model tolerates partial truth through:

- `confidence: "declared" | "observed" | "inferred"` on artifacts and relations
- `status: "draft"` for discovered but unreviewed artifacts
- first-class `exception` artifacts to suppress expected gaps with expiry and approval

### Governance Overhead

The framework does not require all five layers before teams get value. The recommended adoption path is:

1. systems + delivery (immediate operational value)
2. data (lineage and schema governance)
3. information (canonical entity management)
4. business (capability mapping)
5. transitions (strategic planning)

### Subsumption Risk

Designing for REQ/CHG/ADR subsumption adds complexity to the artifact base shape. The mitigation is: design the unified base now, but implement subsumption as the final phase. Current artifacts continue to work unchanged until teams opt into migration.
