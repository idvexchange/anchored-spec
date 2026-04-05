# Test Strategy

Anchored Spec relies on a broad automated test suite because much of its value comes from preserving behavioral meaning across many command and analysis surfaces.

## Testing Goals

- keep the CLI contract stable
- preserve semantic correctness of validation, discovery, drift, and governance
- protect file-oriented workflows from regressions
- keep outputs reviewable and predictable

## Test Layers

### Command-level tests

- location: `src/cli/__tests__/`
- focus: command behavior, scaffolding, output modes, and integration with the runtime

### Runtime and domain tests

- location: `src/ea/__tests__/`
- focus: validation, graph behavior, resolvers, drift, reports, generators, policy, evidence, reconcile

### Backstage model tests

- location: `src/ea/backstage/__tests__/`
- focus: descriptor parsing, accessors, kind mapping, writing, validation

### Support and utility tests

- location: `src/resolvers/__tests__/`
- focus: narrower helper surfaces such as TypeScript AST support

## Must-Have Scenarios

- creating and loading entities in supported forms
- validating schemas and relations
- discovering from each supported source family
- detecting drift and rendering summaries
- running reports, impact, and constraints
- enforcing diff and policy behavior
- building generated outputs
- writing and validating evidence
- exercising CLI scaffolding and docs-related commands

## Quality Gate

For this repository, the minimum quality gate is:

```bash
pnpm run build
pnpm run test
pnpm run check-types
pnpm run lint
```

## Coverage Guidance

There is no single percentage target documented in code today. The expectation is scenario completeness over raw line coverage, especially for:

- public CLI behavior
- relation semantics
- resolver correctness
- governance and compatibility logic
