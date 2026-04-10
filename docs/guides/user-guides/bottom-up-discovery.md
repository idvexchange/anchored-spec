# Bottom-Up Discovery

Use this workflow when the repository already contains useful source material and you want Anchored Spec to propose draft architecture from it.

If you want a curated first-pass `catalog-info.yaml`, start with [catalog-bootstrap.md](catalog-bootstrap.md). Use `discover` when you want broader resolver-driven extraction.

## Ground rules

- start with `--dry-run`
- treat results as draft
- normalize names, owners, and boundaries after discovery
- treat tree-sitter and file-level findings as optional enrichment, not as the primary routing model

## Default sequence

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog explain component:default/your-primary-component
npx anchored-spec discover --dry-run
npx anchored-spec discover
npx anchored-spec validate
npx anchored-spec drift
```

## Example source-specific runs

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml --dry-run
npx anchored-spec discover --resolver kubernetes --source ./k8s --dry-run
npx anchored-spec discover --resolver terraform --source ./terraform.tfstate --dry-run
npx anchored-spec discover --resolver sql-ddl --source ./schema.sql --dry-run
```

## After discovery

1. keep the curated catalog plan as the baseline if it matches the repo shape
2. use discovery to widen coverage where the baseline is still thin
3. merge or rename noisy drafts
4. add ownership and descriptions
5. run validation again
6. use drift to compare the cleaned model to current reality

When discovery can infer a clear primary source area, record it on the component with `anchored-spec.dev/code-location` and keep raw file evidence secondary.
