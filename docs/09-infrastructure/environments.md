# Environments

Anchored Spec does not manage application runtime environments. Its own environments are development, CI, and package publication.

## Local Development

### Purpose

Author, test, and debug the framework.

### Expected tools

- Node.js `>=18`
- pnpm
- Git

### Main commands

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run check-types
pnpm run lint
```

## CI Test Environment

### Purpose

Verify build, test, type, and lint behavior across the supported Node matrix.

### Source of truth

- `.github/workflows/ci.yml`

## Publish Environment

### Purpose

Publish a tagged release to npm.

### Notes

- only triggered from version tags
- uses npm provenance
- requires `NPM_TOKEN`

## Environment Design Notes

- no long-lived hosted environment exists for the framework itself
- repository state and CI execution are the main operational contexts
