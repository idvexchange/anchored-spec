# Contributing to Anchored Spec

Thanks for contributing.

This repository develops the anchored-spec CLI and framework itself. The project is now fully aligned around Backstage-style entities, manifest or inline authoring, canonical entity refs, and current EA workflows such as drift, diff, trace, and reconcile.

## Local setup

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run verify
```

## Repository map

- `src/cli/` — command definitions and terminal UX
- `src/ea/` — analysis engine, diff, drift, reporting, reconcile, evidence, and model operations
- `src/ea/backstage/` — entity parsing, writing, mapping, and validation helpers
- `src/ea/facts/` — markdown fact extraction and doc consistency
- `src/ea/resolvers/` — discovery and observed-state integrations
- `src/ea/generators/` — built-in generators
- `docs/` — user-facing framework docs
- `examples/` — supported examples and regression fixtures

## Contribution rules

- Keep terminology current with the shipped framework.
- Prefer entity-native wording over older artifact-era wording.
- Do not document or reintroduce removed commands as current features.
- Keep examples consistent with actual CLI behavior.
- Update tests and docs together when behavior changes.

## Documentation rule of thumb

Write docs as though the current framework is the only supported model.

That means:

- Backstage-aligned entities are the authored contract.
- Manifest and inline are the supported storage modes.
- Entity refs are the runtime identifier shape.
- Historical fixtures may remain in `examples/`, but they should never be presented as the default starting point.

## Before opening a PR

Run:

```bash
pnpm run build
pnpm run test
pnpm run lint
```

Then confirm that any changed commands, examples, or workflows are reflected in `README.md`, `docs/`, and relevant example docs.
