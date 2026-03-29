# EA Unified Artifact Model

This document specifies the unified artifact base shape, ID scheme, status model, kind taxonomy, and subsumption path for migrating existing REQ/CHG/ADR artifacts into the EA model.

Read [ea-design-overview.md](./ea-design-overview.md) first for context and design decisions.

## Design Principles

1. **One base shape** — every artifact in the system (EA and legacy) shares a common structural base
2. **Kind-specific extensions** — each kind adds fields appropriate to its domain
3. **Subsumption-ready** — the base accommodates current REQ/CHG/ADR fields as kind-specific extensions
4. **Namespaced IDs** — collision-resistant, scoped identifiers
5. **Confidence tracking** — every artifact and relation tracks how it was established

## ID Scheme

### Format

All artifact IDs use the format:

```
{domain}/{kind-prefix}-{slug}
```

Examples:

```
systems/APP-order-service
systems/API-orders-api
systems/INT-billing-to-ledger
delivery/DEPLOY-order-service-prod
delivery/PLAT-kubernetes-prod
data/STORE-orders-postgres
data/LINEAGE-order-analytics
information/INFO-customer
business/CAP-order-fulfillment
transitions/PLAN-2026-modernize-orders
```

### Rules

- `domain` is one of: `systems`, `delivery`, `data`, `information`, `business`, `transitions`
- `kind-prefix` is a short uppercase code unique within the domain (see Kind Taxonomy below)
- `slug` is a lowercase kebab-case human-readable identifier
- the combination of `domain/kind-prefix-slug` is globally unique within the repository
- for backward compatibility, legacy IDs (`REQ-1`, `CHG-2025-0001-slug`, `ADR-1`) continue to work and are treated as belonging to a `legacy` domain until migrated

### Configuration

An optional `ea.idPrefix` in config can scope IDs for organizational context:

```json
{
  "ea": {
    "idPrefix": "acme"
  }
}
```

When set, fully qualified IDs become `acme/systems/APP-order-service`. The prefix is optional for local references within the same repository. Cross-repository references (future) must use the fully qualified form.

### Short ID References

Within relations and other intra-repo references, the domain prefix may be omitted if unambiguous:

```json
{ "type": "realizes", "target": "business/CAP-order-fulfillment" }
```

If only one artifact has the slug `CAP-order-fulfillment`, the domain prefix can be omitted:

```json
{ "type": "realizes", "target": "CAP-order-fulfillment" }
```

The loader resolves short IDs to fully qualified IDs during loading. Ambiguous short IDs produce a validation error.

## Unified Artifact Base Shape

Every artifact in the system shares this base:

```typescript
export interface ArtifactBase {
  /** Fully qualified ID: {domain}/{kind-prefix}-{slug} */
  id: string;

  /** Schema version for migration tracking */
  schemaVersion: string;

  /** The artifact kind — determines which kind-specific fields are valid */
  kind: string;

  /** Human-readable title */
  title: string;

  /** Lifecycle status */
  status: ArtifactStatus;

  /** Brief description of what this artifact represents */
  summary: string;

  /** Owning teams or individuals */
  owners: string[];

  /** How this artifact was established */
  confidence: ArtifactConfidence;

  /** Free-form tags for filtering and grouping */
  tags?: string[];

  /** Typed relationships to other artifacts */
  relations?: Relation[];

  /** Anchors to observable systems (code, APIs, infra, etc.) */
  anchors?: Anchors;

  /** Links to external documents, wikis, diagrams */
  traceRefs?: TraceRef[];

  /** IDs of artifacts this depends on */
  dependsOn?: string[];

  /** Risk assessment */
  risk?: RiskAssessment;

  /** Compliance and governance metadata */
  compliance?: ComplianceMetadata;

  /** Open extension point for project-specific fields */
  extensions?: Record<string, unknown>;
}
```

### Status Model

```typescript
export type ArtifactStatus =
  | "draft"        // Created but not yet reviewed or active
  | "planned"      // Approved for future implementation
  | "active"       // Currently in effect
  | "shipped"      // Delivered and operational (used by requirement/change kinds)
  | "deprecated"   // Marked for removal, still operational
  | "retired"      // No longer operational
  | "deferred";    // Postponed (used by requirement kind)
```

Status transitions:

```
draft → planned → active → shipped → deprecated → retired
                    ↓                      ↑
                    └──────────────────────┘ (direct deprecation)
draft → deferred → planned (resume)
```

The `shipped` and `deferred` statuses exist primarily for backward compatibility with the current `Requirement` status model. EA-native kinds typically use `draft → active → deprecated → retired`.

### Confidence Model

```typescript
export type ArtifactConfidence =
  | "declared"    // Authored by a human, reviewed and intentional
  | "observed"    // Derived from an authoritative external source (API catalog, cloud inventory)
  | "inferred";   // Generated by discovery heuristics, needs human review
```

Default for manually created artifacts: `"declared"`.
Default for `ea discover` output: `"inferred"`.
Resolvers that pull from authoritative sources (e.g., K8s API) set `"observed"`.

### Anchors Model

The anchors object replaces and extends the current `SemanticRefs` model. It provides anchor points that resolvers and generators use to bind specs to observable systems.

```typescript
export interface Anchors {
  /** Code symbols: class names, function names, exported constants */
  symbols?: string[];

  /** API endpoints: "POST /orders", "GET /orders/:id" */
  apis?: string[];

  /** Event topics/types: "order.created", "payment.processed" */
  events?: string[];

  /** Schema references: "OrderSchema", "orders.order" */
  schemas?: string[];

  /** Infrastructure references: "terraform:module.order_service", "kubernetes:deployment/order-service" */
  infra?: string[];

  /** Catalog references: "service:order-service", "dataset:orders" */
  catalogRefs?: string[];

  /** IAM references: "aws:iam-role/order-service" */
  iam?: string[];

  /** Network references: "aws:security-group/sg-12345" */
  network?: string[];

  /** Extensible anchors for tools not covered above */
  other?: Record<string, string[]>;
}
```

### Mapping from SemanticRefs to Anchors

For subsumption, the current `SemanticRefs` maps directly:

| SemanticRefs field | Anchors field |
|---|---|
| `interfaces` | `symbols` |
| `routes` | `apis` |
| `errorCodes` | `symbols` (prefixed with `error:`) |
| `symbols` | `symbols` |
| `schemas` | `schemas` |
| `other.*` | `other.*` |

The migration tool handles this mapping. During the transition period, both `semanticRefs` and `anchors` are accepted on legacy kinds, with `semanticRefs` taking precedence for backward compatibility.

### TraceRef

```typescript
export interface TraceRef {
  /** Path to external document, URL, or artifact ID */
  path: string;
  /** Role of this trace link */
  role?: "specification" | "evidence" | "rationale" | "context" | "implementation" | "test";
  /** Human-readable label */
  label?: string;
}
```

### RiskAssessment

```typescript
export interface RiskAssessment {
  level: "low" | "medium" | "high" | "critical";
  description?: string;
  mitigations?: string[];
}
```

### ComplianceMetadata

```typescript
export interface ComplianceMetadata {
  frameworks?: string[];       // "SOC2", "HIPAA", "PCI-DSS"
  controls?: string[];         // References to control artifact IDs
  lastAuditedAt?: string;      // ISO 8601
  nextAuditDue?: string;       // ISO 8601
}
```

## Kind Taxonomy

Each kind belongs to a domain and has a short prefix used in IDs.

### Systems Domain (Phase A)

| Kind | Prefix | Description |
|---|---|---|
| `application` | `APP` | A deployable software system |
| `service` | `SVC` | A runtime service component within an application |
| `api-contract` | `API` | An API specification (REST, GraphQL, gRPC) |
| `event-contract` | `EVT` | An async event/message contract |
| `integration` | `INT` | A declared integration between two systems |
| `system-interface` | `SIF` | An external system boundary interface |
| `consumer` | `CON` | A declared consumer of an API or event |

### Delivery Domain (Phase A)

| Kind | Prefix | Description |
|---|---|---|
| `platform` | `PLAT` | A runtime platform (K8s cluster, serverless platform, etc.) |
| `deployment` | `DEPLOY` | A deployed instance of an application |
| `runtime-cluster` | `CLUSTER` | A compute cluster |
| `network-zone` | `ZONE` | A network security zone or boundary |
| `identity-boundary` | `IDB` | An identity/auth boundary |
| `cloud-resource` | `CLOUD` | A specific cloud resource (RDS instance, S3 bucket, etc.) |
| `environment` | `ENV` | A deployment environment (prod, staging, dev) |
| `technology-standard` | `TECH` | An approved technology standard |

### Data Domain (Phase B)

| Kind | Prefix | Description |
|---|---|---|
| `logical-data-model` | `LDM` | A logical data model or entity |
| `physical-schema` | `SCHEMA` | A physical database schema |
| `data-store` | `STORE` | A data storage system |
| `lineage` | `LINEAGE` | A data lineage/flow declaration |
| `master-data-domain` | `MDM` | A master data management domain |
| `data-quality-rule` | `DQR` | A data quality rule or check |
| `data-product` | `DPROD` | A data product declaration |

### Information Domain (Phase C)

| Kind | Prefix | Description |
|---|---|---|
| `information-concept` | `IC` | An abstract business information concept |
| `canonical-entity` | `CE` | A canonical entity definition |
| `information-exchange` | `EXCH` | An information exchange pattern |
| `classification` | `CLASS` | A data classification (PII, PHI, etc.) |
| `retention-policy` | `RET` | A data retention policy |
| `glossary-term` | `TERM` | A business glossary term |

### Business Domain (Phase D)

| Kind | Prefix | Description |
|---|---|---|
| `mission` | `MISSION` | An organizational mission statement |
| `capability` | `CAP` | A business capability |
| `value-stream` | `VS` | A value stream |
| `process` | `PROC` | A business process |
| `org-unit` | `ORG` | An organizational unit |
| `policy-objective` | `POL` | A policy objective |
| `business-service` | `BSVC` | A business service |
| `control` | `CTRL` | A governance control |

### Transitions Domain (Phase E)

| Kind | Prefix | Description |
|---|---|---|
| `baseline` | `BASELINE` | A point-in-time architecture snapshot |
| `target` | `TARGET` | A desired future architecture state |
| `transition-plan` | `PLAN` | A plan to move from baseline to target |
| `migration-wave` | `WAVE` | A batch of related changes within a transition |
| `exception` | `EXCEPT` | An approved exception to architecture policy |

### Legacy Kinds (Subsumption — Phase H)

| Kind | Prefix | Current Type | Description |
|---|---|---|---|
| `requirement` | `REQ` | `Requirement` | A behavioral software requirement (EARS) |
| `change` | `CHG` | `Change` | An implementation change record |
| `decision` | `ADR` | `Decision` | An architecture decision record |

## Kind-Specific Field Extensions

Each kind adds fields beyond the base shape. These are enforced by per-kind JSON schemas.

### `application` Kind

```json
{
  "id": "systems/APP-order-service",
  "schemaVersion": "1.0.0",
  "kind": "application",
  "title": "Order Service",
  "status": "active",
  "summary": "Primary system responsible for order orchestration.",
  "owners": ["platform-orders"],
  "confidence": "declared",
  "tags": ["orders", "core"],
  "relations": [
    { "type": "realizes", "target": "business/CAP-order-fulfillment" },
    { "type": "uses", "target": "data/STORE-orders-postgres" },
    { "type": "deployedTo", "target": "delivery/PLAT-kubernetes-prod" },
    { "type": "exposes", "target": "systems/API-orders-api" }
  ],
  "anchors": {
    "symbols": ["OrderService"],
    "apis": ["POST /orders", "GET /orders/:id"],
    "catalogRefs": ["service:order-service"]
  },
  "technology": {
    "language": "typescript",
    "framework": "nestjs",
    "runtime": "node"
  },
  "repository": "https://github.com/acme/order-service"
}
```

Kind-specific fields for `application`:

```typescript
export interface ApplicationArtifact extends ArtifactBase {
  kind: "application";
  technology?: {
    language?: string;
    framework?: string;
    runtime?: string;
  };
  repository?: string;
}
```

### `api-contract` Kind

```json
{
  "id": "systems/API-orders-api",
  "schemaVersion": "1.0.0",
  "kind": "api-contract",
  "title": "Orders API",
  "status": "active",
  "summary": "REST API for order management.",
  "owners": ["platform-orders"],
  "confidence": "declared",
  "relations": [
    { "type": "exposedBy", "target": "systems/APP-order-service" }
  ],
  "anchors": {
    "apis": ["POST /orders", "GET /orders/:id", "PUT /orders/:id/status"]
  },
  "protocol": "rest",
  "specFormat": "openapi",
  "specPath": "api/openapi.yaml",
  "version": "2.1.0"
}
```

Kind-specific fields for `api-contract`:

```typescript
export interface ApiContractArtifact extends ArtifactBase {
  kind: "api-contract";
  protocol?: "rest" | "graphql" | "grpc" | "soap";
  specFormat?: "openapi" | "graphql-sdl" | "protobuf" | "asyncapi" | "custom";
  specPath?: string;
  version?: string;
}
```

### `deployment` Kind

```json
{
  "id": "delivery/DEPLOY-order-service-prod",
  "schemaVersion": "1.0.0",
  "kind": "deployment",
  "title": "Order Service Production Deployment",
  "status": "active",
  "summary": "Production deployment of the order service.",
  "owners": ["platform-orders"],
  "confidence": "declared",
  "relations": [
    { "type": "deploys", "target": "systems/APP-order-service" },
    { "type": "runsOn", "target": "delivery/PLAT-kubernetes-prod" },
    { "type": "boundedBy", "target": "delivery/ZONE-private-services" },
    { "type": "authenticatedBy", "target": "delivery/IDB-workload-identity" }
  ],
  "anchors": {
    "infra": [
      "kubernetes:deployment/order-service",
      "terraform:module.order_service"
    ]
  },
  "environment": "prod",
  "replicas": 3,
  "resources": {
    "cpu": "500m",
    "memory": "512Mi"
  }
}
```

Kind-specific fields for `deployment`:

```typescript
export interface DeploymentArtifact extends ArtifactBase {
  kind: "deployment";
  environment?: string;
  replicas?: number;
  resources?: Record<string, string>;
}
```

### `data-store` Kind

```json
{
  "id": "data/STORE-orders-postgres",
  "schemaVersion": "1.0.0",
  "kind": "data-store",
  "title": "Orders Postgres",
  "status": "active",
  "summary": "Primary transactional store for orders.",
  "owners": ["data-platform"],
  "confidence": "declared",
  "relations": [
    { "type": "stores", "target": "data/LDM-order" },
    { "type": "hostedOn", "target": "delivery/PLAT-kubernetes-prod" }
  ],
  "anchors": {
    "schemas": ["orders.order"],
    "infra": ["terraform:aws_rds_cluster.orders"]
  },
  "technology": {
    "engine": "postgresql",
    "version": "15"
  }
}
```

### `canonical-entity` Kind

```json
{
  "id": "information/CE-order",
  "schemaVersion": "1.0.0",
  "kind": "canonical-entity",
  "title": "Order",
  "status": "active",
  "summary": "Canonical enterprise representation of an order.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "attributes": [
    { "name": "orderId", "type": "uuid", "required": true },
    { "name": "customerId", "type": "uuid", "required": true },
    { "name": "status", "type": "string", "required": true },
    { "name": "totalAmount", "type": "decimal", "required": true }
  ],
  "relations": [
    { "type": "classifiedAs", "target": "information/CLASS-pii" },
    { "type": "implementedBy", "target": "data/LDM-order" }
  ]
}
```

Kind-specific fields for `canonical-entity`:

```typescript
export interface CanonicalEntityArtifact extends ArtifactBase {
  kind: "canonical-entity";
  attributes?: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
    classification?: string;
  }>;
}
```

### `capability` Kind

```json
{
  "id": "business/CAP-order-fulfillment",
  "schemaVersion": "1.0.0",
  "kind": "capability",
  "title": "Order Fulfillment",
  "status": "active",
  "summary": "The enterprise can accept, validate, route, and fulfill customer orders.",
  "owners": ["operations"],
  "confidence": "declared",
  "relations": [
    { "type": "realizes", "target": "systems/APP-order-service", "criticality": "high" },
    { "type": "governedBy", "target": "business/POL-order-sla" },
    { "type": "performedBy", "target": "business/PROC-order-processing" }
  ],
  "level": 2,
  "parentCapability": "business/CAP-commerce"
}
```

Kind-specific fields for `capability`:

```typescript
export interface CapabilityArtifact extends ArtifactBase {
  kind: "capability";
  level?: number;
  parentCapability?: string;
}
```

### `transition-plan` Kind

```json
{
  "id": "transitions/PLAN-2026-modernize-orders",
  "schemaVersion": "1.0.0",
  "kind": "transition-plan",
  "title": "Modernize Order Platform",
  "status": "active",
  "summary": "Transition from monolithic order processing to service-based architecture.",
  "owners": ["enterprise-architecture"],
  "confidence": "declared",
  "baseline": "transitions/BASELINE-2026-q2",
  "target": "transitions/TARGET-2026-q4",
  "milestones": [
    {
      "id": "MS-1",
      "title": "Publish canonical order contract",
      "deliverables": ["information/CE-order", "systems/API-orders-api"],
      "generates": ["legacy/CHG-2026-0010-order-contract"]
    }
  ],
  "riskRegister": [
    {
      "id": "RISK-1",
      "description": "Legacy order database schema cannot support new entity model",
      "likelihood": "medium",
      "impact": "high",
      "mitigation": "Parallel write strategy during migration"
    }
  ],
  "approvalPolicy": {
    "requiredApprovers": ["enterprise-architecture", "platform-orders"],
    "approvedAt": "2026-03-15T10:00:00Z"
  }
}
```

### `exception` Kind

```json
{
  "id": "transitions/EXCEPT-legacy-billing-api",
  "schemaVersion": "1.0.0",
  "kind": "exception",
  "title": "Legacy Billing API Exception",
  "status": "active",
  "summary": "Approved exception for undocumented billing API endpoints during migration.",
  "owners": ["enterprise-architecture"],
  "confidence": "declared",
  "scope": {
    "artifactIds": ["systems/APP-billing-service"],
    "rules": ["ea:systems/undocumented-api"]
  },
  "approvedBy": "architecture-review-board",
  "approvedAt": "2026-02-01T10:00:00Z",
  "expiresAt": "2026-06-30T23:59:59Z",
  "reason": "Billing API is being replaced as part of PLAN-2026-modernize-orders. Documenting endpoints is not cost-effective given the planned retirement.",
  "reviewSchedule": "monthly"
}
```

Kind-specific fields for `exception`:

```typescript
export interface ExceptionArtifact extends ArtifactBase {
  kind: "exception";
  scope: {
    artifactIds?: string[];
    rules?: string[];
    domains?: EaDomain[];
  };
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  reason: string;
  reviewSchedule?: "weekly" | "monthly" | "quarterly";
}
```

### Legacy `requirement` Kind (Subsumption)

When migrated, a current `Requirement` artifact becomes:

```json
{
  "id": "legacy/REQ-1",
  "schemaVersion": "1.0.0",
  "kind": "requirement",
  "title": "Add Task",
  "status": "shipped",
  "summary": "Users can add new tasks to the todo list.",
  "owners": ["product"],
  "confidence": "declared",
  "behaviorStatements": [
    {
      "id": "BS-1",
      "text": "When the user submits a new task, the system shall add the task to the list with status incomplete.",
      "format": "EARS",
      "trigger": "user submits a new task",
      "response": "add the task to the list with status incomplete"
    }
  ],
  "anchors": {
    "symbols": ["addTask", "TaskItem", "TodoInput"]
  },
  "verification": {
    "coverageStatus": "covered",
    "testRefs": ["__tests__/todo.test.ts"]
  },
  "relations": [
    { "type": "implementedBy", "target": "legacy/CHG-2025-0001-initial-todo" }
  ]
}
```

Kind-specific fields for `requirement`:

```typescript
export interface RequirementArtifact extends ArtifactBase {
  kind: "requirement";
  behaviorStatements?: BehaviorStatement[];
  verification?: {
    coverageStatus: "none" | "partial" | "covered";
    testRefs?: string[];
  };
  category?: "functional" | "non-functional" | "policy";
  priority?: "must" | "should" | "could" | "wont";
  /** Populated during transition — maps to old `implementation` field */
  supersededBy?: string;
  statusReason?: string;
}
```

## Schema Strategy

### File Organization

```text
src/ea/schemas/
  artifact-base.schema.json        # Shared base (used via $ref)
  relation.schema.json             # Relation object schema
  anchors.schema.json              # Anchors object schema

  # Systems (Phase A)
  application.schema.json
  service.schema.json
  api-contract.schema.json
  event-contract.schema.json
  integration.schema.json

  # Delivery (Phase A)
  platform.schema.json
  deployment.schema.json
  runtime-cluster.schema.json
  network-zone.schema.json
  identity-boundary.schema.json

  # Data (Phase B)
  data-store.schema.json
  logical-data-model.schema.json
  physical-schema.schema.json
  lineage.schema.json
  # ... etc per phase

  # Legacy subsumption (Phase H)
  requirement.schema.json
  change.schema.json
  decision.schema.json
```

### Schema Rules

- every schema `$ref`s `artifact-base.schema.json` for shared fields
- per-kind schemas use `additionalProperties: false` on kind-specific fields, but keep `extensions` open
- `schemaVersion` is required on every artifact and used by the migrate command
- relation objects are validated separately through `relation.schema.json`
- the `anchors` object is validated through `anchors.schema.json`

### Validation Sequence

1. Parse JSON
2. Validate against `artifact-base.schema.json`
3. Resolve `kind` → select per-kind schema
4. Validate against per-kind schema
5. Validate relations via `relation.schema.json`
6. Validate anchors via `anchors.schema.json`
7. Run quality rules (owners present, summary non-empty, etc.)
8. Run cross-reference checks (relation targets exist, no orphans)

---

## Kind-Specific Schema Reference

### `physical-schema` — Tables Format

The `tables` property defines the physical database structure. Each table requires a `name` and at least one column with `name` and `type`.

```yaml
kind: physical-schema
id: SCHEMA-orders
spec:
  engine: postgresql
  schemaName: public
  managedBy: migrations          # migrations | orm | manual | schema-registry | other
  sourcePath: prisma/schema.prisma
  tables:
    - name: orders
      columns:
        - name: id
          type: uuid
          primaryKey: true
        - name: customer_id
          type: uuid
          nullable: false
          foreignKey:
            table: customers
            column: id
        - name: total
          type: decimal
          description: "Order total in cents"
        - name: created_at
          type: timestamp
          nullable: false
      indexes:
        - name: idx_orders_customer
          columns: ["customer_id"]
          unique: false
```

**Required fields per table:** `name`, `columns` (min 1 item)
**Required fields per column:** `name`, `type`
**Optional column fields:** `nullable` (boolean), `primaryKey` (boolean), `foreignKey` (`{table, column}`), `description` (string)
**Optional table fields:** `indexes` (array of `{name, columns[], unique?}`)

### `org-unit` — Ownership Pattern

The `org-unit` kind models teams, departments, and organizational structures. Use the `owns` relation to assign ownership of any artifact.

```yaml
kind: org-unit
id: ORG-commerce-team
metadata:
  name: Commerce Team
  summary: Owns order and payment services
  owners: ["engineering-lead"]
  confidence: declared
  status: active
spec:
  unitType: team                  # team | department | division | business-unit | guild | chapter | other
  parentUnit: ORG-engineering     # optional reference to parent org-unit
  lead: jane.doe                  # optional
  size: 8                         # optional headcount
  locations: ["NYC", "Remote"]    # optional
  costCenter: "CC-4200"           # optional
relations:
  - type: owns
    target: APP-order-service
  - type: owns
    target: APP-payment-api
  - type: owns
    target: STORE-orders-db
```

**Drift rules that check ownership:**

| Rule | Severity | What it checks |
|---|---|---|
| `ea:business/process-missing-owner` | warning | Process has no `processOwner`, `performedBy`, or `owns` relation |
| `ea:business/unowned-critical-system` | warning | Active application/service with ≥3 relations but no org-unit `owns` it |

**To resolve ownership warnings:**
1. Create an `org-unit` artifact for the responsible team
2. Add `owns` relations from the org-unit to the artifacts it manages
3. Alternatively, for processes: set the `processOwner` field or add a `performedBy` relation
