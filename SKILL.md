# Anchored Spec — AI Agent Skill

> **Purpose:** Enforce spec-as-source enterprise architecture workflows when working in any codebase managed by [anchored-spec](https://github.com/idvexchange/anchored-spec).
>
> **Activation:** This skill activates when the project contains `.anchored-spec/config.json` with `"schemaVersion": "1.0"` or an `ea/` directory with YAML/JSON artifact files.
>
> **Agent compatibility:** Works with any AI coding agent (GitHub Copilot, Cursor, Cline, Windsurf, Aider, Continue, etc.). Drop this file into your project root or reference it from your agent's configuration.

---

## 1. Detection — Is This an Anchored-Spec Project?

Before applying these rules, check for:

```
.anchored-spec/config.json   <- primary indicator (must have "schemaVersion": "1.0")
ea/systems/                   <- EA systems artifacts
ea/delivery/                  <- EA delivery artifacts
ea/data/                      <- EA data artifacts
```

If none exist, this skill does not apply. Do not suggest initializing anchored-spec unless the user explicitly asks.

---

## 2. Core Principles

**Spec-as-Source:** EA artifacts are the generative authority for architecture. Generators produce derived files (OpenAPI stubs, K8s manifests, schemas) FROM EA artifacts. Where generation is not yet possible, EA artifacts are the authoritative reference against which reality is validated via drift detection.

**Bottom-Up Adoption:** Start by modeling what already exists (services, APIs, deployments) and work up to strategic business capabilities. Use `discover` to bootstrap artifacts from running systems.

**Declared > Observed > Inferred:** Artifacts with `confidence: "declared"` are human-reviewed truth. `"observed"` artifacts come from resolvers. `"inferred"` artifacts are discovery drafts. Never treat inferred artifacts as authoritative.

**JSON/YAML First:** Machine-readable JSON or YAML is the source of truth. Markdown and other documentation formats are generated — never hand-edited.

---

## 3. Artifact Structure

Every EA artifact follows the unified base shape:

```yaml
# ea/systems/APP-order-service.yaml
apiVersion: anchored-spec/ea/v1
kind: application
id: APP-order-service
metadata:
  name: Order Service
  summary: Processes customer orders
  owners: ["team-commerce"]
  tags: ["core", "revenue"]
  confidence: declared
  status: active
anchors:
  symbols: ["OrderController"]
  apis: ["POST /api/v2/orders"]
  schemas: ["orders"]
  infra: []
relations:
  - type: dependsOn
    target: APP-inventory-service
  - type: ownedBy
    target: CAP-order-management
```

**Key rules:**
- `id` uses the format `{KIND_PREFIX}-{kebab-slug}` (e.g., `APP-order-service`, `SVC-payment-api`, `STORE-orders-db`)
- `kind` must be a registered EA kind (see Section 4)
- `anchors` map the artifact to actual code/config locations — each category is a flat string array (e.g., `symbols: ["ClassName"]`, `apis: ["POST /orders"]`). Valid categories: `symbols`, `apis`, `events`, `schemas`, `infra`, `catalogRefs`, `iam`, `network`, `other`
- `relations` are stored in the canonical direction only; inverses are computed virtually

---

## 4. Kind Taxonomy

48 kinds across 6 domains:

| Domain | Kind | ID Prefix | Description |
|---|---|---|---|
| **systems** | `application` | `APP` | A deployable software system |
| **systems** | `service` | `SVC` | A runtime service component |
| **systems** | `api-contract` | `API` | An API specification (REST, GraphQL, gRPC) |
| **systems** | `event-contract` | `EVT` | An async event/message contract |
| **systems** | `integration` | `INT` | A declared integration between two systems |
| **systems** | `system-interface` | `SIF` | An external system boundary interface |
| **systems** | `consumer` | `CON` | A declared consumer of an API or event |
| **delivery** | `platform` | `PLAT` | A runtime platform (K8s cluster, serverless) |
| **delivery** | `deployment` | `DEPLOY` | A deployed instance of an application |
| **delivery** | `runtime-cluster` | `CLUSTER` | A compute cluster |
| **delivery** | `network-zone` | `ZONE` | A network security zone |
| **delivery** | `identity-boundary` | `IDB` | An identity/auth boundary |
| **delivery** | `cloud-resource` | `CLOUD` | A specific cloud resource |
| **delivery** | `environment` | `ENV` | A deployment environment |
| **systems** | `security-requirement` | `SREQ` | NIST security requirement (SP 800-53 controls) |
| **delivery** | `technology-standard` | `TECH` | An approved technology standard |
| **delivery** | `technical-requirement` | `TREQ` | NIST technical requirement (infrastructure) |
| **data** | `logical-data-model` | `LDM` | Logical data model with entity attributes |
| **data** | `physical-schema` | `SCHEMA` | Physical database schema definition |
| **data** | `data-store` | `STORE` | A data storage system |
| **data** | `lineage` | `LINEAGE` | A data lineage path |
| **data** | `master-data-domain` | `MDM` | A master data domain |
| **data** | `data-quality-rule` | `DQR` | A data quality rule |
| **data** | `data-product` | `DPROD` | A data product with SLAs |
| **data** | `data-requirement` | `DREQ` | NIST data requirement (FIPS 199 categorization) |
| **information** | `information-concept` | `IC` | A high-level information concept |
| **information** | `canonical-entity` | `CE` | A canonical data entity with typed attributes |
| **information** | `information-exchange` | `EXCH` | An information exchange between systems |
| **information** | `classification` | `CLASS` | A data classification level |
| **information** | `retention-policy` | `RET` | A data retention policy |
| **information** | `glossary-term` | `TERM` | A canonical glossary term |
| **information** | `information-requirement` | `IREQ` | NIST information requirement (flow/sensitivity) |
| **business** | `mission` | `MISSION` | A strategic mission with key results |
| **business** | `capability` | `CAP` | A business capability |
| **business** | `value-stream` | `VS` | A value stream with stages |
| **business** | `process` | `PROC` | A business process |
| **business** | `org-unit` | `ORG` | An organizational unit |
| **business** | `policy-objective` | `POL` | A policy objective |
| **business** | `business-service` | `BSVC` | A business service |
| **business** | `control` | `CTRL` | A governance control |
| **business** | `requirement` | `REQ` | A behavioral requirement (EARS format) |
| **transitions** | `baseline` | `BASELINE` | A point-in-time architecture snapshot |
| **transitions** | `target` | `TARGET` | A desired future architecture state |
| **transitions** | `transition-plan` | `PLAN` | A plan from baseline to target |
| **transitions** | `migration-wave` | `WAVE` | A batch of changes in a transition |
| **transitions** | `exception` | `EXCEPT` | An approved exception to policy |
| **transitions** | `change` | `CHG` | A change record (NIST config management) |
| **transitions** | `decision` | `ADR` | An architecture decision record (NIST traceability) |

---

## 5. Workflow — Create

When a user asks to create a new EA artifact:

1. **Determine the kind** — Ask which domain and kind the artifact represents
2. **Generate the ID** — Use the appropriate prefix from the kind taxonomy
3. **Fill the base shape** — Include all required fields: `apiVersion`, `kind`, `id`, `metadata` (name, summary, owners, confidence, status)
4. **Add anchors** — If the artifact maps to code, add `anchors` with at least one anchor type
5. **Add relations** — Link to related artifacts using canonical direction relation types
6. **Place the file** — Save to `ea/{domain}/{ID}.yaml`

```bash
npx anchored-spec create --kind application --id APP-my-service
npx anchored-spec validate
```

---

## 6. Workflow — Validate

When making changes to EA artifacts, always validate:

```bash
npx anchored-spec validate                    # All artifacts
npx anchored-spec validate --domain systems   # One domain
```

Validation checks:
- Schema compliance (required fields, valid kind, valid status)
- ID format matches kind prefix
- Relation targets exist
- No duplicate IDs
- Owners are non-empty for active artifacts
- Anchors reference existing files (warning if file not found)

---

## 7. Workflow — Drift Detection

Run drift detection to compare declared architecture with reality:

```bash
npx anchored-spec drift                       # All domains
npx anchored-spec drift --domain systems      # One domain
npx anchored-spec drift --severity error      # Only errors
npx anchored-spec drift --from-snapshot snap1 # Compare against snapshot
```

42 drift rules across 6 categories. Representative examples:

| Category | Rule | What it catches |
|---|---|---|
| systems | `ea:systems/consumer-contract-version-mismatch` | Consumer references an outdated contract version |
| systems | `ea:systems/technology-standard-violation` | System uses a non-approved technology |
| data | `ea:data/lineage-stale` | Lineage path hasn't been verified recently |
| data | `ea:data/orphan-store` | Data store not referenced by any application |
| information | `ea:information/classification-not-propagated` | Classification not applied to downstream stores |
| business | `ea:business/orphan-capability` | Capability not linked to any value stream |
| business | `ea:business/control-missing-evidence` | Governance control has no evidence attached |
| transitions | `ea:transition/baseline-stale` | Baseline snapshot is outdated |
| exception | `ea:exception/expired` | Exception past its expiry date |

---

## 8. Workflow — Discovery

Use discovery to bootstrap EA artifacts from existing systems:

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml
npx anchored-spec discover --resolver kubernetes --source ~/.kube/config
npx anchored-spec discover --resolver terraform --source ./infrastructure/
npx anchored-spec discover --resolver sql-ddl --source ./migrations/
npx anchored-spec discover --resolver dbt --source ./dbt/models/
```

Discovery rules:
- Always creates artifacts with `confidence: "inferred"` or `"observed"`
- Never overwrites existing artifacts
- Produces a discovery report showing: new artifacts found, matches, suggested relations
- Human must review and promote drafts to `confidence: "declared"` before they become authoritative

---

## 9. Workflow — Generation

Generate derived files from EA artifacts:

```bash
npx anchored-spec generate                    # All generators
npx anchored-spec generate --type openapi     # Specific generator
npx anchored-spec generate --check            # Dry run — check for divergence
```

Generation rules:
- Generated files are derived outputs, not sources
- Never manually edit generated files — edit the EA artifact instead
- `generate --check` in CI ensures generated files stay in sync
- Generator plugins implement the `EaGenerator` interface

---

## 10. Relation Types

28 relation types. Use only canonical (forward) directions when declaring relations. Inverses are computed automatically.

| Canonical | Inverse (Virtual) |
|---|---|
| `realizes` | `realizedBy` |
| `uses` | `usedBy` |
| `exposes` | `exposedBy` |
| `consumes` | `consumedBy` |
| `dependsOn` | `dependedOnBy` |
| `deploys` | `deployedBy` |
| `runsOn` | `runs` |
| `boundedBy` | `bounds` |
| `authenticatedBy` | `authenticates` |
| `deployedTo` | `hosts` |
| `interfacesWith` | `interfacedBy` |
| `standardizes` | `standardizedBy` |
| `providedBy` | `provides` |
| `stores` | `storedIn` |
| `hostedOn` | `hostsData` |
| `lineageFrom` | `lineageTo` |
| `implementedBy` | `implements` |
| `classifiedAs` | `classifies` |
| `exchangedVia` | `exchanges` |
| `retainedUnder` | `retains` |
| `supports` | `supportedBy` |
| `performedBy` | `performs` |
| `governedBy` | `governs` |
| `owns` | `ownedBy` |
| `supersedes` | `supersededBy` |
| `generates` | `generatedBy` |
| `mitigates` | `mitigatedBy` |
| `targets` | `targetedBy` |

---

## 11. Quality Rules

When creating or modifying EA artifacts, enforce these rules:

| Rule | Severity | Condition |
|---|---|---|
| `ea:active-needs-owner` | error | Active artifacts must have at least one owner |
| `ea:active-needs-anchor` | warning | Active systems/delivery/data artifacts should have at least one anchor |
| `ea:id-format` | error | ID must match `{PREFIX}-{kebab-slug}` for its kind |
| `ea:relation-target-exists` | error | Relation targets must reference existing artifact IDs |
| `ea:no-self-relation` | error | An artifact cannot relate to itself |
| `ea:confidence-promotion` | warning | Inferred artifacts should be promoted or deleted within 30 days |
| `ea:exception-expiry` | warning | Exception artifacts past their expiry date |
| `ea:generated-file-modified` | warning | Generated files should not be manually edited |

---

## 12. Lifecycle Rules

Status transitions follow a defined lifecycle:

```
draft -> planned -> active -> shipped -> deprecated -> retired
                                       \-> deferred
```

Valid statuses: `draft`, `planned`, `active`, `shipped`, `deprecated`, `retired`, `deferred`

- `draft`: Initial creation; may have incomplete metadata
- `planned`: Approved but not yet implemented
- `active`: Production use; full metadata required
- `shipped`: Delivered and verified
- `deprecated`: Still running but scheduled for removal
- `retired`: No longer in service; kept for history
- `deferred`: Postponed to a future iteration

**Rules:**
- Moving to `active` requires: owners, summary, and at least one anchor (for anchorable kinds)
- Moving to `deprecated` requires: a linked transition plan or exception
- Moving to `retired` requires: no active `dependsOn` relations pointing to this artifact

---

## 13. Command Reference

| Command | Description |
|---|---|
| `init` | Initialize project with v1.0 config |
| `create` | Create a new EA artifact from template |
| `validate` | Validate all EA artifacts against schemas and rules |
| `verify` | Run all validation + drift + quality checks (comprehensive) |
| `drift` | Run drift detection (supports `--from-snapshot`, `--domain`, `--severity`) |
| `discover` | Discover artifacts from resolvers (openapi, kubernetes, terraform, sql-ddl, dbt) |
| `generate` | Generate derived files from EA artifacts (OpenAPI, JSON Schema) |
| `graph` | Export the relation graph (Mermaid, DOT, JSON; supports `--kind`, `--focus`, `--domain`) |
| `impact` | Analyze transitive impact of changes to an artifact |
| `report` | Generate reports (system-data-matrix, capability-map, gap-analysis, exceptions, drift-heatmap) |
| `evidence` | Manage EA evidence collection |
| `status` | Show artifact lifecycle status dashboard |
| `transition` | Manage artifact status transitions |

---

## 14. Before Claiming Completion

Before telling the user a task is complete, **always** run:

```bash
npx anchored-spec validate
```

If it fails, fix the issues. Additionally:

- After any code change touching declared `anchors` -> run `npx anchored-spec drift`
- After creating/editing artifact files -> run `npx anchored-spec validate`
- After all changes -> run `npx anchored-spec generate --check` if generators are configured

---

## 15. Anti-Patterns

### Do not model everything at once

Start with 5-10 critical services. Expand outward as the team builds confidence.

### Do not skip discovery for brownfield

For existing systems, always start with `discover` to bootstrap artifacts. Manual creation from scratch is error-prone and slow.

### Do not leave artifacts at `inferred` confidence

Inferred artifacts are drafts. They do not participate in drift detection. Review and promote them to `declared` within 30 days.

### Do not manually edit generated files

Generated files are derived outputs. Edit the source EA artifact, then regenerate. Manual edits will be overwritten.

### Do not create bidirectional relations

Only declare the canonical direction. Inverses are computed automatically. Declaring both creates duplicate edges.

### Do not use blanket exceptions

Scope exceptions to specific artifact IDs and specific rules. Never create an exception with empty scope.

### Do not ignore the transition domain

Architecture is not static. Use baselines, targets, and transition plans to manage strategic change. Without them, the EA model becomes a snapshot that drifts from reality.

---

## 16. Integration Guide

### GitHub Copilot

Add to `.github/copilot-instructions.md`:

```markdown
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Cursor

Add to `.cursorrules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Cline / Roo Code

Reference in `.clinerules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Windsurf

Reference in `.windsurfrules`:

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Claude Code (CLAUDE.md)

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

### Generic / Other Agents

Any agent that reads project-root markdown files will pick up `SKILL.md` automatically. For agents that support custom instructions, point them to this file.
