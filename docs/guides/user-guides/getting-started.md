# Getting Started

This guide shows the shortest path to using Anchored Spec on a repository.

## 1. Install

```bash
pnpm add -D anchored-spec
```

## 2. Initialize

```bash
npx anchored-spec init --mode manifest
```

Use inline mode only if the repository is intentionally docs-first.

## 3. Inspect the supported descriptor shapes

```bash
npx anchored-spec create --list
```

## 4. Choose the fastest first-model path

If you already know the architecture you want, create the first entities directly:

```bash
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform-team
```

If the repository already has strong structure and docs, bootstrap a curated first-pass manifest instead:

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --write catalog-info.yaml
```

That first-pass manifest may include `anchored-spec.dev/code-location` on synthesized components when the framework can infer a primary source path.

Use that annotation as the main code pointer for a component. Keep extra file-level evidence as supporting context instead of turning the catalog into a full source index.

## 5. Validate immediately

```bash
npx anchored-spec validate
```

## 6. Add reviewer-facing outputs

```bash
npx anchored-spec graph --format mermaid
npx anchored-spec report --view traceability-index
```

## 7. Use the normal lookup loop

For day-to-day human and AI-assisted work, do not start by reading raw `catalog-info.yaml`.

Start from the CLI instead:

```bash
npx anchored-spec search orders
npx anchored-spec trace component:default/orders-service
npx anchored-spec context component:default/orders-service --tier llm
npx anchored-spec impact component:default/orders-service --with-commands --format json
```

Treat the output from `impact --with-commands` as input to a thin repository-local wrapper:

- `architectureImpact` tells you the declared entity blast radius
- `repositoryImpact` tells you any adapter-derived repo-local targets
- `suggestions` gives you structured actions before command rendering

The wrapper can then choose the exact verification commands to run for the current repository.
Legacy `commandPlan.commands` arrays are still present for compatibility, but new integrations should prefer the structured fields.

## 8. Add broader workflows when useful

```bash
npx anchored-spec discover --dry-run
npx anchored-spec drift
npx anchored-spec diff --base main --compat --policy
```

## Read Next

- [choosing-a-modeling-approach.md](choosing-a-modeling-approach.md)
- [catalog-bootstrap.md](catalog-bootstrap.md)
- [obsidian-and-anchored-spec.md](obsidian-and-anchored-spec.md)
- [top-down-authoring.md](top-down-authoring.md)
- [bottom-up-discovery.md](bottom-up-discovery.md)
- [repository-harness-pattern.md](repository-harness-pattern.md)
