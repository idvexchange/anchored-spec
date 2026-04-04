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
  - resource:default/documentation-set
  - resource:default/descriptor-schema-pack
  - component:default/anchored-spec-library
  - component:default/anchored-spec-cli
  - api:default/anchored-spec-node-api
  - api:default/anchored-spec-cli-api
  - domain:default/anchored-spec
  - system:default/anchored-spec-framework
---

# Architecture Overview

Anchored Spec is a repository-native enterprise architecture framework. It uses Backstage-aligned entities as the authored contract, keeps those entities in version control, and layers validation, traceability, discovery, drift detection, reporting, and workflow governance on top of that contract.

## System Intent

The framework is optimized for teams that want architecture to live in the same pull request as code. The core promises are:

- one canonical entity model for both humans and automation
- one command surface for authoring, review, and quality checks
- one traceability path across catalog entities, markdown documents, and source paths
- no server requirement for the core workflow

## Primary Catalog Model

The repo is modeled bottom up from the shipped Backstage primitives:

| Kind | Entity | Responsibility | Primary implementation |
| --- | --- | --- | --- |
| `Resource` | `documentation-set` | Linked markdown architecture and operating guidance | `docs/` |
| `Resource` | `descriptor-schema-pack` | Built-in Backstage and custom EA schema contracts | `src/ea/schemas/`, `src/ea/schemas/backstage/` |
| `Component` | `anchored-spec-library` | Published Node.js runtime for loading, validating, discovering, tracing, drifting, reporting, and generating | `src/index.ts`, `src/ea/index.ts`, `src/ea/` |
| `Component` | `anchored-spec-cli` | Shipped command-line entrypoint over the same entity runtime | `src/cli/` |
| `API` | `anchored-spec-node-api` | Programmatic package export contract | `src/index.ts`, `src/ea/index.ts` |
| `API` | `anchored-spec-cli-api` | Public `anchored-spec` command surface | `src/cli/` |
| `System` | `anchored-spec-framework` | Groups the shipped resources, components, and APIs into one model | `catalog-info.yaml` |
| `Domain` | `anchored-spec` | Places the system in its broader repository-native EA context | `docs/systems/` |

## Implementation Areas

The source tree still has clear internal module areas, but they are implementation slices rather than first-class catalog components:

- `src/ea/backstage/` for descriptor, relation, accessor, and validation logic
- `src/ea/docs/`, `src/ea/source-scanner.ts`, and `src/ea/trace-analysis.ts` for linked-doc traceability
- `src/ea/resolvers/` for discovery integrations
- `src/ea/drift.ts`, `src/ea/reconcile.ts`, and `src/ea/facts/` for drift and consistency
- `src/ea/generators/` for derived output generation
- `src/ea/report.ts`, `src/ea/graph.ts`, and `src/ea/impact.ts` for analysis and reporting
- `src/ea/policy.ts`, `src/ea/diff.ts`, `src/ea/version-policy.ts`, and `src/ea/evidence.ts` for governance workflows

The dedicated internals view in `docs/systems/framework-internals.md` expands these areas into extension surfaces and explains why they remain documentation-level structure rather than top-level catalog entities.

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
