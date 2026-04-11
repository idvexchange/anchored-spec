# Maintainer Architecture

This guide is for contributors who need the implementation map behind the public CLI and Node API surfaces.

## Main implementation seams

- `src/ea/backstage/` for descriptor parsing, mapping, and validation
- `src/ea/resolvers/` for discovery
- `src/ea/repository-evidence*.ts` for optional repo-local target expansion and adapter loading
- `src/ea/facts/` and `src/ea/drift.ts` for observed-vs-declared analysis
- `src/ea/report.ts`, `src/ea/impact.ts`, and `src/ea/constraints.ts` for review outputs
- `src/ea/generators/` for derived outputs
- `src/ea/policy.ts`, `src/ea/version-policy.ts`, `src/ea/evidence.ts`, and `src/ea/reconcile.ts` for governance
- `src/cli/commands/` for user-facing orchestration

## Design rules

- keep domain logic in `src/ea/` and keep the CLI thin
- keep architecture truth generic across repositories
- keep repository-specific execution knowledge adapter-driven and optional
- do not make package-manager or language assumptions part of core architecture truth
- keep the framework sparse, queryable, and reusable while repositories own last-mile execution

## Key consequence

If you are fixing behavior rather than changing output wording or file orchestration, the real change probably belongs in the EA runtime rather than the command layer.
