# Anchored Spec

[![CI](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/anchored-spec)](https://www.npmjs.com/package/anchored-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Backstage-aligned, spec-as-source architecture control plane for repositories that want a real architecture model in version control.

Anchored Spec turns a repository into a living architecture model. You author [Backstage-style entities](https://backstage.io/docs/features/software-catalog/descriptor-format/) in version control, link those entities to architecture documents and primary code locations, and then run validation, traceability, discovery, drift detection, reporting, and change-review workflows over the same model.

Its best operating shape is deliberately narrow:

- Anchored Spec owns architecture truth, queryability, and declared-vs-observed pressure.
- The CLI is the normal interface to that control plane for humans and agents.
- Repositories still own last-mile task execution, focused verification, and workflow ergonomics.
- `anchored-spec.dev/code-location` is the preferred code linkage for a component; richer file, symbol, and test evidence remains secondary.

This repository is the canonical manifest-mode example: a sparse root `catalog-info.yaml`, linked markdown under `docs/`, machine-readable repo collateral under `.anchored-spec/`, and thin repo-local wrappers under `scripts/`.

## Working On This Repo

This repository uses a thin repo-local harness on top of Anchored Spec itself:

```bash
pnpm task:start --changed
pnpm task:start <path...>
pnpm task:verify
pnpm task:check
```

Use `task:start` for fresh context in this repository, then follow the brief's `readFirst` and `lookupCommands` before broader file scanning. The harness is repo-local workflow glue; the framework still owns the architecture model and CLI primitives.

Reference layout for this repo:

- `catalog-info.yaml` keeps the top-level architecture model sparse and reviewable
- `.anchored-spec/config.json` and `.anchored-spec/policy.json` hold machine-readable framework and harness collateral
- `.anchored-spec/query-packs/` holds repo-local discovery enrichment
- `scripts/` holds repo-local task routing and verification helpers

## Why Anchored Spec Exists

Most architecture tooling falls apart for one of two reasons:

- the model is separate from the repo, so it drifts
- the docs are prose-only, so automation cannot trust them

Anchored Spec takes a different position:

- architecture should live next to code
- the source of truth should be typed and reviewable
- docs should explain the model, not replace it
- discovery and drift should pressure-test the model, not silently overwrite it
- AI agents should consume the same architecture graph as humans

## What You Can Do With It

- Author architecture as Backstage-aligned entities.
- Store that model in manifest mode or inline markdown frontmatter.
- Bootstrap a curated first-pass manifest from repository evidence with `catalog bootstrap`.
- Use the CLI as the default query surface over architecture truth for humans and agents.
- Use canonical entity refs such as `component:default/orders-service` across commands, docs, and review workflows.
- Validate schema, relations, ownership, lifecycle, and traceability.
- Discover draft entities from OpenAPI, Kubernetes, Terraform, SQL DDL, dbt, markdown, anchors, and tree-sitter.
- Detect drift between declared architecture and observed repository reality.
- Generate a narrow set of derived outputs, currently OpenAPI and JSON Schema.
- Build graphs, semantic diagrams, reports, impact analyses, constraint views, and AI context bundles.
- Compile impact into structured, suggestion-oriented command plans, with optional repository-evidence adapters rendering repo-local targets and commands without turning the framework into a full workflow orchestrator.
- Review changes semantically with compatibility and policy checks instead of relying on text diffs alone.

## Start Here

### Install

```bash
pnpm add -D anchored-spec
```

### Initialize a repository

```bash
npx anchored-spec init --mode manifest
```

If you want a neutral reference shape to edit rather than a blank manifest, add `--with-examples`. That scaffold stays sparse: one owner, one domain, one system, one component, one API, and linked docs.

### Create the first model slice

If the architecture is already clear, create entities directly:

```bash
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform-team
```

If the repository already has meaningful structure and docs, bootstrap a curated manifest first:

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --dry-run --explain
npx anchored-spec catalog bootstrap --write catalog-info.yaml
```

If you are not sure which descriptor shape to use, inspect the supported options first:

```bash
npx anchored-spec create --list
```

### Validate and inspect the model

```bash
npx anchored-spec validate
npx anchored-spec trace --summary
npx anchored-spec graph --format mermaid --focus component:default/orders-service --depth 1
```

### Run the wider architecture loop

```bash
npx anchored-spec drift
npx anchored-spec diff --base main --compat --policy
npx anchored-spec report --view traceability-index
npx anchored-spec context component:default/orders-service --tier llm
npx anchored-spec impact component:default/orders-service --with-commands --format markdown
```

Treat the command suggestions from `impact --with-commands` as a thin handoff into repository-native scripts, not as the final owner of your command plan.

The JSON payload now separates:

- `architectureImpact` for declared entity blast radius
- `repositoryImpact` for adapter-derived repo-local targets
- `suggestions` for intent-first actions before repository-specific command handling

Compatibility fields such as `commands`, `broaderCommands`, and `actionCommands` still exist for repository wrappers that have not migrated yet.

## The Core Model

Anchored Spec uses the Backstage entity envelope:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: orders-service
  title: Orders Service
  description: Handles order placement and orchestration.
  annotations:
    anchored-spec.dev/source: docs/04-component/orders-service.md
    anchored-spec.dev/code-location: src/orders/
spec:
  type: service
  lifecycle: production
  owner: group:default/platform-team
  system: commerce-platform
  providesApis:
    - api:default/orders-api
  dependsOn:
    - resource:default/orders-db
```

Prefer [Backstage built-in kinds](https://backstage.io/docs/features/software-catalog/system-model) when they fit:

- `Component`
- `API`
- `Resource`
- `Group`
- `System`
- `Domain`

Use Anchored Spec custom kinds only when the concept is genuinely architectural and not already covered well by Backstage:

- `Requirement`
- `Decision`
- `CanonicalEntity`
- `Exchange`
- `Capability`
- `ValueStream`
- `Mission`
- `Technology`
- `SystemInterface`
- `Control`
- `TransitionPlan`
- `Exception`

## Storage Modes

### Manifest mode

Entities live in one or more YAML catalog files, usually centered on `catalog-info.yaml`.

```bash
npx anchored-spec init --mode manifest --with-examples
```

### Inline mode

Entities live in markdown frontmatter, usually inside `docs/`.

```bash
npx anchored-spec init --mode inline --with-examples
```

Manifest mode is the clearest operating shape for most multi-concern repositories. Inline mode remains useful when the docs themselves are already the primary authoring surface.

## Operating Boundary

Anchored Spec should usually be:

- sparse
- architecture-first
- local-first
- reviewable
- queryable by humans and agents

Anchored Spec should usually not be:

- the full repo harness
- the full verification orchestrator
- a mandatory discovery-first system
- a codebase-wide dependency graph product
- the owner of every repository-specific workflow decision

## Command Surface

| Command        | Use it for                                                                            |
| -------------- | ------------------------------------------------------------------------------------- |
| `init`         | Scaffold config, storage mode, optional examples, AI files, IDE files, and CI recipes |
| `create`       | Create a new entity in the repository's configured storage mode                       |
| `create-doc`   | Create linked architecture or guide documents with frontmatter and trace links        |
| `catalog`      | Bootstrap, plan, apply, and explain a curated catalog synthesized from repo evidence  |
| `link`         | Add a relation between two entities                                                   |
| `validate`     | Validate entities, relations, and quality rules                                       |
| `verify`       | Run broader project verification checks                                               |
| `trace`        | Inspect entity-to-doc traceability                                                    |
| `link-docs`    | Sync doc links and entity trace refs                                                  |
| `discover`     | Discover draft entities or facts from supported source types                          |
| `drift`        | Compare the declared model to observed reality                                        |
| `generate`     | Run built-in generators                                                               |
| `graph`        | Export raw relation graphs                                                            |
| `diagrams`     | Render semantic diagram projections                                                   |
| `report`       | Produce reviewer-facing report views                                                  |
| `impact`       | Analyze downstream impact                                                             |
| `constraints`  | Extract governing decisions and requirements                                          |
| `status`       | Summarize lifecycle, ownership, and confidence                                        |
| `transition`   | Advance lifecycle state with gates                                                    |
| `diff`         | Review semantic changes and compatibility                                             |
| `evidence`     | Ingest, validate, and summarize evidence                                              |
| `reconcile`    | Run a composed maintenance loop                                                       |
| `search`       | Search entities by ref, kind, domain, status, tags, and text                          |
| `batch-update` | Bulk-update entity status or confidence                                               |

## Project Layout

```text
.
├── .anchored-spec/
│   └── config.json
├── catalog-info.yaml
├── docs/
│   ├── start/
│   ├── workflows/
│   ├── maintainers/
│   ├── archive/
│   ├── 01-business/
│   ├── 02-system-context/
│   ├── 03-container/
│   ├── 04-component/
│   ├── 05-domain/
│   ├── 06-api/
│   ├── 07-data/
│   ├── 08-security/
│   ├── 09-infrastructure/
│   ├── 10-testing/
│   ├── README.md
│   └── glossary.md
├── src/
│   ├── cli/
│   ├── ea/
│   ├── resolvers/
│   └── test-helpers/
└── package.json
```

In this repository, `docs/` is an architecture-first documentation set organized into `start/`, `workflows/`, `maintainers/`, `archive/`, and the numbered architecture reference views. The implementation lives primarily under `src/cli/` and `src/ea/`, with supporting resolver helpers under `src/resolvers/`.

## Documentation

Start with the docs portal:

- [Documentation portal](docs/README.md)
- [Adoption overview](docs/start/adoption-overview.md)
- [Choose your path](docs/start/choose-your-path.md)
- [Business architecture](docs/01-business/business-architecture.md)
- [System context](docs/02-system-context/system-context.md)
- [Domain model](docs/05-domain/domain-model.md)
- [Model the repo](docs/workflows/model-the-repo.md)
- [Review and analysis](docs/workflows/review-and-analysis.md)
- [Repository harness](docs/workflows/repository-harness.md)
- [Maintainer architecture](docs/maintainers/architecture.md)

## AI Agent Workflow

Anchored Spec ships a single canonical agent workflow guide:

- [Agent guide](docs/workflows/agent-guide.md)

Useful prompts:

```text
Add a new API and the component that provides it. Keep the model and docs in sync.

Audit this repo's architecture coverage and identify the missing entities.

Run a semantic diff against main and explain any breaking changes.

Trace every document and source path connected to component:default/orders-service.
```

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run verify
```

See [maintainer contributing guide](docs/maintainers/contributing.md) for repository workflow and documentation standards.

## License

[MIT](LICENSE)
