# EA Glossary & NIST Mapping

This document maps NIST Enterprise Architecture Framework and TOGAF terminology to anchored-spec concepts, and provides a comprehensive glossary of EA terms used throughout the design documents.

Read [ea-design-overview.md](./ea-design-overview.md) for context.

---

## 1. NIST EA Framework → Anchored-Spec Mapping

The [NIST Enterprise Architecture Model](https://www.nist.gov/publications/nist-enterprise-architecture-model) defines five architecture layers. Anchored-spec maps each layer to a domain with concrete artifact kinds:

| NIST Layer | NIST Description | Anchored-Spec Domain | Artifact Kinds |
|---|---|---|---|
| **Business Architecture** | Defines the business strategy, governance, organization, and key business processes | `business` (8 kinds) | mission, capability, value-stream, process, org-unit, policy-objective, business-service, control |
| **Information Architecture** | Describes the structure of an organization's logical and physical information assets and information management resources | `information` (6 kinds) | information-concept, canonical-entity, information-exchange, classification, retention-policy, glossary-term |
| **Data Architecture** | Describes the structure of an organization's logical and physical data assets and data management resources | `data` (7 kinds) | logical-data-model, physical-schema, data-store, lineage, master-data-domain, data-quality-rule, data-product |
| **Application Architecture** | Provides a blueprint for individual applications, their interactions, and their relationships to the core business processes | `systems` (7 kinds) | application, service, api-contract, event-contract, integration, system-interface, consumer |
| **Technology Architecture** | Describes the infrastructure needed to support the deployment of core applications | `delivery` (8 kinds) | platform, deployment, runtime-cluster, network-zone, identity-boundary, cloud-resource, environment, technology-standard |

### Additional Anchored-Spec Domains (Beyond NIST)

| Domain | Purpose | Artifact Kinds |
|---|---|---|
| `transitions` (5 kinds) | Strategic change management | baseline, target, transition-plan, migration-wave, exception |
| `legacy` (3 kinds) | Legacy artifact types carried forward | requirement, change, decision |

---

## 2. TOGAF → Anchored-Spec Mapping

For teams familiar with [TOGAF](https://www.opengroup.org/togaf) (The Open Group Architecture Framework):

| TOGAF Concept | Anchored-Spec Equivalent | Notes |
|---|---|---|
| Architecture Building Block (ABB) | EA artifact (any kind) | An artifact is the fundamental building block |
| Solution Building Block (SBB) | EA artifact with anchors | An artifact anchored to real code/config is a solution block |
| Architecture Repository | `ea/` directory tree | All EA artifacts stored as YAML files |
| Architecture Landscape | `ea graph --federated` | The full graph of all artifacts and relations |
| Architecture Vision | `target` artifact | Describes the desired future state |
| Baseline Architecture | `baseline` artifact | Captures current state |
| Target Architecture | `target` artifact | Describes desired future state |
| Gap Analysis | `ea report --type gap-analysis` | Compares baseline to target |
| Transition Architecture | `transition-plan` + `migration-wave` | Phased plan to move from baseline to target |
| Architecture Principle | `technology-standard` or `business-rule` | Governing constraints |
| Stakeholder | `metadata.owners` | Every artifact has owners |
| Architecture Governance | `ea validate` + `ea drift` + CI | Automated governance via validation and drift detection |
| Architecture Compliance | Drift report | Drift findings = compliance violations |
| Architecture Contract | `api-contract` | Interface agreements between systems |
| Information System Architecture | `systems` + `data` domains | Applications and their data stores |
| Technology Architecture | `delivery` domain | Infrastructure and deployment |
| Business Architecture | `business` domain | Capabilities, processes, services |
| Architecture Content Framework | EA unified artifact model | The base shape + kind taxonomy |
| Architecture Metamodel | JSON Schema + relation registry | Schema definitions + validation rules |

---

## 3. Glossary

### A

**Anchor**
A binding between an EA artifact and a specific code location (file, symbol, route, schema, config path). Anchors enable drift detection by mapping declared architecture to observable reality. Equivalent to `semanticRefs` in REQ artifacts.

**API Version**
The schema version of the EA artifact format (e.g., `anchored-spec/ea/v1`). Determines which fields are valid and how the artifact is validated.

**Artifact**
The fundamental unit of the EA model. A YAML file describing one architectural element (application, service, database, process, etc.). Every artifact has the unified base shape: `apiVersion`, `kind`, `id`, `metadata`, optional `anchors`, optional `relations`.

**Artifact Base Shape**
The common structure shared by all EA artifacts regardless of kind. Defined in [ea-unified-artifact-model.md](./ea-unified-artifact-model.md).

### B

**Baseline**
A snapshot of the current architecture at a point in time. References a set of artifact IDs that together describe "what we have now." Used as the starting point for gap analysis.

**Bottom-Up Adoption**
The recommended adoption strategy (DD-2). Start by modeling existing systems (services, APIs, databases) and work upward toward business capabilities. Contrasted with top-down (start from strategy) or meet-in-the-middle.

### C

**Canonical Direction**
The primary direction for a relation type. Only canonical directions are stored in artifact YAML. For example, `dependsOn` is canonical; `dependedOnBy` is the virtual inverse. See [ea-relationship-model.md](./ea-relationship-model.md).

**Codemod**
An automated script that transforms EA artifacts from one schema version to another. Used during breaking schema migrations. See [ea-schema-evolution.md](./ea-schema-evolution.md).

**Confidence**
A field on every artifact indicating how the artifact's information was established:
- `declared` — Human-authored and reviewed (highest trust)
- `observed` — Captured from a resolver reading real infrastructure (medium trust)
- `inferred` — Discovered by heuristic (lowest trust, considered a draft)

**Consumer**
An EA artifact kind (`CON-` prefix) representing an external consumer of a system interface or API contract.

### D

**Declared State**
The architecture as described in EA artifacts. The "should be" state. Contrasted with observed state ("what actually is").

**Discovery**
The process of automatically creating EA artifact drafts from existing infrastructure. Resolvers examine real systems (OpenAPI specs, K8s clusters, Terraform state) and produce artifacts with `confidence: "inferred"` or `"observed"`. Run via `ea discover`.

**Domain**
A grouping of related artifact kinds. The seven domains are: `systems`, `delivery`, `data`, `information`, `business`, `transitions`, `legacy`.

**Drift**
A divergence between declared state (EA artifacts) and observed state (reality). Detected by `ea drift`. Examples: a declared API endpoint no longer exists, a deployed replica count doesn't match the declared count.

**Drift Finding**
A single instance of detected drift. Has a rule ID, severity, affected artifact, message, and optional suggested fix.

### E

**Evidence**
Recorded proof that an artifact's claims are true. Extends the existing anchored-spec evidence pipeline. Evidence records link to test runs, monitoring data, or manual attestations.

**Exception**
An EA artifact kind that suppresses specific drift findings for a defined scope and time period. Used when drift is known and accepted temporarily. Has expiry dates and review schedules.

### F

**Federation**
The ability to reference and assemble EA artifacts across multiple repositories. See [ea-multi-repo-federation.md](./ea-multi-repo-federation.md).

### G

**Generator**
A plugin that produces derived files (OpenAPI specs, JSON Schema, K8s manifests, etc.) from EA artifacts. Implements the `EaGenerator` interface. Generated files are outputs, not sources.

**Graph**
The directed graph of all EA artifacts (nodes) and relations (edges). Built by the graph builder from stored canonical relations plus computed virtual inverses.

**Graph Builder**
The component that assembles the relation graph from all loaded artifacts. Adds virtual inverse edges, validates relations, and provides query APIs.

### H

**Health Score**
A 0-100 composite score measuring the overall health of the EA model across six dimensions: coverage, completeness, connectivity, drift health, freshness, adoption. Available through `ea report` and `ea validate`.

### I

**ID Prefix**
A short code assigned to each kind that starts every artifact ID. Examples: `APP-` (application), `SVC-` (service), `STORE-` (data-store). Ensures IDs are globally unique and self-documenting.

**ID Scheme**
The format for artifact identifiers: `{KIND_PREFIX}-{kebab-slug}`. Optionally scoped by domain path: `{domain}/{KIND_PREFIX}-{kebab-slug}`.

### K

**Kind**
The type of architectural element an artifact represents. Examples: `application`, `service`, `api-contract`, `data-store`, `business-capability`. Each kind belongs to one domain and has a unique ID prefix.

**Kind Taxonomy**
The complete registry of all 44 artifact kinds organized by domain. Defined in [ea-unified-artifact-model.md](./ea-unified-artifact-model.md).

### M

**Migration Wave**
A time-boxed batch of changes within a transition plan. Groups related artifact modifications that should happen together.

### O

**Observed State**
The architecture as it actually exists in running systems. Captured by resolvers reading real infrastructure. Contrasted with declared state.

**Orphan**
An artifact with zero relations (no incoming or outgoing edges in the graph). May indicate an incomplete model.

### R

**Relation**
A typed, directional link between two artifacts. Stored as `{ type, target }` in the source artifact's `relations` array. Only canonical directions are stored; inverses are computed.

**Relation Registry**
The configuration defining all valid relation types, their inverses, allowed source/target kinds, cycle policies, and drift strategies.

**Resolver**
A plugin that examines real infrastructure to validate anchors and detect drift. Implements the `EaResolver` interface. Examples: OpenAPI resolver (reads spec files), Kubernetes resolver (reads cluster state), Terraform resolver (reads state files).

**Resolver Chain**
The ordered list of resolvers configured for a project. When resolving an anchor, the first resolver to return a result wins.

### S

**Schema Version**
A per-artifact version string (`schemaVersion` in metadata) tracking the artifact's own content evolution. Team-managed, informational only. Distinct from `apiVersion`.

**Spec-as-Source**
The architectural principle (DD-1) that EA artifacts are the generative authority for architecture. Where possible, generators produce derived files FROM artifacts. Where generation is not possible, artifacts are the authoritative reference against which reality is validated.

**Subsumption**
The planned process of absorbing REQ/CHG/ADR artifact types into the EA model. REQ → business-rule or api-contract, CHG → transition-plan, ADR → technology-standard. Designed now, implemented in Phase H.

### T

**Target**
An EA artifact describing the desired future architecture. References a baseline and specifies what artifacts will be added, modified, or removed.

**Transition Plan**
An EA artifact defining a phased strategy to move from a baseline to a target. Contains migration waves with timelines, artifact changes, and risk assessments.

### V

**Virtual Inverse**
A computed relation edge that represents the reverse direction of a stored canonical relation. For example, if artifact A has `dependsOn: B`, the graph builder creates a virtual `dependedOnBy: A` edge on B. Virtual inverses have `isVirtual: true` and are not stored in YAML.

---

## 4. Abbreviation Reference

| Abbreviation | Meaning |
|---|---|
| ADR | Architecture Decision Record |
| API | Application Programming Interface |
| BPMN | Business Process Model and Notation |
| CHG | Change Record |
| CI/CD | Continuous Integration / Continuous Delivery |
| DD | Design Decision (DD-1 through DD-10) |
| EA | Enterprise Architecture |
| ETL | Extract, Transform, Load |
| HPA | Horizontal Pod Autoscaler |
| KPI | Key Performance Indicator |
| NIST | National Institute of Standards and Technology |
| REQ | Requirement |
| SDD | Spec-Driven Development |
| SLA | Service Level Agreement |
| TOGAF | The Open Group Architecture Framework |
