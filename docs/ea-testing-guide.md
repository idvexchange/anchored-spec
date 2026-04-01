# Testing Guide

A repository that uses anchored-spec should test both code behavior and architecture behavior.

## What to test

Useful architecture-aware tests and checks include:

- entity validation stays green
- important docs stay linked
- semantic diff catches breaking contract changes
- drift rules surface known architecture mismatches
- evidence workflows continue to accept real outputs
- generated files remain consistent when generation is part of the workflow

## Practical test layers

### Command-level tests

For CLI-facing workflows, validate commands such as:

- `validate`
- `drift`
- `diff --compat --policy`
- `trace`
- `reconcile`

### Fixture tests

Use small representative manifests or inline docs that capture the kinds, relations, and annotations your repository relies on most.

### Documentation tests

If doc consistency matters, keep fact blocks and decorators under test through `drift --domain docs` or `reconcile --include-docs`.

## Review-friendly checks

In CI, architecture testing is often most valuable when it is legible.

Good patterns:

- semantic diff on pull requests
- drift summaries in CI logs or artifacts
- generated report views checked into build artifacts
- traceability summaries for key runtime entities

## The goal

The goal is not to test anchored-spec for the sake of it. The goal is to make sure the architecture model remains trustworthy as the codebase changes.
