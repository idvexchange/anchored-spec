---
ea-entities:
  - api:default/anchored-spec-cli-api
---

# CLI API

The Anchored Spec CLI is the main user-facing API of the framework. It is implemented in `src/cli/index.ts` and the command modules under `src/cli/commands/`.

## Command Families

### Setup and scaffolding

- `init`
- `create`
- `create-doc`
- `link`
- `batch-update`

### Validation and traceability

- `validate`
- `verify`
- `trace`
- `link-docs`

### Discovery and drift

- `discover`
- `drift`
- `generate`

### Review and analysis

- `graph`
- `diagrams`
- `report`
- `impact`
- `constraints`
- `context`
- `search`
- `status`

### Governance and lifecycle

- `diff`
- `transition`
- `evidence`
- `reconcile`

## Interface Characteristics

- designed for local repository execution
- markdown-friendly by default
- JSON-capable where automation needs structured output
- built around canonical entity refs
- testable because commands throw `CliError` instead of calling `process.exit()` directly

## Examples

```bash
npx anchored-spec validate
npx anchored-spec discover --resolver openapi --source ./openapi.yaml
npx anchored-spec diff --base main --compat --policy
npx anchored-spec context component:default/orders-service --tier llm
```

## Source of Truth

The exact command registration surface is `src/cli/index.ts`.
