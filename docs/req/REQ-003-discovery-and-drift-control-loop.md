# REQ-003: Discovery and Drift Control Loop

## Requirement

The framework shall support a control loop in which existing repository truth can be discovered and compared against the authored model.

## Behavior Statements

- When discovery runs, the framework shall produce draft entities or observed state from supported source types.
- When drift analysis runs, the framework shall compare declared architecture to observed findings and report mismatches.
- When caching is enabled, the framework shall reuse resolver outputs within the configured TTL.

## Rationale

Without discovery and drift, the architecture model becomes harder to bootstrap and easier to distrust.

## Implementation References

- `src/ea/resolvers/`
- `src/ea/discovery.ts`
- `src/ea/drift.ts`
- `src/ea/cache.ts`
