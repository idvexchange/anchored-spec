# Backstage Manifest Example

This example shows the recommended manifest-based authoring flow in anchored-spec.

## What this example demonstrates

- Backstage-aligned entities stored in `catalog-info.yaml`
- built-in kinds such as `Domain`, `System`, `Component`, `API`, `Resource`, and `Group`
- anchored-spec custom kinds such as `Requirement` and `Decision`
- canonical entity refs across relations
- entity-native metadata through `anchored-spec.dev/*` annotations

## Files

```text
examples/backstage-manifest/
├── .anchored-spec/config.json
└── catalog-info.yaml
```

## Included entities

This example models a small identity platform with:

- a domain
- a system
- a service component
- an API
- a database resource
- a team
- a requirement
- a decision

## Try it

From the repository root:

```bash
npx anchored-spec --cwd examples/backstage-manifest validate
npx anchored-spec --cwd examples/backstage-manifest graph --format mermaid
npx anchored-spec --cwd examples/backstage-manifest report --view traceability-index
npx anchored-spec --cwd examples/backstage-manifest diff --base main
```

## Why manifest mode is useful

Manifest mode works well when a team wants:

- a single architecture catalog file
- explicit YAML review in pull requests
- easy export into Backstage-compatible descriptor flows
- a clean split between architecture data and prose documentation
