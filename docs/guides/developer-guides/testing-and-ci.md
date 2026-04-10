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

## Boundary for adopters

This repository's CI validates the Anchored Spec framework itself.

Consumer repositories should usually wire Anchored Spec into CI as a control-plane layer, for example:

- `validate` for schema and relation correctness
- `trace --check` when trace integrity matters
- `drift` where declared-versus-observed consistency matters
- `diff --compat --policy` for sensitive architectural changes
- `impact --with-commands --format json` when a repository wrapper wants structured `architectureImpact`, `repositoryImpact`, and `suggestions`

The repository should still own:

- exact task scoping
- exact command execution
- focused versus broader verification
- mutating follow-up actions

If a repository wants richer repo-local impact expansion in CI, prefer a repository-evidence adapter or wrapper-owned rendering logic over hardcoding those assumptions into the architecture model.

## When changing behavior

- update tests first or alongside the change
- check whether docs describing the public behavior need updates
- assume the CI matrix across Node `18`, `20`, and `22` is part of the supported contract
