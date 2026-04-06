# Catalog Bootstrap

Use this workflow when the repository already has meaningful structure, docs, and source evidence, but you do not want to author the first `catalog-info.yaml` entirely by hand.

`anchored-spec catalog` synthesizes a curated Backstage-aligned catalog plan from repository evidence. It is meant to accelerate first-pass modeling, not replace architectural review.

## When to use it

- you are starting in manifest mode and need a strong first draft
- you want repository-specific entities instead of a mostly flat discovery dump
- you want docs, source layout, and existing architecture signals to shape the first catalog
- you want a safer starting point than writing a large manifest manually

## What it does

The catalog workflow:

- scans the repository for evidence
- classifies the repository shape
- proposes a small set of top-level canonical entities
- attaches synthesized components and related entities under that structure
- adds `anchored-spec.dev/code-location` on synthesized components when a primary repository-relative source path can be inferred
- emits a validator-safe manifest plan

This is different from `discover`:

- `discover` is resolver-first and can produce broad raw findings
- `catalog bootstrap` is planner-first and produces a curated catalog proposal

## Recommended sequence

Start by inspecting the plan without writing files:

```bash
npx anchored-spec catalog bootstrap --dry-run
```

If you want the reasoning behind the proposal:

```bash
npx anchored-spec catalog bootstrap --dry-run --explain
```

If you want the proposed manifest directly:

```bash
npx anchored-spec catalog bootstrap --format yaml
```

When the plan looks right, write or merge it:

```bash
npx anchored-spec catalog bootstrap --write catalog-info.yaml
npx anchored-spec validate
```

Use `--merge` when the repository already has a manifest and you only want to add missing synthesized entities:

```bash
npx anchored-spec catalog bootstrap --merge
```

## Useful controls

Override the synthesis profile when the repository shape is obvious and you do not want auto-detection:

```bash
npx anchored-spec catalog bootstrap --profile library --dry-run
```

Limit the proposed scope to specific entity families:

```bash
npx anchored-spec catalog bootstrap --include capabilities,decisions,requirements --dry-run
```

Add extra evidence roots when important material lives outside the default scan set:

```bash
npx anchored-spec catalog bootstrap --source src --source docs --dry-run
```

Inspect why one specific entity was proposed:

```bash
npx anchored-spec catalog explain component:default/anchored-spec-cli
```

## How to review the result

Focus review on:

- whether the top-level domain, system, and component boundaries are correct
- whether names match the repository's actual language
- whether inferred primary code locations point at the intended source area
- whether ownership and lifecycle defaults need tightening
- whether synthesized relationships express intent or only weak evidence

After applying the plan:

1. rename or merge entities that are still too coarse
2. fill in descriptions, owners, and lifecycle values
3. add missing relationships intentionally
4. run `npx anchored-spec validate`
5. use `discover` and `drift` as follow-on pressure, not as the source of truth

## Best fit

- existing repositories adopting Anchored Spec for the first time
- repos with meaningful docs under `docs/`
- codebases where you want Backstage-aligned output quickly without accepting raw discovery as-is

## Read next

- [getting-started.md](getting-started.md)
- [bottom-up-discovery.md](bottom-up-discovery.md)
- [top-down-authoring.md](top-down-authoring.md)
