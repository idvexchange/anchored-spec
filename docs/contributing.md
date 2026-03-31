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
├── ea/                       # Enterprise Architecture (sole implementation)
│   ├── types.ts              # 44 EA kinds, domain types, artifact interfaces
│   ├── loader.ts             # EaRoot: loads/validates YAML/JSON artifacts
│   ├── graph.ts              # RelationGraph: traversal, impact, cycle detection
│   ├── drift.ts              # 51 drift rules across 7 domains
│   ├── impact.ts             # Transitive impact analysis
│   ├── validate.ts           # Schema + quality validation (51 schemas)
│   ├── evidence.ts           # Evidence collection and management
│   ├── report.ts             # 6 report views
│   ├── config.ts             # EA configuration resolution
│   ├── cache.ts              # Resolver cache (disk + no-op)
│   ├── discovery.ts          # Artifact discovery pipeline
│   ├── policy.ts             # EA workflow policy engine
│   ├── plugins.ts            # EA plugin system
│   ├── verify.ts             # EA verification engine
│   ├── relation-registry.ts  # 27 relation types with virtual inverses
│   ├── resolvers/            # 7 resolvers (openapi, kubernetes, terraform, sql-ddl, dbt, anchors, markdown)
│   ├── generators/           # Generator framework + openapi, jsonschema generators
│   ├── evidence-adapters/    # Evidence adapter framework (vitest, etc.)
│   └── schemas/              # 51 JSON Schema files
├── cli/                      # CLI interface (commander)
│   ├── commands/             # init, create, validate, graph, report, evidence,
│   │                         # drift, discover, generate, impact, status, transition
│   ├── errors.ts             # CliError class for testable exits
│   └── __tests__/            # CLI integration tests
├── resolvers/                # Optional drift resolvers
│   ├── typescript-ast.ts     # ts-morph based AST resolver
│   └── __tests__/            # Resolver tests
└── index.ts                  # Public library API (re-exports ea/)
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
pnpm vitest src/ea/__tests__/validate.test.ts

# Run with coverage
pnpm test -- --coverage
```

Coverage thresholds are enforced on `src/ea/` (80% statements, 75% branches, 80% functions, 80% lines).

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
