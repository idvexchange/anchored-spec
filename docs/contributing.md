---
type: guide
status: current
audience:
  - maintainer
  - contributor
domain:
  - delivery
ea-entities:
  - group:default/platform-maintainers
  - system:default/anchored-spec-framework
  - api:default/cli-command-surface
  - api:default/node-library-api
---

# Contributing

This repository builds Anchored Spec itself, so documentation, catalog updates, and code changes should move together.

## Development Commands

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run verify
```

## Repository Layout

- `src/cli/` contains the shipped CLI surface
- `src/ea/` contains the architecture runtime, analysis, drift, reporting, and generation logic
- `src/ea/backstage/` contains the entity model, accessors, mappings, writers, and validation
- `src/ea/resolvers/` contains discovery and observation integrations
- `src/ea/docs/` and `src/ea/facts/` contain markdown parsing, traceability, and fact extraction
- `catalog-info.yaml` is the canonical architecture model for this repo
- `docs/` contains linked markdown documentation organized by primary EA domain
- `docs/README.md` is the portal for navigating domain documentation

## Contribution Expectations

- keep CLI docs aligned with the shipped command surface
- update `catalog-info.yaml` and linked docs when architecture changes
- preserve canonical entity refs in docs and tests when identifiers matter
- avoid documenting unsupported features or stale migration states
- add or update tests when behavior changes

## Documentation Standard

This repo is the gold-standard manifest-mode example. Changes to docs should preserve:

- one catalog file at repo root
- one authoritative file location per document under `docs/`
- primary placement by domain folder, with cross-domain membership in frontmatter
- traceability between docs and entities
