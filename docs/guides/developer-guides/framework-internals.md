# Framework Internals

This guide is for contributors who need the implementation map behind the public CLI and Node API surfaces.

## Main implementation seams

- `src/ea/backstage/` for descriptor parsing, mapping, and validation
- `src/ea/resolvers/` for discovery
- `src/ea/facts/` and `src/ea/drift.ts` for observed-vs-declared analysis
- `src/ea/report.ts`, `src/ea/impact.ts`, and `src/ea/constraints.ts` for review outputs
- `src/ea/generators/` for derived outputs
- `src/ea/policy.ts`, `src/ea/version-policy.ts`, `src/ea/evidence.ts`, and `src/ea/reconcile.ts` for governance
- `src/cli/commands/` for user-facing orchestration

## Key design rule

The framework keeps most domain logic in `src/ea/` and treats the CLI as a thin operational shell.

## Key design consequence

If you are fixing behavior rather than changing output wording or file orchestration, the real change probably belongs in the EA runtime rather than the command layer.
