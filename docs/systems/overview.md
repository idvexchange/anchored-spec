---
type: architecture
status: current
audience:
  - architect
  - developer
  - agent
domain:
  - systems
  - delivery
ea-entities:
  - domain:default/anchored-spec
  - system:default/anchored-spec-framework
  - component:default/cli-surface
  - component:default/entity-loading-and-modeling
  - component:default/backstage-entity-mapping
  - component:default/docs-and-traceability
  - component:default/discovery-and-resolvers
  - component:default/drift-and-reconcile
  - component:default/generator-pipeline
  - component:default/governance-and-workflow
  - component:default/reporting-and-analysis
---

# Architecture Overview

Anchored Spec is a repository-native enterprise architecture framework. It uses Backstage-aligned entities as the authored contract, keeps those entities in version control, and layers validation, traceability, discovery, drift detection, reporting, and workflow governance on top of that contract.

## System Intent

The framework is optimized for teams that want architecture to live in the same pull request as code. The core promises are:

- one canonical entity model for both humans and automation
- one command surface for authoring, review, and quality checks
- one traceability path across catalog entities, markdown documents, and source paths
- no server requirement for the core workflow

## Subsystem Map

The repo is modeled around nine production components:

| Component | Responsibility | Primary code |
| --- | --- | --- |
| `cli-surface` | Top-level command UX, scaffolding, and entrypoints | `src/cli/` |
| `entity-loading-and-modeling` | Config resolution, project root loading, and graph normalization | `src/ea/config.ts`, `src/ea/loader.ts`, `src/ea/index.ts` |
| `backstage-entity-mapping` | Entity envelope, kind mapping, relation mapping, accessors, and validation | `src/ea/backstage/` |
| `docs-and-traceability` | Frontmatter parsing, doc scanning, trace linking, and context assembly inputs | `src/ea/docs/`, `src/ea/trace-analysis.ts` |
| `discovery-and-resolvers` | OpenAPI, Kubernetes, Terraform, SQL, dbt, markdown, anchor, and tree-sitter discovery | `src/ea/resolvers/` |
| `drift-and-reconcile` | Drift rules, consistency checks, and end-to-end reconcile orchestration | `src/ea/drift.ts`, `src/ea/reconcile.ts` |
| `generator-pipeline` | Derived outputs such as OpenAPI and JSON Schema | `src/ea/generators/` |
| `governance-and-workflow` | Policy, compatibility, diff, transition, evidence, and verification | `src/ea/policy.ts`, `src/ea/diff.ts`, `src/ea/version-policy.ts`, `src/ea/evidence.ts` |
| `reporting-and-analysis` | Graph export, report views, status, impact, search, and summaries | `src/ea/graph.ts`, `src/ea/report.ts`, `src/ea/impact.ts` |

## Repository Shape

Manifest mode is the normative layout for this repo:

```text
.
├── .anchored-spec/config.json
├── catalog-info.yaml
├── docs/
│   ├── delivery/
│   ├── information/
│   ├── systems/
│   └── transitions/
├── src/
│   ├── cli/
│   └── ea/
└── docs/generated/
```

`catalog-info.yaml` is the machine-readable architecture source. The markdown documents explain how that model works, why decisions were made, and how maintainers should evolve it. Each document lives in one authoritative domain folder, while frontmatter records any secondary domains it also belongs to.

## Normal Workflow

The intended operating loop is:

1. Update `catalog-info.yaml` and any affected architecture or guide docs in the same change.
2. Run `anchored-spec validate` to catch schema, relation, and quality issues.
3. Run `anchored-spec trace` to verify that docs and entities still line up.
4. Use `anchored-spec drift`, `anchored-spec diff`, `anchored-spec report`, or `anchored-spec reconcile` as the change requires.

The rest of the architecture set expands each subsystem and workflow in more detail.
