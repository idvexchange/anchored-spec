# Reporting and Analysis

Anchored Spec provides several review surfaces over the same entity graph.

## Use `graph` for

- raw relation topology
- quick structural review

## Use `diagrams render` for

- semantic architecture diagrams
- focused reviewer views

## Use `report` for

- named report projections such as:
  - `system-data-matrix`
  - `classification-coverage`
  - `capability-map`
  - `exceptions`
  - `drift-heatmap`
  - `traceability-index`

## Use `impact` and `constraints` for

- downstream effect analysis
- governing decisions or requirement paths
- suggestion-oriented verification handoff into repo-native command plans via `impact --with-commands`
- a clean split between architecture impact and optional repository-evidence targets

`impact --with-commands --format json` now carries:

- `architectureImpact` for declared entity blast radius
- `repositoryImpact` for adapter-derived repo-local targets
- `suggestions` for structured, intent-first actions before command rendering

Example `v1.2` config for a non-Node adapter:

```json
{
  "schemaVersion": "1.2",
  "repositoryEvidence": {
    "adapters": [
      { "path": "tools/repository-evidence/service-units.mjs" }
    ]
  }
}
```

That adapter can then expose repository-local targets and rendered commands without changing the architecture model itself.

The default `node-workspaces` adapter is only one implementation. Repositories can disable it, replace it, or add a custom adapter when their execution model is not Node-based.

For component-to-code linkage, prefer `anchored-spec.dev/code-location` as the stable architecture pointer and treat adapter output or file anchors as supporting repository evidence.

## Use `context` for

- AI-ready context packages
- deeper entity-centric review bundles
- optional path-aware doc narrowing via workflow policy and `context --focus-path`
