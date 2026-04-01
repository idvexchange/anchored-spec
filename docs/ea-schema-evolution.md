# Schema Evolution

Anchored Spec evolves through schemas, config versions, and command behavior. Good schema evolution keeps repositories moving without letting the model become ambiguous.

## Current baseline

Current projects use `.anchored-spec/config.json` with `schemaVersion: "1.0"` and Backstage-aligned entities as the authored contract.

## Evolution principles

Schema changes should be:

- explicit
- documented
- reviewable
- easy to validate locally and in CI

## What can evolve

Typical evolution areas include:

- config fields
- custom kind schemas
- validation rules
- generator contracts
- report formats
- diff and policy behavior

## Safe evolution guidance

When changing a schema or validation contract:

1. keep the authored meaning clear
2. update CLI behavior and tests together
3. document the new expectation in `docs/`
4. update examples so users can see the current contract in practice

## Migration guidance

If a change affects repository authors directly, provide:

- a clear new canonical shape
- an example of the new form
- explicit guidance on what old assumptions should be removed

## What to avoid

Avoid keeping two equally “current” shapes alive in documentation unless the CLI truly supports both as first-class authored contracts.
