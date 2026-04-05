# Interfaces

This document describes the main interface contracts inside the framework.

## CLI Interface

The CLI is the primary operational interface for most users.

Key command families:

- initialization and authoring
- validation and reporting
- discovery and drift
- governance and change review
- evidence and reconcile

Implementation reference:

- `src/cli/index.ts`
- `src/cli/commands/`

## Node API Interface

The package exports the EA runtime through:

- `src/index.ts`
- `src/ea/index.ts`

This is the programmatic surface for consumers who want the architecture engine without the CLI wrapper.

## Resolver Interface

Resolvers adapt external material into observed state or draft entities.

Implementation reference:

- `src/ea/resolvers/types.ts`
- `src/ea/resolvers/index.ts`

## Generator Interface

Generators turn the authored model into derived artifacts.

Implementation reference:

- `src/ea/generators/index.ts`

## Cache Interface

Resolver caching is abstracted behind `ResolverCache`.

Implementation reference:

- `src/ea/cache.ts`

## Evidence Interface

Evidence records are standardized so validation and summary workflows can operate consistently.

Implementation reference:

- `src/ea/evidence.ts`

## Plugin and extension seams

The framework supports additional checks and evidence adapters.

Implementation reference:

- `src/ea/plugins.ts`
- `src/ea/evidence-adapters/`
