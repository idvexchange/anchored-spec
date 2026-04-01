# Implementation Guide

This guide walks through adopting anchored-spec in a repository from zero to a useful day-to-day architecture workflow.

## 1. Install

```bash
pnpm add -D anchored-spec
```

## 2. Initialize the project

Choose a storage mode.

### Manifest mode

```bash
npx anchored-spec init --mode manifest --with-examples
```

### Inline mode

```bash
npx anchored-spec init --mode inline --with-examples
```

Initialization creates `.anchored-spec/config.json` and can optionally add example files, AI helper files, IDE integration, and CI scaffolding.

## 3. Understand the generated config

A minimal config looks like this:

```json
{
  "schemaVersion": "1.0",
  "rootDir": "ea",
  "generatedDir": "ea/generated",
  "entityMode": "manifest",
  "manifestPath": "catalog-info.yaml"
}
```

Common fields:

- `entityMode` — `manifest` or `inline`
- `manifestPath` — main manifest file in manifest mode
- `catalogDir` — extra YAML directory loaded alongside the manifest
- `inlineDocDirs` — Markdown directories scanned in inline mode
- `resolvers` — configured discovery/observation sources
- `workflowPolicyPath` — workflow and transition policy file

## 4. Create your first entities

```bash
npx anchored-spec create application --title "Orders Service"
npx anchored-spec create api-contract --title "Orders API"
```

The create command maps anchored-spec creation kinds onto the current entity model and writes files using the project's active storage mode.

After creation, validate immediately.

```bash
npx anchored-spec validate
```

## 5. Add documentation and traceability

If you use inline mode, the entity and the architecture document already live together.

If you use manifest mode, create a linked document:

```bash
npx anchored-spec create-doc architecture component:default/orders-service --title "Orders Service Architecture"
```

Then keep trace references synchronized:

```bash
npx anchored-spec link-docs --sync
npx anchored-spec trace --summary
```

## 6. Configure discovery

Resolvers can be configured in `.anchored-spec/config.json`.

```json
{
  "resolvers": [
    { "name": "openapi" },
    { "name": "markdown" },
    { "name": "tree-sitter", "options": { "queryPacks": ["javascript"] } }
  ]
}
```

Then run:

```bash
npx anchored-spec discover
```

Or target a source explicitly:

```bash
npx anchored-spec discover --resolver openapi --source ./specs/orders-openapi.yaml
```

Treat discovered entities as draft inputs for human review.

## 7. Run the daily maintenance loop

A practical loop for active repositories is:

```bash
npx anchored-spec validate
npx anchored-spec drift
npx anchored-spec report --view drift-heatmap
npx anchored-spec trace --summary
```

Use these commands to keep the model healthy as code and docs evolve.

## 8. Use semantic change review

For pull-request review and release safety, use semantic diff.

```bash
npx anchored-spec diff --base main --compat --policy
```

This highlights structural, behavioral, governance, and contractual changes rather than just text changes.

## 9. Use reconcile for a fuller gate

Reconcile runs multiple workflows together.

```bash
npx anchored-spec reconcile --include-trace --include-docs
```

A typical reconcile pass can include:

- generation
- validation
- drift
- trace checks
- documentation fact consistency

## 10. Add reports and evidence

Generate focused views for reviewers:

```bash
npx anchored-spec report --view system-data-matrix
npx anchored-spec report --view capability-map
npx anchored-spec report --all --output-dir reports
```

Ingest and check evidence:

```bash
npx anchored-spec evidence ingest --input reports/junit.xml --kind test
npx anchored-spec evidence validate
npx anchored-spec evidence summary
```

## 11. Automate in CI

Once the repo is stable, add a CI loop that runs:

- `validate`
- `drift`
- `diff --compat --policy` for PRs
- `reconcile` for deeper gates when needed

See [ea-ci-integration.md](ea-ci-integration.md) for concrete patterns.

## 12. Keep the model current

The framework works best when architecture is maintained continuously.

Good habits:

- create or update entities in the same PR as code changes
- keep trace refs current
- review inferred discoveries instead of letting them accumulate
- use report and drift output as maintenance signals, not just release gates
