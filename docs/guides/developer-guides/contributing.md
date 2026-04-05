# Contributing

This repository builds Anchored Spec itself, so changes to implementation, documentation, and public behavior should move together.

## Baseline workflow

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run check-types
pnpm run lint
```

## High-value areas

- `src/cli/` for public command behavior
- `src/ea/` for architecture runtime behavior
- `src/ea/resolvers/` for discovery sources
- `src/ea/generators/` for derived outputs
- `src/ea/schemas/` for contract definitions

## Contribution rules

- keep docs aligned with shipped behavior
- add tests when semantic behavior changes
- preserve the framework's local-first design
- do not document features that do not exist in code
