---
type: guide
status: current
audience:
  - developer
  - architect
  - maintainer
domain:
  - delivery
  - systems
ea-entities:
  - resource:default/documentation-set
  - component:default/anchored-spec-library
  - component:default/anchored-spec-cli
  - capability:default/discovery
  - capability:default/drift-detection
---

# Bottom-Up Discovery

Use this workflow when you want to start from code, contracts, infrastructure, or documentation that already exists and discover draft entities from it.

Discovery is bottom up because it begins with observed material and proposes catalog entities from that material. The discovered entities are drafts and should be reviewed before they become trusted authored architecture.

## Default Loop

```bash
npx anchored-spec discover --dry-run
npx anchored-spec discover
npx anchored-spec validate
npx anchored-spec trace --summary
npx anchored-spec drift
```

Use `--dry-run` first on any large repository.

## OpenAPI-First Service

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml --dry-run
npx anchored-spec discover --resolver openapi --source ./openapi.yaml
npx anchored-spec validate
npx anchored-spec report --view traceability-index
```

## Source-Code-First Repository

```bash
npx anchored-spec discover --resolver tree-sitter --source ./src --dry-run
npx anchored-spec discover --resolver tree-sitter --source ./src
npx anchored-spec validate
npx anchored-spec drift
```

## Kubernetes-First Runtime

```bash
npx anchored-spec discover --resolver kubernetes --source ./k8s --dry-run
npx anchored-spec discover --resolver kubernetes --source ./k8s
npx anchored-spec validate
npx anchored-spec graph --format mermaid
```

## Terraform-First Infrastructure

```bash
npx anchored-spec discover --resolver terraform --source ./terraform.tfstate --dry-run
npx anchored-spec discover --resolver terraform --source ./terraform.tfstate
npx anchored-spec validate
npx anchored-spec drift
```

## SQL-First Data Platform

```bash
npx anchored-spec discover --resolver sql-ddl --source ./schema.sql --dry-run
npx anchored-spec discover --resolver sql-ddl --source ./schema.sql
npx anchored-spec validate
npx anchored-spec report --view system-data
```

## dbt-First Analytics Stack

```bash
npx anchored-spec discover --resolver dbt --source ./target/manifest.json --dry-run
npx anchored-spec discover --resolver dbt --source ./target/manifest.json
npx anchored-spec validate
npx anchored-spec drift
```

## Markdown-First Documentation Estate

```bash
npx anchored-spec discover --resolver markdown --source ./docs --dry-run
npx anchored-spec discover --resolver markdown --source ./docs
npx anchored-spec trace --summary
npx anchored-spec drift
```

If the docs already have frontmatter and entity refs, prefer:

```bash
npx anchored-spec discover --from-docs --dry-run
npx anchored-spec discover --from-docs
npx anchored-spec link-docs --sync
```

## Mixed-Stack Bootstrap

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml --dry-run
npx anchored-spec discover --resolver tree-sitter --source ./src --dry-run
npx anchored-spec discover --resolver kubernetes --source ./k8s --dry-run
npx anchored-spec discover --resolver terraform --source ./terraform.tfstate --dry-run
npx anchored-spec discover
npx anchored-spec validate
npx anchored-spec trace --summary
npx anchored-spec drift
npx anchored-spec reconcile --include-trace --include-docs
```

## Useful Flags

```bash
npx anchored-spec discover --dry-run --json
npx anchored-spec discover --write-facts
npx anchored-spec discover --no-cache
npx anchored-spec discover --max-cache-age 0
```

## What to Do After Discovery

1. review the discovered entities
2. rename or merge where needed
3. add ownership and descriptions
4. add or fix linked docs
5. validate and run drift again

If you already know the intended target model, use `docs/delivery/top-down-authoring.md` next.
