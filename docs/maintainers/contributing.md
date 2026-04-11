# Contributing

This repository builds Anchored Spec itself, so implementation, documentation, tests, and public behavior should move together.

## Baseline workflow

```bash
pnpm install
pnpm task:start --changed
pnpm task:check
pnpm run build
pnpm run test
pnpm run check-types
pnpm run lint
```

For non-trivial work in this repository, start with `pnpm task:start --changed` or `pnpm task:start <path...>`, then use `pnpm task:verify` for focused verification before widening to full-repo checks.

## High-value areas

- `src/cli/` for public command behavior
- `src/ea/` for architecture runtime behavior
- `src/ea/resolvers/` for discovery sources
- `src/ea/generators/` for derived outputs
- `src/ea/schemas/` for contract definitions

## Local and CI quality bar

Local loop:

```bash
pnpm run build
pnpm run test
pnpm run check-types
pnpm run lint
```

CI source of truth:

- `.github/workflows/ci.yml`

Assume the CI matrix across Node `18`, `20`, and `22` is part of the supported contract.

## Contribution rules

- keep docs aligned with shipped behavior
- add tests when semantic behavior changes
- preserve the framework’s local-first design
- preserve the architecture-control-plane versus repository-harness split
- do not document features that do not exist in code
- update docs when public workflow guidance changes
