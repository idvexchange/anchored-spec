# Infrastructure

Anchored Spec runs as a TypeScript package with a CLI, a Node runtime library, local repository artifacts, and a GitHub Actions pipeline.

## Stack Inventory

### Runtime

- Node.js
- TypeScript
- Commander for CLI parsing
- AJV for schema validation
- YAML and markdown parsing libraries for authored and observed artifacts

### Build and packaging

- `tsup` for builds
- dual ESM and CommonJS distribution
- npm publishing

### Quality tooling

- Vitest
- ESLint
- TypeScript compiler
- Prettier

### Repository infrastructure

- `.github/workflows/ci.yml` for CI and publish
- `.anchored-spec/` for local framework state and cache

## Infrastructure Character

The infrastructure is intentionally simple:

- no database
- no hosted control plane
- no required remote dependency for the core architecture loop

That simplicity is part of the framework's design position.
