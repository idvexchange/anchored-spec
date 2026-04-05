# CI/CD

The current CI/CD implementation is defined in `.github/workflows/ci.yml`.

## Test Workflow

### Trigger conditions

- pushes to `main`
- pull requests targeting `main`

### Matrix

- Node.js `18`
- Node.js `20`
- Node.js `22`

### Steps

1. checkout
2. setup pnpm
3. setup Node with pnpm cache
4. install dependencies with frozen lockfile
5. build
6. run tests
7. run type checks
8. run lint
9. dogfood the built CLI validation command

## Publish Workflow

### Trigger condition

- tags starting with `v`

### Steps

1. checkout
2. setup pnpm
3. setup Node `22`
4. install dependencies
5. build
6. publish to npm with provenance

## Pipeline Design Notes

- the test job is deliberately broad across supported Node versions
- the publish job is gated behind successful tests
- permissions are scoped to the minimum needed for each job

## Operational Implication

If you change build, packaging, or command behavior, you must assume the CI workflow is part of the public contract for this repository.
