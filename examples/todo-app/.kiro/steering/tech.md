# Technology Context

## Stack
- **Framework**: anchored-spec (npm package)
- **Artifact format**: YAML and JSON with JSON Schema validation
- **CLI**: `npx anchored-spec <command>`
- **6 resolvers**: OpenAPI, Kubernetes, Terraform, SQL DDL, dbt, Tree-sitter
- **42 drift rules** across 7 domains

## Conventions
- Artifact IDs: `{PREFIX}-{slug}` (e.g., APP-todo-web)
- File naming: `{PREFIX}-{slug}.yaml` in domain directories
- Relations: typed edges between artifacts (27 relation types)
- Confidence levels: declared > observed > inferred
