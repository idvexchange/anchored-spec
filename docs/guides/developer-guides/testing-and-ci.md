# Testing and CI

The framework is maintained through a combination of local quality checks and GitHub Actions.

## Local loop

```bash
pnpm run build
pnpm run test
pnpm run check-types
pnpm run lint
```

## CI source of truth

- `.github/workflows/ci.yml`

## What the pipeline enforces

- build
- tests
- type checks
- lint
- built CLI dogfooding

## When changing behavior

- update tests first or alongside the change
- check whether docs describing the public behavior need updates
- assume the CI matrix across Node `18`, `20`, and `22` is part of the supported contract
