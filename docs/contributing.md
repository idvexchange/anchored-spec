# Contributing

Thank you for your interest in contributing to Anchored Spec!

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
pnpm build          # Dual CJS + ESM build via tsup
pnpm test           # Run all tests (Vitest)
pnpm check-types    # TypeScript type-check
pnpm lint           # ESLint
pnpm verify         # All of the above
pnpm format         # Format code
```

## Project Structure

```
src/
├── core/             # Framework engine (schemas, validation, policy, generators)
│   ├── schemas/      # JSON Schema 2020-12 definitions
│   ├── __tests__/    # Core unit tests
│   ├── validate.ts   # AJV validation + semantic quality checks
│   ├── policy.ts     # Path-based workflow enforcement
│   ├── integrity.ts  # Cross-refs, lifecycle rules, dependency checks
│   ├── check.ts      # Programmatic policy check API
│   ├── drift.ts      # Semantic drift detection (pluggable resolvers)
│   ├── files.ts      # Shared file discovery (walkDir, discoverSourceFiles)
│   ├── hooks.ts      # Lifecycle hooks (post-create, post-transition)
│   ├── test-linking.ts # Bidirectional test↔requirement traceability
│   ├── evidence.ts   # Test evidence pipeline (collect, validate, parsers)
│   ├── impact.ts     # File-to-requirement impact analysis
│   ├── plugins.ts    # Plugin loading and execution
│   ├── verify.ts     # Pure verification engine (runAllChecks)
│   ├── generate.ts   # Markdown generation from JSON specs
│   ├── loader.ts     # Filesystem loader (SpecRoot class)
│   └── types.ts      # TypeScript types matching schemas
├── cli/              # CLI interface (commander)
│   ├── commands/     # init, create, verify, generate, status, transition,
│   │                 # check, drift, migrate, import-cmd, report,
│   │                 # evidence, impact
│   ├── watch.ts      # File watcher for --watch modes
│   ├── errors.ts     # CliError class for testable exits
│   └── __tests__/    # CLI integration tests
├── resolvers/        # Built-in drift resolvers
│   ├── typescript-ast.ts  # ts-morph based AST resolver
│   └── __tests__/    # Resolver tests
├── ea/                   # Enterprise Architecture extension
│   ├── types.ts          # 44 EA kinds, domain types, artifact interfaces
│   ├── loader.ts         # EaRoot: loads/validates YAML/JSON artifacts
│   ├── graph.ts          # RelationGraph: traversal, impact, cycle detection
│   ├── drift.ts          # 42 drift rules across 7 domains
│   ├── impact.ts         # Transitive impact analysis
│   ├── validate.ts       # Schema + quality validation
│   ├── evidence.ts       # Evidence collection and management
│   ├── report.ts         # 6 report views
│   ├── config.ts         # EA configuration resolution
│   ├── cache.ts          # Resolver cache (disk + no-op)
│   ├── discovery.ts      # Artifact discovery pipeline
│   ├── migrate-legacy.ts # REQ/CHG/ADR → EA migration
│   ├── relation-registry.ts # 27 relation types with virtual inverses
│   ├── resolvers/        # 5 resolvers (openapi, kubernetes, terraform, sql-ddl, dbt)
│   ├── generators/       # Generator framework + openapi, jsonschema generators
│   └── schemas/          # 47 JSON Schema files
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
- **CliError pattern** — Commands throw `CliError(message, exitCode)`. Top-level `main()` catches and exits.
- **Dual CJS/ESM** — tsup builds both formats with `bundle: false`, `shims: true`.

## Testing

Tests use [Vitest](https://vitest.dev/) and are colocated with source in `__tests__/` directories.

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm vitest

# Run a specific test file
pnpm vitest src/core/__tests__/validate.test.ts

# Run with coverage
pnpm test -- --coverage
```

Coverage thresholds are enforced on `src/core/` (80% statements, 75% branches, 80% functions, 80% lines).

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
