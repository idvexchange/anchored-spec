# ADR-007: Architecture Control Plane and Repository Harness Boundary

## Status

Accepted

## Context

Field usage in a large monorepo showed that Anchored Spec is most effective when it stays sparse, typed, queryable, and local. The strongest outcomes came from using Anchored Spec as the architecture control plane and CLI query surface, while the repository kept ownership of task scoping, focused verification, and mutating follow-up actions.

The main failure mode was over-reading the framework's surface area and treating it as though it should become:

- the full task-routing engine
- the full verification orchestrator
- the owner of every repository-specific workflow decision
- the primary dependency graph for all code-level execution choices

That direction increases bloat and weakens the framework's generic value.

## Decision

Treat Anchored Spec as the repository's architecture control plane.

Anchored Spec owns:

- architecture truth at architectural boundaries
- CLI-first lookup for humans and agents
- declared-versus-observed validation, trace, drift, diff, and context primitives
- reusable helper primitives that feed repo-local harnesses

Repositories own:

- exact command plans and script selection
- focused versus broader verification decisions
- mutating follow-up actions such as generation or migration flows
- local baseline comparison and regression attribution
- human-facing delivery ergonomics

The framework may provide suggestion-oriented helper structures, but it should not become the canonical owner of orchestration.
When a component needs to point into implementation, the preferred architecture-level link is one primary `anchored-spec.dev/code-location`. More granular file, symbol, or test evidence is supporting repository context, not the primary architecture boundary.

## Consequences

### Positive

- keeps the framework generic across repositories
- preserves a stable CLI and model for both humans and AI agents
- reduces pressure toward over-modeling and discovery-first adoption
- makes thin repository harnesses the normal integration point for local execution

### Negative

- repositories still need lightweight wrapper logic for practical execution
- some teams may expect deeper orchestration than the framework will provide
- repo-specific verification ergonomics remain intentionally outside the framework core

## Implementation References

- `README.md`
- `docs/current-vs-target.md`
- `docs/guides/user-guides/repository-harness-pattern.md`
- `docs/guides/developer-guides/repository-harness-feedback.md`
- `.anchored-spec/policy.json`
- `src/cli/commands/ea-impact.ts`
- `src/cli/commands/ea-context.ts`
- `src/ea/reverse-resolution.ts`
- `src/ea/repository-evidence-loader.ts`
