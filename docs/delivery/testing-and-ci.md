---
type: guide
status: current
audience:
  - developer
  - maintainer
  - reviewer
domain:
  - delivery
ea-entities:
  - capability:default/drift-detection
  - capability:default/governed-evolution
  - component:default/governance-and-workflow
  - component:default/drift-and-reconcile
---

# Testing and CI

Architecture workflows are only valuable if teams trust them during day-to-day delivery.

## Local Checks

Useful local commands:

```bash
pnpm run build
pnpm run test
pnpm run lint
pnpm exec anchored-spec validate
pnpm exec anchored-spec trace --summary
```

Add `drift`, `diff --compat --policy`, or `reconcile` when the change affects contracts, discovery sources, or linked documentation.

## CI Gates

Good CI patterns for Anchored Spec repositories:

- run `validate` on every PR
- run `diff --compat --policy` when the PR changes architecture-sensitive files
- publish graph or report outputs as CI entities
- keep `reconcile --include-trace --include-docs` available for stronger gates

## What to Test

The most valuable tests usually cover:

- command-level behavior for the CLI
- fixtures for important entity kinds and relations
- drift and resolver behavior against representative sources
- documentation traceability and consistency

Readable failure output matters. Reviewers should understand whether a failure is about schema, policy, drift, or documentation quality.
