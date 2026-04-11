# Model The Repo

Use this guide to choose between direct authoring, curated bootstrap, and broader discovery.

## Preferred order

For most repositories, prefer:

1. direct authoring when architectural intent is already clear
2. `catalog bootstrap` when the repository already has meaningful structure
3. `discover` only when you need broader resolver-driven pressure or enrichment

## Author directly

Use direct authoring when you already know the architecture you want.

```bash
npx anchored-spec init --mode manifest
npx anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform-team
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec validate
```

Recommended order:

1. create domain and system boundaries
2. create components, APIs, and resources
3. add relationships and primary `anchored-spec.dev/code-location` annotations
4. validate and trace early

## Bootstrap from repository evidence

Use `catalog bootstrap` when you want a curated first-pass `catalog-info.yaml` without accepting raw discovery as architecture truth.

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --dry-run --explain
npx anchored-spec catalog bootstrap --write catalog-info.yaml
```

Use it when:

- you are starting in manifest mode
- the repository already has meaningful docs or source layout
- you want Backstage-aligned output quickly
- you want inferred `anchored-spec.dev/code-location` values on synthesized components when the signal is strong

Review the result for:

- correct top-level domain, system, and component boundaries
- correct names and ownership
- sensible primary code locations
- relationships that reflect intent, not just weak evidence

After writing the plan:

1. merge or rename noisy entities
2. fill in descriptions, lifecycle, and owners
3. add missing relationships intentionally
4. run `npx anchored-spec validate`

## Use discovery selectively

Use `discover` when you need broader resolver-driven extraction or source-specific findings.

```bash
npx anchored-spec discover --dry-run
npx anchored-spec discover --resolver openapi --source ./openapi.yaml --dry-run
npx anchored-spec discover --resolver kubernetes --source ./k8s --dry-run
```

Ground rules:

- start with `--dry-run`
- treat results as draft
- normalize names, owners, and boundaries after discovery
- treat tree-sitter and file-level findings as optional enrichment, not the primary control plane

## Best-fit rule

`catalog bootstrap` is planner-first and curated. `discover` is resolver-first and broad. Neither should silently replace deliberate architecture modeling.

## Read next

- [review-and-analysis.md](review-and-analysis.md)
- [repository-harness.md](repository-harness.md)
