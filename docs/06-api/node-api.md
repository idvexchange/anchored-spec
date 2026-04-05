# Node API

The Node API is the programmatic surface of the framework. The package entrypoint in `src/index.ts` re-exports the EA runtime from `src/ea/index.ts`.

## Main Export Families

### Core model and config

- shared EA types
- domain constants
- config resolution
- loader types and `EaRoot`

### Validation and graph

- schema validation
- relation validation
- relation registry
- graph building

### Discovery and drift

- discovery report types
- resolver interfaces and built-in resolvers
- drift detection
- cache abstractions

### Reporting and governance

- reports
- impact analysis
- constraint extraction
- policy evaluation
- compatibility and version policy enforcement

### Generation and evidence

- generator interfaces
- built-in generators
- evidence record helpers
- verification and reconcile helpers

## Why It Exists

The Node API allows:

- deeper repository automation
- custom scripts
- internal platform integrations
- test harnesses built on the same runtime as the CLI

## Implementation References

- `src/index.ts`
- `src/ea/index.ts`
