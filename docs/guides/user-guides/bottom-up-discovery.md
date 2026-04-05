# Bottom-Up Discovery

Use this workflow when the repository already contains useful source material and you want Anchored Spec to propose a draft architecture model from it.

## Ground rules

- start with `--dry-run`
- treat results as draft
- normalize names, owners, and boundaries after discovery

## Default sequence

```bash
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

1. merge or rename noisy drafts
2. add ownership and descriptions
3. run validation again
4. use drift to compare the cleaned model to current reality
