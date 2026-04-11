# Scaffold Strategy

This document defines the target behavior for `npx anchored-spec init` when the framework is used in a new repository.

The goal is to make the scaffold useful immediately while keeping it self-contained, repository-agnostic, and programming-language agnostic.

## Position

`init` should establish the architecture control plane, not the full repository harness.

The scaffold should:

- create the minimum files and defaults needed for modeling, validation, and bootstrap-first adoption
- teach users the right first moves after initialization
- stay neutral about package managers, test runners, workspace layouts, and runtime stacks

It should not:

- generate repository-specific task wrappers
- claim ownership of concrete verification commands
- guess the repository’s local execution ergonomics

## Scaffold by default

The default `init` experience should create:

- `.anchored-spec/config.json`
- `.anchored-spec/policy.json`
- `catalog-info.yaml` in manifest mode
- the configured docs structure with lightweight seed docs
- config schemas for editor validation

The default post-init guidance should tell users to:

1. inspect supported descriptors with `create --list`
2. use `catalog bootstrap --dry-run` when the repository already has meaningful structure
3. create the first entity directly when the model is already clear
4. validate and trace early

## Scaffold behind flags

`--with-policy` should add only a neutral policy scaffold.

`--with-examples` should add only a sparse example model:

- one owner group
- one domain
- one system
- one component
- one API
- linked docs that demonstrate bidirectional traceability

`--ide`, `--ai`, and `--ci` may generate ecosystem-specific integration files, but those files should still avoid language- or repository-shape assumptions unless the integration itself requires them.

## Never scaffold in core init

Do not generate:

- repo-local `task:*` wrappers
- package-manager-specific command plans
- monorepo assumptions such as `apps/*` or `packages/*`
- concrete repository modeling derived from local evidence

Those concerns belong to:

- `catalog bootstrap` plus human curation
- repository-local harnesses
- optional repository-evidence adapters
