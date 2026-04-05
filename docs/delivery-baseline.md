# Delivery Baseline

This document captures the runtime constants, shipped scope, and delivery exit criteria for the current Anchored Spec framework.

## Runtime Baseline

### Language and packaging

- Node.js `>=18` from `package.json`
- TypeScript source compiled with `tsup`
- ESM-first package with CJS compatibility exports
- published CLI entrypoint at `dist/cli/index.js`
- published library entrypoint at `dist/index.js` and `dist/index.cjs`

### Repository tooling

- package manager: `pnpm`
- unit and integration test runner: `vitest`
- linting: `eslint`
- formatting: `prettier`
- type-checking: `tsc --noEmit`

### Architecture runtime constants

- supported EA domains from `src/ea/types.ts`: `systems`, `delivery`, `data`, `information`, `business`, `transitions`
- entity statuses from `src/ea/types.ts`: `draft`, `planned`, `active`, `shipped`, `deprecated`, `retired`, `deferred`
- confidence levels from `src/ea/types.ts`: `declared`, `observed`, `inferred`
- cache directory from `src/ea/cache.ts`: `.anchored-spec/cache/ea`
- default cache TTL from `src/ea/cache.ts`: `3600` seconds

### Public runtime surfaces

- CLI surface in `src/cli/`
- Node API surface in `src/index.ts` and `src/ea/index.ts`
- schema pack in `src/ea/schemas/` and `src/ea/schemas/backstage/`

### Shipped discovery sources

Implemented under `src/ea/resolvers/`:

- OpenAPI
- Kubernetes
- Terraform
- SQL DDL
- dbt
- markdown
- anchors
- tree-sitter

### Shipped generators

Implemented under `src/ea/generators/`:

- OpenAPI
- JSON Schema

### Shipped report views

Defined in `src/ea/report.ts`:

- `system-data-matrix`
- `classification-coverage`
- `capability-map`
- `gap-analysis`
- `exceptions`
- `drift-heatmap`
- `traceability-index`

## Delivery Exit Criteria

A delivery slice using Anchored Spec should be considered complete only when all of these are true:

1. the intended architecture is represented in the entity model
2. the chosen authoring mode is explicit and stable
3. the minimum validation loop is runnable
4. the repository owners understand which commands are part of their normal workflow
5. documentation explains the architecture without competing with the source of truth

For this framework repository specifically, the minimum engineering bar is:

- `pnpm run build`
- `pnpm run test`
- `pnpm run check-types`
- `pnpm run lint`

The GitHub Actions workflow in `.github/workflows/ci.yml` is the source of truth for CI enforcement.
