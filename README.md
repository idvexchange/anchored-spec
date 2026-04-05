# Anchored Spec

[![CI](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/anchored-spec)](https://www.npmjs.com/package/anchored-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Backstage-aligned, spec-as-source architecture for repositories that want entities, relations, drift detection, and traceability in version control.

Anchored Spec turns a repository into a living architecture model. You author Backstage-style entities in either `catalog-info.yaml` or Markdown frontmatter, then use the CLI to validate them, visualize raw relation graphs and semantic diagrams, discover missing model coverage, detect drift against code and infrastructure, reconcile docs, and assemble context for humans and AI agents.

This repository is the canonical manifest-mode example: a root `catalog-info.yaml` and linked markdown documentation organized by primary EA domain under `docs/`.

## What it does

- Author architecture as **Backstage-aligned entities**.
- Support both **manifest** and **inline Markdown** storage modes.
- Use **canonical entity refs** such as `component:default/orders-api` everywhere in runtime workflows.
- Validate schema, ownership, lifecycle, relations, and traceability.
- Discover draft entities from OpenAPI, Kubernetes, Terraform, SQL DDL, dbt, Tree-sitter, anchors, and Markdown.
- Detect architectural drift across systems, data, information, business, transitions, docs, and exceptions.
- Generate OpenAPI and JSON Schema outputs from authored entities.
- Link documentation and entities with bidirectional trace references.
- Produce reports, graph exports, compatibility diffs, and full reconcile runs.

## Authoring model

Anchored Spec uses the Backstage entity envelope:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: orders-service
  title: Orders Service
  description: Handles order placement and orchestration.
  annotations:
    anchored-spec.dev/confidence: declared
    anchored-spec.dev/source: src/orders/
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

Use Backstage built-in kinds where they fit:

- `Component`
- `API`
- `Resource`
- `Group`
- `System`
- `Domain`

Use anchored-spec custom kinds when you need architecture concepts that Backstage does not model directly:

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

## Storage modes

### Manifest mode

Store entities in a multi-document `catalog-info.yaml` file.

```bash
npx anchored-spec init --mode manifest --with-examples
```

### Inline mode

Store entities as YAML frontmatter inside Markdown files.

```bash
npx anchored-spec init --mode inline --with-examples
```

## Quick start

```bash
pnpm add -D anchored-spec
npx anchored-spec init --mode manifest
npx anchored-spec create application --title "Orders Service"
npx anchored-spec validate
npx anchored-spec graph --format mermaid
npx anchored-spec diagrams render backstage --focus system:default/commerce-platform --depth 1
npx anchored-spec drift
npx anchored-spec report --view traceability-index
npx anchored-spec context component:default/orders-service
```

## CLI commands

| Command        | Purpose                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `init`         | Scaffold config, storage mode, examples, AI files, IDE files, and CI helpers |
| `create`       | Create a new entity in the project storage mode                              |
| `validate`     | Validate entities, relations, and quality rules                              |
| `verify`       | Run broader project verification checks                                      |
| `graph`        | Export architecture graphs in Mermaid, DOT, or JSON                          |
| `diagrams`     | Render semantic diagram views such as Backstage system views                 |
| `report`       | Generate report views or a full report set                                   |
| `discover`     | Discover draft entities from configured or explicit resolvers                |
| `drift`        | Compare authored architecture to observed reality                            |
| `generate`     | Run OpenAPI and JSON Schema generators                                       |
| `evidence`     | Ingest, validate, and summarize evidence records                             |
| `impact`       | Calculate downstream impact for an entity                                    |
| `status`       | Summarize lifecycle, domain, and confidence status                           |
| `transition`   | Advance lifecycle state with policy gates                                    |
| `diff`         | Compare git revisions with semantic compatibility checks                     |
| `reconcile`    | Run generate, validate, drift, trace, and docs checks together               |
| `trace`        | Show traceability between entities and docs                                  |
| `link-docs`    | Sync doc frontmatter refs and entity trace refs                              |
| `context`      | Build context bundles for AI or human review                                 |
| `create-doc`   | Create pre-linked architecture documentation                                 |
| `link`         | Add a relation between two entities                                          |
| `search`       | Search entities by ref, kind, domain, status, tags, and text                 |
| `batch-update` | Bulk-update entity `status` or `confidence`                                  |

## Project layout

```text
.
├── .anchored-spec/
│   └── config.json
├── catalog-info.yaml
├── docs/
│   ├── business/
│   ├── data/
│   ├── delivery/*.md
│   ├── information/*.md
│   ├── systems/*.md
│   └── transitions/*.md
└── package.json
```

A project usually uses either manifest mode or inline mode as its primary authoring style. In this repo, manifest-mode documentation lives under `docs/` and is grouped by the primary EA domain while frontmatter carries cross-domain membership.

## Documentation map

Start here:

- [Documentation portal](docs/README.md)
- [LLM guide](llms.txt)
- [Architecture overview](docs/systems/overview.md)
- [Entity model](docs/systems/entity-model.md)
- [Docs and traceability](docs/information/docs-and-traceability.md)
- [Getting started](docs/delivery/getting-started.md)
- [Testing and CI](docs/delivery/testing-and-ci.md)

## AI agent workflow

Anchored Spec ships with [SKILL.md](SKILL.md), an agent-facing operating guide for repositories that use this framework.

Useful prompts:

```text
Add a new API and the component that provides it. Keep the model and docs in sync.

Audit this repo's architecture coverage and tell me what entities are missing.

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

See [docs/contributing.md](docs/contributing.md) for repository development guidance.

## License

[MIT](LICENSE)
