# EA Phase 2B: Data Architecture Layer

This document specifies the complete data architecture domain — 7 artifact kinds covering logical models, physical schemas, data stores, lineage, master data, quality rules, and data products.

## Prerequisites

- Phase 1 complete (core infrastructure, systems + delivery core)
- Read [ea-phase2-overview.md](./ea-phase2-overview.md) for Phase 2 context
- Read [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) for base model
- Read [ea-relationship-model.md](./ea-relationship-model.md) for relation model
- No dependency on Phase 2A (can be implemented in parallel)

## What This Phase Adds

| Kind | Prefix | Description |
|---|---|---|
| `logical-data-model` | `LDM` | A logical entity or data model |
| `physical-schema` | `SCHEMA` | A physical database schema (tables, columns, constraints) |
| `data-store` | `STORE` | A data storage system (database, warehouse, lake, cache) |
| `lineage` | `LINEAGE` | A data flow/lineage declaration between stores or models |
| `master-data-domain` | `MDM` | A master data management domain boundary |
| `data-quality-rule` | `DQR` | A data quality check or assertion |
| `data-product` | `DPROD` | A data product declaration (mesh-style) |

**New relations:** 4 (`stores`, `hostedOn`, `lineageFrom`, `implementedBy`)

**Running total after 2B:** 22 kinds, 17 relations

## Kind Specifications

### `logical-data-model` Kind

Represents a logical entity — the conceptual shape of data independent of any physical implementation. Think of it as the domain model: "an Order has line items, a customer reference, and a status."

```typescript
export interface LogicalDataModelArtifact extends ArtifactBase {
  kind: "logical-data-model";

  /** Attributes of this logical entity */
  attributes: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
    classification?: string;
  }>;

  /** Relationships to other logical entities (within the data model) */
  entityRelations?: Array<{
    target: string;
    cardinality: "1:1" | "1:N" | "N:1" | "N:M";
    description?: string;
  }>;

  /** Domain or bounded context this entity belongs to */
  boundedContext?: string;

  /** Whether this is an aggregate root */
  isAggregateRoot?: boolean;
}
```

#### Example

```json
{
  "id": "data/LDM-order",
  "schemaVersion": "1.0.0",
  "kind": "logical-data-model",
  "title": "Order",
  "status": "active",
  "summary": "Logical model of an Order entity within the commerce domain.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "boundedContext": "commerce",
  "isAggregateRoot": true,
  "attributes": [
    { "name": "orderId", "type": "uuid", "required": true, "description": "Unique order identifier" },
    { "name": "customerId", "type": "uuid", "required": true, "classification": "information/CLASS-pii" },
    { "name": "status", "type": "enum(pending,confirmed,shipped,delivered,cancelled)", "required": true },
    { "name": "totalAmount", "type": "decimal", "required": true },
    { "name": "currency", "type": "string(3)", "required": true },
    { "name": "createdAt", "type": "timestamp", "required": true },
    { "name": "updatedAt", "type": "timestamp", "required": true }
  ],
  "entityRelations": [
    { "target": "data/LDM-order-line-item", "cardinality": "1:N", "description": "An order has many line items" },
    { "target": "data/LDM-customer", "cardinality": "N:1", "description": "Many orders belong to one customer" }
  ],
  "relations": [
    { "type": "implementedBy", "target": "data/SCHEMA-orders-table" },
    { "type": "implementedBy", "target": "data/SCHEMA-orders-events" }
  ],
  "anchors": {
    "schemas": ["orders.orders"]
  }
}
```

### `physical-schema` Kind

Represents the actual database schema — tables, columns, indexes, constraints. This is what resolvers compare against DDL snapshots or schema registry exports.

```typescript
export interface PhysicalSchemaArtifact extends ArtifactBase {
  kind: "physical-schema";

  /** Database engine this schema targets */
  engine: string;

  /** Schema/namespace within the database */
  schemaName?: string;

  /** Table or collection definitions */
  tables?: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      primaryKey?: boolean;
      foreignKey?: { table: string; column: string };
      description?: string;
    }>;
    indexes?: Array<{
      name: string;
      columns: string[];
      unique?: boolean;
    }>;
  }>;

  /** Source of truth for this schema (migration files, ORM, manual DDL) */
  managedBy?: "migrations" | "orm" | "manual" | "schema-registry" | "other";

  /** Path to migration files or ORM models */
  sourcePath?: string;
}
```

#### Example

```json
{
  "id": "data/SCHEMA-orders-table",
  "schemaVersion": "1.0.0",
  "kind": "physical-schema",
  "title": "Orders Table Schema",
  "status": "active",
  "summary": "Physical PostgreSQL schema for the orders table.",
  "owners": ["platform-orders"],
  "confidence": "declared",
  "engine": "postgresql",
  "schemaName": "orders",
  "managedBy": "migrations",
  "sourcePath": "db/migrations/",
  "tables": [
    {
      "name": "orders",
      "columns": [
        { "name": "id", "type": "uuid", "primaryKey": true },
        { "name": "customer_id", "type": "uuid", "nullable": false, "foreignKey": { "table": "customers", "column": "id" } },
        { "name": "status", "type": "varchar(50)", "nullable": false },
        { "name": "total_amount", "type": "decimal(12,2)", "nullable": false },
        { "name": "currency", "type": "char(3)", "nullable": false },
        { "name": "created_at", "type": "timestamptz", "nullable": false },
        { "name": "updated_at", "type": "timestamptz", "nullable": false }
      ],
      "indexes": [
        { "name": "idx_orders_customer", "columns": ["customer_id"] },
        { "name": "idx_orders_status", "columns": ["status"] }
      ]
    }
  ],
  "relations": [
    { "type": "storedIn", "target": "data/STORE-orders-postgres" }
  ],
  "anchors": {
    "schemas": ["orders.orders"],
    "infra": ["terraform:aws_db_instance.orders"]
  }
}
```

### `data-store` Kind

Represents a data storage system — a database, data warehouse, data lake, cache, or message store. This is the "where" of data persistence.

```typescript
export interface DataStoreArtifact extends ArtifactBase {
  kind: "data-store";

  /** Storage engine type */
  technology: {
    engine: string;
    version?: string;
    category: "relational" | "document" | "key-value" | "graph" | "columnar" | "time-series" | "search" | "cache" | "message-store" | "object-store" | "data-lake" | "data-warehouse" | "other";
  };

  /** Environment (matches delivery/ENV-* artifact IDs or string) */
  environment?: string;

  /** Estimated data volume */
  dataVolume?: {
    rowCount?: string;
    sizeOnDisk?: string;
    growthRate?: string;
  };

  /** Backup and retention configuration */
  backup?: {
    frequency?: string;
    retentionPeriod?: string;
    pointInTimeRecovery?: boolean;
  };

  /** Whether this store is shared across multiple applications */
  isShared?: boolean;
}
```

#### Example

```json
{
  "id": "data/STORE-orders-postgres",
  "schemaVersion": "1.0.0",
  "kind": "data-store",
  "title": "Orders PostgreSQL",
  "status": "active",
  "summary": "Primary transactional store for order data.",
  "owners": ["data-platform"],
  "confidence": "declared",
  "technology": {
    "engine": "postgresql",
    "version": "15.4",
    "category": "relational"
  },
  "environment": "delivery/ENV-production",
  "dataVolume": {
    "rowCount": "~50M orders",
    "sizeOnDisk": "120GB",
    "growthRate": "~2GB/month"
  },
  "backup": {
    "frequency": "daily",
    "retentionPeriod": "30d",
    "pointInTimeRecovery": true
  },
  "isShared": false,
  "relations": [
    { "type": "stores", "target": "data/LDM-order" },
    { "type": "hostedOn", "target": "delivery/CLOUD-orders-rds" }
  ],
  "anchors": {
    "schemas": ["orders.orders", "orders.order_line_items"],
    "infra": ["terraform:aws_rds_cluster.orders_prod"]
  }
}
```

### `lineage` Kind

Represents a declared data flow — data moving from one store or model to another. This enables lineage graph construction and stale-lineage drift detection.

```typescript
export interface LineageArtifact extends ArtifactBase {
  kind: "lineage";

  /** Where data flows from */
  source: {
    artifactId: string;
    description?: string;
  };

  /** Where data flows to */
  destination: {
    artifactId: string;
    description?: string;
  };

  /** How the data is moved */
  mechanism: "etl" | "elt" | "streaming" | "cdc" | "api-pull" | "replication" | "manual" | "other";

  /** Tool or system performing the movement */
  executedBy?: string;

  /** Transformation description */
  transformation?: string;

  /** Frequency of data movement */
  schedule?: "real-time" | "hourly" | "daily" | "weekly" | "on-demand" | "custom";

  /** Expected latency from source to destination */
  latency?: string;

  /** Data quality checks applied during movement */
  qualityChecks?: string[];
}
```

#### Example

```json
{
  "id": "data/LINEAGE-orders-to-warehouse",
  "schemaVersion": "1.0.0",
  "kind": "lineage",
  "title": "Orders to Analytics Warehouse",
  "status": "active",
  "summary": "Daily ETL pipeline moving order data from transactional store to analytics warehouse.",
  "owners": ["data-engineering"],
  "confidence": "declared",
  "source": {
    "artifactId": "data/STORE-orders-postgres",
    "description": "Orders transactional database"
  },
  "destination": {
    "artifactId": "data/STORE-analytics-warehouse",
    "description": "Snowflake analytics warehouse"
  },
  "mechanism": "elt",
  "executedBy": "dbt + Fivetran",
  "transformation": "Flatten order + line items into denormalized analytics model, apply currency conversion, mask PII",
  "schedule": "daily",
  "latency": "< 4 hours",
  "qualityChecks": ["data/DQR-orders-row-count", "data/DQR-orders-no-nulls"],
  "relations": [
    { "type": "lineageFrom", "target": "data/STORE-orders-postgres" },
    { "type": "dependsOn", "target": "data/DQR-orders-row-count" }
  ],
  "anchors": {
    "other": {
      "dbt": ["model:marts.orders_denormalized"],
      "fivetran": ["connector:postgres_orders"]
    }
  }
}
```

### `master-data-domain` Kind

Represents a master data management domain — a governed boundary around a set of canonical entities with a designated steward.

```typescript
export interface MasterDataDomainArtifact extends ArtifactBase {
  kind: "master-data-domain";

  /** Canonical entities governed by this domain */
  entities: string[];

  /** Data steward responsible for quality and governance */
  steward: {
    team: string;
    contact?: string;
  };

  /** Golden source — the authoritative data store for this domain */
  goldenSource?: string;

  /** Governance rules applied across this domain */
  governanceRules?: string[];

  /** Matching/deduplication strategy */
  matchingStrategy?: string;
}
```

#### Example

```json
{
  "id": "data/MDM-customer",
  "schemaVersion": "1.0.0",
  "kind": "master-data-domain",
  "title": "Customer Master Data Domain",
  "status": "active",
  "summary": "Master data governance boundary for customer data across all systems.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "entities": ["data/LDM-customer", "data/LDM-customer-address", "data/LDM-customer-preference"],
  "steward": {
    "team": "customer-data-team",
    "contact": "customer-data@acme.com"
  },
  "goldenSource": "data/STORE-customer-master",
  "governanceRules": ["data/DQR-customer-unique-email", "data/DQR-customer-address-valid"],
  "matchingStrategy": "Deterministic match on email + phone, probabilistic on name + address"
}
```

### `data-quality-rule` Kind

Represents a specific data quality assertion — a check that should be true about a dataset.

```typescript
export interface DataQualityRuleArtifact extends ArtifactBase {
  kind: "data-quality-rule";

  /** What this rule checks */
  ruleType: "not-null" | "unique" | "referential-integrity" | "range" | "format" | "freshness" | "row-count" | "custom";

  /** Which data entities or stores this rule applies to */
  appliesTo: string[];

  /** The assertion in human-readable form */
  assertion: string;

  /** SQL or expression implementing the check (optional, for executable rules) */
  expression?: string;

  /** Tool that executes this rule */
  executor?: string;

  /** How often this rule should be evaluated */
  schedule?: string;

  /** What happens when the rule fails */
  onFailure: "block" | "alert" | "log";

  /** Acceptable failure threshold */
  threshold?: {
    maxFailureRate?: number;
    maxFailureCount?: number;
  };
}
```

#### Example

```json
{
  "id": "data/DQR-orders-no-nulls",
  "schemaVersion": "1.0.0",
  "kind": "data-quality-rule",
  "title": "Orders — No Null Customer IDs",
  "status": "active",
  "summary": "Every order must have a non-null customer_id.",
  "owners": ["data-engineering"],
  "confidence": "declared",
  "ruleType": "not-null",
  "appliesTo": ["data/STORE-orders-postgres", "data/STORE-analytics-warehouse"],
  "assertion": "orders.customer_id IS NOT NULL for all rows",
  "expression": "SELECT COUNT(*) FROM orders WHERE customer_id IS NULL",
  "executor": "dbt-test",
  "schedule": "daily",
  "onFailure": "alert",
  "threshold": {
    "maxFailureCount": 0
  },
  "anchors": {
    "other": {
      "dbt": ["test:not_null_orders_customer_id"]
    }
  }
}
```

### `data-product` Kind

Represents a data product in a data mesh architecture — a self-contained, discoverable, addressable unit of data served by a domain team.

```typescript
export interface DataProductArtifact extends ArtifactBase {
  kind: "data-product";

  /** Domain team that owns this data product */
  domain: string;

  /** Ports: how consumers access this product */
  outputPorts: Array<{
    name: string;
    type: "api" | "table" | "file" | "stream" | "dataset";
    format?: string;
    location?: string;
    contractRef?: string;
  }>;

  /** Input sources feeding this product */
  inputPorts?: Array<{
    name: string;
    sourceRef: string;
    description?: string;
  }>;

  /** SLA for this data product */
  sla?: {
    freshness?: string;
    availability?: string;
    quality?: string;
  };

  /** Quality rules applied to this product */
  qualityRules?: string[];

  /** Discoverability metadata */
  catalog?: {
    catalogRef?: string;
    tags?: string[];
    description?: string;
  };
}
```

#### Example

```json
{
  "id": "data/DPROD-order-analytics",
  "schemaVersion": "1.0.0",
  "kind": "data-product",
  "title": "Order Analytics Data Product",
  "status": "active",
  "summary": "Curated order analytics dataset served by the commerce domain team.",
  "owners": ["commerce-data"],
  "confidence": "declared",
  "domain": "commerce",
  "outputPorts": [
    {
      "name": "orders_denormalized",
      "type": "table",
      "format": "parquet",
      "location": "snowflake:analytics.commerce.orders_denormalized",
      "contractRef": "data/SCHEMA-orders-analytics"
    },
    {
      "name": "order_metrics_api",
      "type": "api",
      "contractRef": "systems/API-order-metrics"
    }
  ],
  "inputPorts": [
    { "name": "orders_raw", "sourceRef": "data/STORE-orders-postgres", "description": "Raw transactional order data" },
    { "name": "customers_raw", "sourceRef": "data/STORE-customer-master", "description": "Customer reference data" }
  ],
  "sla": {
    "freshness": "< 4 hours from source",
    "availability": "99.9%",
    "quality": "Zero null customer_ids, all amounts > 0"
  },
  "qualityRules": ["data/DQR-orders-no-nulls", "data/DQR-orders-row-count"],
  "relations": [
    { "type": "lineageFrom", "target": "data/STORE-orders-postgres" },
    { "type": "lineageFrom", "target": "data/STORE-customer-master" }
  ],
  "anchors": {
    "other": {
      "dbt": ["model:marts.orders_denormalized", "exposure:order_analytics_dashboard"],
      "snowflake": ["analytics.commerce.orders_denormalized"]
    },
    "catalogRefs": ["dataset:order-analytics"]
  }
}
```

## Phase 2B Relations

### Registry Entries

```typescript
const PHASE_2B_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "stores",
    inverse: "storedIn",
    validSourceKinds: ["data-store"],
    validTargetKinds: ["logical-data-model", "physical-schema", "canonical-entity"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Data store stores a logical model, physical schema, or canonical entity."
  },
  {
    type: "hostedOn",
    inverse: "hostsData",
    validSourceKinds: ["data-store"],
    validTargetKinds: ["platform", "cloud-resource", "runtime-cluster"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Data store is hosted on infrastructure."
  },
  {
    type: "lineageFrom",
    inverse: "lineageTo",
    validSourceKinds: ["lineage", "data-product"],
    validTargetKinds: ["data-store", "logical-data-model", "data-product"],
    allowCycles: true,
    allowExplicitInverse: false,
    driftStrategy: "external-topology",
    description: "Data flows from target into source (lineage direction)."
  },
  {
    type: "implementedBy",
    inverse: "implements",
    validSourceKinds: ["logical-data-model", "canonical-entity", "information-concept"],
    validTargetKinds: ["physical-schema", "data-store", "application"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "A logical concept is physically implemented by a target artifact."
  }
];
```

### Extended Existing Relations

| Existing Relation | New Valid Sources/Targets |
|---|---|
| `uses` | Add `data-store`, `data-product` as valid targets |
| `dependsOn` | Already `*`/`*`, no change needed |
| `runsOn` | Add `data-store` as valid source |

## Data Drift Rules

| Rule ID | Severity | Description |
|---|---|---|
| `ea:data/logical-physical-mismatch` | error | Physical schema columns/types diverge from logical data model attributes (resolver compares declared LDM vs DDL snapshot) |
| `ea:data/store-undeclared-entity` | warning | Data store contains tables/collections not declared in any logical-data-model or physical-schema |
| `ea:data/lineage-stale` | warning | Lineage references source or destination artifact that is `retired` or doesn't exist |
| `ea:data/quality-rule-not-enforced` | warning | Data quality rule declared but resolver finds no evidence of execution (no dbt test, no Great Expectations suite) |
| `ea:data/orphan-store` | warning | Data store with no `uses` or `lineageFrom`/`lineageTo` edges (disconnected from any application or pipeline) |
| `ea:data/shared-store-no-steward` | warning | Data store with `isShared: true` but no master-data-domain or data steward |
| `ea:data/product-missing-sla` | warning | Active data product without SLA definition |
| `ea:data/product-missing-quality-rules` | warning | Active data product with no quality rules |

## Data-Specific Validation Rules

- `ea:quality:ldm-missing-attributes` — logical-data-model with empty attributes array
- `ea:quality:physical-schema-missing-tables` — physical-schema with empty tables array
- `ea:quality:data-store-missing-technology` — data-store without technology field
- `ea:quality:lineage-missing-source-destination` — lineage without source or destination
- `ea:quality:dqr-missing-assertion` — data-quality-rule without assertion text
- `ea:quality:data-product-missing-output-ports` — data-product with empty outputPorts

## Data Resolver Targets

Phase 2B defines the resolver specifications. Actual implementation happens in Phase 2F.

### SQL DDL Resolver

- **Input**: SQL migration files, DDL dump files, or database introspection output
- **resolveAnchors**: Match `schemas` anchors against table.column definitions in DDL
- **collectObservedState**: Build list of all tables, columns, types, constraints, indexes
- **discoverArtifacts**: Generate draft `physical-schema` and `data-store` artifacts
- **Drift detection**: Compare LDM attributes against physical columns (type compatibility, missing columns)

### dbt Resolver

- **Input**: `manifest.json` from dbt build
- **resolveAnchors**: Match `other.dbt` anchors against model names, test names, source names
- **collectObservedState**: Build dbt DAG with models, sources, tests, exposures
- **discoverArtifacts**: Generate draft `lineage`, `data-product`, and `data-quality-rule` artifacts
- **Drift detection**: Compare declared lineage graph against dbt DAG edges

### Schema Registry Resolver

- **Input**: Schema registry exports (Confluent, AWS Glue, etc.)
- **resolveAnchors**: Match `schemas` anchors against registered schema subjects
- **collectObservedState**: List all registered schemas with versions
- **discoverArtifacts**: Generate draft `physical-schema` artifacts from registered Avro/Protobuf schemas

## PR Breakdown

### PR 2B-1: Data Schemas and Types

1. Add 7 TypeScript interfaces to `src/ea/types.ts`
2. Create 7 JSON Schema files in `src/ea/schemas/`
3. Register 7 kinds in the kind taxonomy
4. Add `ea create` templates for all 7 kinds
5. Add test fixtures and schema validation tests

### PR 2B-2: Data Relations and Drift Rules

1. Add `PHASE_2B_RELATIONS` to the relation registry
2. Extend existing relations with new valid kinds
3. Add data drift rules to the rule catalog
4. Add data-specific validation rules
5. Write relation validation and drift rule tests

### PR 2B-3: Data Report — System-Data Matrix

1. Implement the system-data matrix report in `src/ea/report.ts`
2. Content: applications → data stores → logical models → classifications
3. Add `anchored-spec ea report --view system-data-matrix` CLI option
4. Generate both JSON and Markdown output
5. Write tests with fixture data
