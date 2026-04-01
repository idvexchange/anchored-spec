# Governed Evolution

Anchored Spec helps teams review architecture change semantically, not just textually.

## Semantic diff

Use semantic diff to compare git states of the model.

```bash
npx anchored-spec diff --base main
npx anchored-spec diff --base main --compat
npx anchored-spec diff --base main --compat --policy
```

The diff engine classifies changes into categories such as identity, metadata, structural, behavioral, contractual, and governance changes.

## Compatibility assessment

Compatibility assessment answers a practical question: is this change safe for consumers and downstream dependencies?

This is especially important for:

- APIs
- shared schemas
- canonical entities
- key internal components with many dependents

Compatibility review is based on real entity context, not just textual removal or addition.

## Version policy enforcement

Version policy lets teams define how strict a kind should be.

Examples:

- backward-only for APIs
- full compatibility for canonical entities
- more flexible rules for exploratory business modeling

Policy checks help encode architecture review standards directly into the CLI.

## Reconcile

Reconcile is the broad quality loop.

```bash
npx anchored-spec reconcile --include-trace --include-docs
```

Reconcile can combine:

- generation
- validation
- drift
- trace checks
- doc-consistency checks

It is useful both as a CI gate and as a local pre-merge review workflow.

## Why this matters

Governed evolution keeps architecture review from becoming either too manual or too superficial.

Instead of asking reviewers to infer architectural risk from raw YAML changes, anchored-spec can surface:

- what changed semantically
- who or what depends on it
- whether the change is compatible
- whether the project policy allows it
- whether docs and traceability stayed in sync
