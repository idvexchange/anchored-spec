# REQ-004: Semantic Change Governance

## Requirement

The framework shall support governance workflows that reason about architecture change semantically rather than as plain text only.

## Behavior Statements

- When semantic diff runs, the framework shall classify changes by architecture meaning.
- When impact or constraints analysis runs, the framework shall traverse the normalized relation graph using defined traversal profiles.
- When policy or evidence workflows run, the framework shall produce reviewable outputs suitable for CI or human review.

## Rationale

Meaningful architecture review requires typed change semantics, not only file diffs.

## Implementation References

- `src/ea/diff.ts`
- `src/ea/impact.ts`
- `src/ea/constraints.ts`
- `src/ea/policy.ts`
- `src/ea/evidence.ts`
