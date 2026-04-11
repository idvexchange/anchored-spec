# ADR-004: Repository-Local Workflow

## Status

Accepted

## Context

The framework is intended to improve pull-request-level architecture work, not move it into a separate hosted platform first.

## Decision

Keep the core Anchored Spec workflow repository-local:

- local files as primary persistence
- CLI-first operations
- CI integration through normal repository pipelines
- no required control plane for core use

## Consequences

### Positive

- low adoption friction
- architecture changes stay near code changes
- easier local experimentation and review

### Negative

- cross-repository federation is an integration concern rather than a built-in server feature
- teams must be disciplined about consistent local usage

## Implementation References

- `src/cli/`
- `src/ea/loader.ts`
- `.github/workflows/ci.yml`
