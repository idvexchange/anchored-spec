# Security Architecture

Anchored Spec is a local-first developer tool and library, not a hosted platform. Its security posture is therefore centered on repository trust boundaries, file handling, CI permissions, and safe automation patterns.

## Trust Boundaries

### Local repository boundary

The framework reads and writes local repository artifacts. That makes the repository contents the main trust boundary.

### Source ingestion boundary

Discovery resolvers ingest external-looking material such as OpenAPI, Terraform state, Kubernetes manifests, SQL DDL, and markdown. These are still local inputs, but they may be malformed or unexpectedly large.

### CI boundary

The GitHub Actions workflow runs with `contents: read` for test jobs and limited additional permissions for publish jobs in `.github/workflows/ci.yml`.

## Primary Risks

- malformed local inputs causing misleading discovery or drift output
- over-trusting AI-generated changes to architecture artifacts
- accidental publication or exposure of sensitive repository content in generated outputs
- permissive CI or publish credentials

## Current Controls

- local-first execution rather than required remote services
- explicit command invocation instead of hidden background mutation
- typed validation before downstream workflows
- test coverage over CLI and runtime behavior
- restricted GitHub Actions permissions
- publish workflow gated on version tags

## Security-Relevant Implementation Areas

- `src/cli/errors.ts` for failure handling
- `src/ea/validate.ts` for schema and relation enforcement
- `src/ea/cache.ts` for local cache storage
- `src/ea/resolvers/` for untrusted-input parsing boundaries
- `.github/workflows/ci.yml` for CI and publish permissions

## Recommended Operating Practices

- keep publish credentials tightly scoped
- review generated CI and AI scaffolding before committing it
- treat discovery output as reviewable draft
- avoid feeding sensitive repositories into external AI systems without explicit controls
