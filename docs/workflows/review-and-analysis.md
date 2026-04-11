# Review And Analysis

Anchored Spec provides several review surfaces over the same entity graph.

## Use `trace` and `context` for

- direct dependency and dependent inspection
- entity-centric review context
- AI-ready context bundles
- path-aware doc narrowing with `context --focus-path` when a repository uses workflow policy read-first rules

## Use `graph` and `diagrams render` for

- quick structural review
- semantic architecture diagrams
- focused reviewer views in markdown-friendly output

## Use `report` for

- named projections such as:
  - `system-data-matrix`
  - `classification-coverage`
  - `capability-map`
  - `exceptions`
  - `drift-heatmap`
  - `traceability-index`

## Use `impact` and `constraints` for

- downstream effect analysis
- decision and requirement path review
- suggestion-oriented handoff into repo-local verification

`impact --with-commands --format json` should be treated as a control-plane handoff, not the final execution plan.

Prefer:

- `architectureImpact` for declared entity blast radius
- `repositoryImpact` for adapter-derived repo-local targets
- `suggestions` for structured next actions before command rendering

Repositories can then decide:

- focused versus broader verification
- exact command rendering
- mutating follow-up actions

## Use `diff --compat --policy` for

- semantic compatibility review
- policy-aware architectural changes
- change sets where lifecycle or contract compatibility matters

## Recommended review loop

```bash
npx anchored-spec search orders
npx anchored-spec trace component:default/orders-service
npx anchored-spec context component:default/orders-service --tier llm
npx anchored-spec impact component:default/orders-service --with-commands --format json
npx anchored-spec constraints component:default/orders-service --format markdown
npx anchored-spec diff --base main --compat --policy
```

## Code-linkage rule

For component-to-code linkage, prefer one primary `anchored-spec.dev/code-location` per top-level component. Treat file anchors, symbols, tests, and adapter output as supporting evidence.
