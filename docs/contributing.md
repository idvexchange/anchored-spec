# Contributing

This repository builds and tests anchored-spec itself.

## Development commands

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run verify
```

## What lives where

- `src/cli/` — CLI command definitions and UX
- `src/ea/` — model loading, analysis, drift, reports, evidence, reconcile, and generators
- `src/ea/backstage/` — entity parsing, writing, kind mapping, validation helpers, and accessors
- `src/ea/facts/` — markdown fact extraction and consistency analysis
- `src/ea/resolvers/` — discovery and observation sources
- `src/ea/generators/` — built-in generators
- `docs/` — user-facing framework documentation
- `examples/` — supported authoring examples and regression-oriented example datasets

## Contribution expectations

- Prefer Backstage-aligned entity-native language in code, tests, and docs.
- Do not reintroduce removed artifact-era commands or compatibility shims.
- Keep CLI docs aligned with the actual shipped command surface.
- Add or update tests when behavior changes.
- Update examples and docs when command behavior or the model contract changes.

## Documentation style

When editing documentation in this repo:

- describe the current shipped framework, not transitional migration states
- use canonical entity refs in examples when identifiers matter
- avoid claiming support for features the CLI does not ship
- preserve a clean distinction between supported examples and historical regression fixtures

## Pull request checklist

Before opening a PR, aim to complete the following:

1. `pnpm run build`
2. `pnpm run test`
3. `pnpm run lint`
4. update relevant docs and examples
5. explain any behavior changes, especially around diff, drift, reconcile, or entity writing
