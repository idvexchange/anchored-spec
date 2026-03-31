# Backstage Entity Model Alignment

Anchored-spec supports the [Backstage Software Catalog Entity Model](https://backstage.io/docs/features/software-catalog/descriptor-format/) as an entity format, enabling seamless integration with Backstage catalogs while retaining all anchored-spec analysis capabilities.

## Quick Start

Initialize a project in Backstage manifest mode:

```bash
npx anchored-spec init --format backstage --mode manifest --with-examples
```

Or inline frontmatter mode:

```bash
npx anchored-spec init --format backstage --mode inline --with-examples
```

## Storage Modes

### Manifest Mode (`--mode manifest`)

Entities are stored in a multi-document YAML file (default: `catalog-info.yaml`):

```yaml
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  description: Main service
  annotations:
    anchored-spec.dev/confidence: "0.9"
    anchored-spec.dev/source: src/main.ts
spec:
  type: service
  lifecycle: production
  owner: team-platform
  system: core-platform
  dependsOn:
    - resource:default/my-database
---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: users-api
spec:
  type: openapi
  lifecycle: production
  owner: team-platform
  definition: |
    openapi: "3.1.0"
```

### Inline Mode (`--mode inline`)

Each entity is embedded as YAML frontmatter in a markdown documentation file:

```markdown
---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: my-service
  description: Main service
spec:
  type: service
  lifecycle: production
  owner: team-platform
---

# My Service

Architecture documentation lives here alongside the entity definition.
```

### Legacy Artifacts Mode (default)

The original per-file YAML/JSON artifacts in domain directories. This mode is unchanged and remains the default.

## Configuration

Add these fields to `.anchored-spec/config.json`:

```json
{
  "schemaVersion": "1.0",
  "entityMode": "manifest",
  "entityFormat": "backstage",
  "manifestPath": "catalog-info.yaml",
  "catalogDir": "catalog",
  "rootDir": "ea",
  "generatedDir": "ea/generated"
}
```

| Field | Values | Description |
|---|---|---|
| `entityMode` | `artifacts`, `manifest`, `inline` | How entities are stored on disk |
| `entityFormat` | `backstage`, `legacy` | Entity format |
| `manifestPath` | string | Path to manifest file (manifest mode) |
| `catalogDir` | string | Directory with individual entity YAML files |
| `inlineDocDirs` | string[] | Directories with markdown entity files |

## Kind Mapping

Anchored-spec's 48 legacy kinds map to ~16 Backstage-aligned kinds across two tiers.

### Tier 1 — Backstage Built-in Kinds (`backstage.io/v1alpha1`)

| Kind | `spec.type` | Legacy Kinds |
|---|---|---|
| `Component` | `service`, `library`, `website`, `worker`, `data-pipeline` | `service`, `application`, `consumer`, `platform` |
| `API` | `openapi`, `asyncapi`, `grpc`, `graphql` | `api-contract`, `event-contract` |
| `Resource` | `database`, `s3-bucket`, `queue`, `cache`, etc. | `cloud-resource`, `physical-schema`, `data-store`, `data-product`, `runtime-cluster`, `network-zone` |
| `System` | — | Groups components |
| `Domain` | — | Groups systems |
| `Group` | `team`, `department`, `org` | `org-unit` |

### Tier 2 — Custom Kinds (`anchored-spec.dev/v1alpha1`)

| Kind | Legacy Kinds |
|---|---|
| `Requirement` | `requirement`, `security-requirement`, `data-requirement`, `technical-requirement`, `information-requirement` |
| `Decision` | `decision` |
| `CanonicalEntity` | `canonical-entity`, `information-concept`, `glossary-term`, `master-data-domain` |
| `Exchange` | `information-exchange`, `integration` |
| `Capability` | `capability` |
| `ValueStream` | `value-stream`, `process` |
| `Mission` | `mission`, `policy-objective` |
| `Technology` | `technology-standard` |
| `SystemInterface` | `system-interface`, `identity-boundary` |
| `Control` | `control` |
| `TransitionPlan` | `transition-plan`, `migration-wave` |
| `Exception` | `exception` |

Kind discrimination uses `spec.type` — e.g., a Component with `spec.type: service` maps to the legacy `service` kind.

## Relation Mapping

Relations are stored in `spec` fields following Backstage conventions:

| Spec Field | Backstage Relation | Legacy Relation |
|---|---|---|
| `spec.dependsOn` | `dependsOn` | `depends-on` |
| `spec.owner` (+ `ownedBy`) | `ownerOf` / `ownedBy` | `owns` |
| `spec.providesApis` | `providesApi` | `exposes` |
| `spec.consumesApis` | `consumesApi` | `consumes` |
| `spec.system` | `partOf` | `part-of` |

Custom anchored-spec relations (e.g., `implementedBy`, `supports`, `realizes`) are stored as custom spec fields.

## Annotations

Anchored-spec uses the `anchored-spec.dev/` annotation namespace:

| Annotation | Purpose |
|---|---|
| `anchored-spec.dev/source` | Source file path for anchor resolution |
| `anchored-spec.dev/confidence` | Confidence score (0.0–1.0) |
| `anchored-spec.dev/expect-anchors` | Expected anchor types (comma-separated) |
| `anchored-spec.dev/compliance` | Compliance frameworks (comma-separated) |
| `anchored-spec.dev/risk` | Risk assessment (low, moderate, high, critical) |
| `anchored-spec.dev/suppress` | Suppressed validation rules |

## Markdown Decorators

Both `@ea:` and `@anchored-spec:` decorator prefixes are supported:

```html
<!-- @anchored-spec:events webhook-events -->
| Event | Payload | Description |
|---|---|---|
| user.created | UserPayload | New user registered |
<!-- @anchored-spec:end -->
```

## Backstage Integration

Entities authored in anchored-spec's Backstage format are directly consumable by Backstage's Software Catalog. Point your Backstage `app-config.yaml` at the manifest:

```yaml
catalog:
  locations:
    - type: file
      target: ../../catalog-info.yaml
```

Custom `anchored-spec.dev/v1alpha1` kinds require a [Custom Processor](https://backstage.io/docs/features/software-catalog/extending-the-model/) in your Backstage instance to be fully rendered, but they will still appear as unresolved entities without one.
