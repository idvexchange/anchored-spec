---
type: architecture
status: current
audience:
  - architect
  - maintainer
  - agent
domain:
  - systems
  - delivery
  - information
ea-entities:
  - component:default/anchored-spec-library
  - component:default/anchored-spec-cli
  - resource:default/descriptor-schema-pack
---

# Framework Internals

Anchored Spec has more internal complexity than the primary catalog topology shows. That is deliberate.

The catalog models the stable user-facing runtime surfaces as resources, components, APIs, a system, and a domain. The internal moving parts that make those surfaces useful are documented here as implementation areas and extension seams.

## Internal Areas

| Area | Primary code | Purpose | Surfaced through |
| --- | --- | --- | --- |
| Backstage descriptor model | `src/ea/backstage/` | Descriptor parsing, accessors, kind mapping, relation mapping, validation, writers | library, CLI |
| Local EA schema pack | `src/ea/schemas/`, `src/ea/schemas/backstage/` | Built-in contracts for custom EA kinds and local validation | library, CLI |
| Loading and config | `src/ea/config.ts`, `src/ea/loader.ts` | Resolve project config, load manifest or inline entities, normalize the entity graph | library, CLI |
| Linked docs and traceability | `src/ea/docs/`, `src/ea/source-scanner.ts`, `src/ea/trace-analysis.ts` | Parse doc frontmatter, scan source annotations, build entity-to-doc trace links | library, CLI |
| Discovery resolvers | `src/ea/resolvers/` | Observe external sources and propose draft entities or facts | library, CLI |
| Drift and fact extraction | `src/ea/drift.ts`, `src/ea/facts/`, `src/ea/reconcile.ts` | Compare declared architecture with observed or extracted facts | library, CLI |
| Generators | `src/ea/generators/` | Derive high-value artifacts from the authored model | library, CLI |
| Reporting and graph analysis | `src/ea/report.ts`, `src/ea/graph.ts`, `src/ea/impact.ts` | Build reviewer-facing graph, impact, and report views over one entity graph | library, CLI |
| Governance workflows | `src/ea/diff.ts`, `src/ea/compat.ts`, `src/ea/policy.ts`, `src/ea/version-policy.ts`, `src/ea/evidence.ts`, `src/ea/verify.ts` | Semantic review, compatibility, policy, evidence, and end-to-end verification | library, CLI |
| Extensibility hooks | `src/ea/plugins.ts`, `src/ea/evidence-adapters/` | Plugin checks and evidence ingestion adapters | library |

## Why These Are Not Top-Level Catalog Components

These areas are real, but they are not modeled as standalone production components in this repository because they are not independently shipped products.

They are implementation structure inside the same two runtime surfaces:

- `component:default/anchored-spec-library`
- `component:default/anchored-spec-cli`

That split keeps the catalog Backstage-aligned and user-meaningful while still allowing the docs to explain the framework honestly.

## Resolver Surface

Resolvers are the largest internal extension area.

Built-in resolver families include:

- OpenAPI
- Kubernetes
- Terraform
- SQL DDL
- dbt
- markdown
- anchors
- tree-sitter

Each resolver translates observed material into draft entities, relationships, or facts. They all converge on the same entity-first model rather than creating separate side models per source.

The important architectural point is not that there are many resolvers. It is that all resolvers plug into one discovery boundary and produce inputs that can be validated, traced, drift-checked, and reviewed through the same runtime.

## Generator Surface

Generators are intentionally narrower than resolvers.

Current built-in outputs are:

- OpenAPI
- JSON Schema

This is a constraint, not a gap. The framework is designed to author the model directly and derive only a few high-value artifacts from it. Generators are therefore a bounded extension seam rather than the center of the architecture.

## Reporting Surface

Reporting complexity comes from the number of views, not from a separate runtime.

Representative outputs include:

- graph renderings
- system-data and capability views
- drift heatmaps
- traceability indexes
- impact analysis
- status and search views
- context bundles for deep review

All of these read the same entity graph. The complexity lives in projection logic, not in a separate architectural component boundary.

## Governance Surface

Governance is another area where the framework is richer internally than the top-level catalog suggests.

The shipped governance stack includes:

- validation
- semantic diff
- compatibility assessment
- lifecycle transitions
- workflow policy evaluation
- evidence ingestion and summary
- reconcile and verify orchestration

These are modeled in the catalog as capabilities and decisions because they describe what the framework enables and why it is shaped that way. They are not promoted to standalone top-level runtime entities because they are not deployed independently.

## Extension Rule

When deciding whether a new internal area should become an explicit catalog entity, use this test:

- make it a catalog `Component`, `API`, or `Resource` if it is a stable shipped surface that users interact with directly
- keep it in docs if it is an internal implementation slice behind an existing shipped surface
- model it as a custom EA kind only when it expresses intent, policy, rationale, or business meaning that Backstage built-ins do not capture

That rule keeps the model simple without flattening away the real complexity of the framework.
