# ADR-002: Dual Storage Modes

## Status

Accepted

## Context

Different repositories want different authoring ergonomics. Some prefer a central catalog, while others want entity data embedded directly in markdown.

## Decision

Support two storage modes:

- manifest mode
- inline mode

The framework should load both, but a repository should normally adopt one primary mode and preserve it.

## Consequences

### Positive

- broader adoption fit
- support for both model-first and docs-first repositories

### Negative

- loader and writer logic are more complex
- migration between modes must be handled carefully

## Implementation References

- `src/ea/config.ts`
- `src/ea/loader.ts`
- `src/cli/commands/ea-init.ts`
- `src/cli/commands/ea-transition.ts`
