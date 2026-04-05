# ADR-003: Declared Before Observed

## Status

Accepted

## Context

Discovery and drift are valuable only if they improve the authored model rather than replacing it with unstable automation output.

## Decision

Treat declared architecture as primary. Treat discovery and drift as:

- bootstrap mechanisms
- validation pressure
- observed evidence

not as silent source-of-truth replacement.

## Consequences

### Positive

- clearer ownership of architecture intent
- safer review behavior
- more trustworthy governance and AI workflows

### Negative

- discovery output always needs review
- some teams may want more automation than the framework intentionally allows

## Implementation References

- `src/ea/discovery.ts`
- `src/ea/drift.ts`
- `src/ea/resolvers/`
