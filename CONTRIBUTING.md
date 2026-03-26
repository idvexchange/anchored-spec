# Contributing to Anchored Spec

Thank you for your interest in contributing! This guide covers the development workflow.

## Prerequisites

- **Node.js** ≥ 18
- **pnpm** (latest)

## Setup

```bash
git clone https://github.com/idvexchange/anchored-spec.git
cd anchored-spec
pnpm install
```

## Development Workflow

```bash
# Build (dual CJS + ESM)
pnpm build

# Run tests
pnpm test

# Type-check without emitting
pnpm check-types

# Lint
pnpm lint

# Full verification (build + test + lint)
pnpm verify

# Format code
pnpm format
```

## Project Structure

```
src/
├── core/             # Framework engine (schemas, validation, policy, generators)
│   ├── schemas/      # JSON Schema 2020-12 definitions
│   ├── __tests__/    # Core unit tests
│   ├── validate.ts   # AJV validation + semantic quality checks
│   ├── policy.ts     # Path-based workflow enforcement
│   ├── generate.ts   # Markdown generation from JSON specs
│   ├── loader.ts     # Filesystem loader (SpecRoot class)
│   └── types.ts      # TypeScript types matching schemas
├── cli/              # CLI interface (commander)
│   ├── commands/     # init, create, verify, generate, status
│   └── __tests__/    # CLI integration tests
└── index.ts          # Public library API (re-exports core)
```

## Making Changes

1. **Fork and branch** — Create a feature branch from `main`.
2. **Write tests first** — Add failing tests, then implement.
3. **Run `pnpm verify`** — Must pass before submitting a PR.
4. **Keep commits atomic** — One logical change per commit.

## Code Conventions

- **TypeScript strict mode** — No `any` unless absolutely necessary.
- **ESM-first** — Source is ESM; CJS is generated via tsup.
- **JSON Schema 2020-12** — All spec schemas use this draft.
- **EARS notation** — Behavioral statements follow "When/While/shall" format.

## Testing

Tests use [Vitest](https://vitest.dev/). The test files are colocated with source in `__tests__/` directories.

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm vitest

# Run a specific test file
pnpm vitest src/core/__tests__/validate.test.ts
```

## Submitting a PR

1. Ensure `pnpm verify` passes.
2. Write a clear PR description explaining what and why.
3. Reference any related issues.

## Releasing

Releases are automated via CI when a version tag is pushed:

```bash
pnpm version patch   # or minor / major
git push --follow-tags
```

The CI pipeline runs tests across Node 18/20/22 and publishes to npm on tag push.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
