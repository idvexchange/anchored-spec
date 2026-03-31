# Backstage Manifest Mode Example

This example shows anchored-spec with Backstage entity format in **manifest mode** — all entities in a single `catalog-info.yaml` file.

## Structure

```
.anchored-spec/config.json   # Config with entityMode: "manifest"
catalog-info.yaml             # Multi-document YAML with all entities
```

## Entities

| Kind | Name | Description |
|---|---|---|
| Domain | identity | Identity verification domain |
| System | idv-platform | Core IDV platform |
| Component | auth-service | Authentication microservice |
| API | auth-api | OpenAPI authentication endpoint |
| Resource | users-db | PostgreSQL user database |
| Group | platform-team | Owner team |
| Requirement | req-mfa-enforcement | MFA security requirement |
| Decision | adr-001-grpc-internal | Architecture decision record |

## Usage

```bash
cd examples/backstage-manifest
npx anchored-spec validate
npx anchored-spec graph
npx anchored-spec report
```
