# Runbook

This runbook captures common operational tasks for framework maintainers.

## Cut a Release

1. ensure build, test, type-check, and lint all pass
2. verify the package metadata and changelog state
3. create a version tag beginning with `v`
4. let `.github/workflows/ci.yml` run the publish job

## Add a New CLI Command

1. implement the command in `src/cli/commands/`
2. register it in `src/cli/index.ts`
3. add or update tests under `src/cli/__tests__/`
4. document it in the appropriate guide or API document

## Add a New Resolver

1. implement the resolver under `src/ea/resolvers/`
2. expose it through `src/ea/resolvers/index.ts`
3. connect it to discovery loading if needed
4. add representative fixtures and tests
5. document when users should trust it

## Add a New Generator

1. implement it under `src/ea/generators/`
2. expose it through `src/ea/generators/index.ts`
3. add generator tests
4. document its intended use and limitations

## Investigate a CI Failure

1. identify whether the failure is build, test, type, lint, or publish
2. reproduce locally with the matching `pnpm run ...` command
3. inspect whether the issue is CLI-only, runtime-only, or pipeline-specific
4. update docs if the failure exposed an outdated operational assumption
