# EA Phase 2A: Systems and Delivery Domain Completion

This document specifies the remaining artifact kinds for the systems and delivery domains that were deferred from Phase 1.

## Prerequisites

- Phase 1 complete (10 kinds, 10 relations, core infrastructure)
- Read [ea-phase2-overview.md](./ea-phase2-overview.md) for Phase 2 context
- Read [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) for the base artifact model and kind taxonomy
- Read [ea-relationship-model.md](./ea-relationship-model.md) for the relation model

## What This Phase Adds

| Domain | Kind | Prefix | Status |
|---|---|---|---|
| systems | `system-interface` | `SIF` | **New** |
| systems | `consumer` | `CON` | **New** |
| delivery | `cloud-resource` | `CLOUD` | **New** |
| delivery | `environment` | `ENV` | **New** |
| delivery | `technology-standard` | `TECH` | **New** |

**New relations:** 3

**Running total after 2A:** 15 kinds, 13 relations

## Systems Domain Completion

### `system-interface` Kind

A system interface represents an external system boundary — the point where your architecture connects to systems you don't own. This is distinct from `integration` (which models a declared connection between two known systems) and `api-contract` (which models a specific API specification).

Use `system-interface` when:
- Modeling a third-party API you consume (Stripe, Twilio, Salesforce)
- Modeling a partner system boundary
- Modeling a legacy system you interact with but don't manage

```typescript
export interface SystemInterfaceArtifact extends ArtifactBase {
  kind: "system-interface";

  /** Direction of data flow relative to your architecture */
  direction: "inbound" | "outbound" | "bidirectional";

  /** Protocol used at the boundary */
  protocol?: "rest" | "graphql" | "grpc" | "soap" | "sftp" | "mq" | "custom";

  /** External system name (for display and discovery matching) */
  externalSystem?: string;

  /** Whether you own/control the interface specification */
  ownership: "owned" | "external" | "shared";

  /** SLA or availability expectations */
  sla?: {
    availability?: string;
    latencyP99?: string;
    throughput?: string;
  };
}
```

#### Example

```json
{
  "id": "systems/SIF-stripe-payments",
  "schemaVersion": "1.0.0",
  "kind": "system-interface",
  "title": "Stripe Payments Interface",
  "status": "active",
  "summary": "External interface to Stripe for payment processing. We consume their REST API and receive webhooks.",
  "owners": ["platform-payments"],
  "confidence": "declared",
  "direction": "bidirectional",
  "protocol": "rest",
  "externalSystem": "Stripe",
  "ownership": "external",
  "sla": {
    "availability": "99.99%",
    "latencyP99": "500ms"
  },
  "relations": [
    { "type": "consumedBy", "target": "systems/APP-payment-service" }
  ],
  "anchors": {
    "apis": ["POST https://api.stripe.com/v1/charges", "POST https://api.stripe.com/v1/refunds"],
    "other": {
      "webhooks": ["charge.succeeded", "charge.failed", "refund.created"]
    }
  }
}
```

#### JSON Schema: `system-interface.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://anchored-spec.dev/schemas/ea/system-interface.schema.json",
  "title": "EA System Interface Artifact",
  "description": "An external system boundary interface.",
  "allOf": [
    { "$ref": "./artifact-base.schema.json" }
  ],
  "properties": {
    "kind": { "const": "system-interface" },
    "direction": {
      "type": "string",
      "enum": ["inbound", "outbound", "bidirectional"]
    },
    "protocol": {
      "type": "string",
      "enum": ["rest", "graphql", "grpc", "soap", "sftp", "mq", "custom"]
    },
    "externalSystem": { "type": "string" },
    "ownership": {
      "type": "string",
      "enum": ["owned", "external", "shared"]
    },
    "sla": {
      "type": "object",
      "properties": {
        "availability": { "type": "string" },
        "latencyP99": { "type": "string" },
        "throughput": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "required": ["direction", "ownership"]
}
```

### `consumer` Kind

A consumer represents a declared consumer of an API or event contract. While `consumes` relations can be declared on any application, a dedicated `consumer` artifact is useful when:
- The consumer is an external system or partner you don't model as a full `application`
- You need to track consumer-specific metadata (rate limits, SLA, contract version)
- You want to model the consumer independently for impact analysis

```typescript
export interface ConsumerArtifact extends ArtifactBase {
  kind: "consumer";

  /** What this consumer consumes */
  consumesContracts: string[];

  /** Whether this is an internal or external consumer */
  consumerType: "internal" | "external" | "partner";

  /** Contact information for the consumer team/org */
  contact?: {
    team?: string;
    email?: string;
    slackChannel?: string;
  };

  /** Rate limiting or quota applied to this consumer */
  quotas?: {
    rateLimit?: string;
    dailyLimit?: number;
    burstLimit?: number;
  };

  /** Which version of the contract this consumer is bound to */
  contractVersion?: string;
}
```

#### Example

```json
{
  "id": "systems/CON-mobile-app-orders",
  "schemaVersion": "1.0.0",
  "kind": "consumer",
  "title": "Mobile App — Orders API Consumer",
  "status": "active",
  "summary": "The mobile application consumes the Orders API for order placement and tracking.",
  "owners": ["mobile-team"],
  "confidence": "declared",
  "consumerType": "internal",
  "consumesContracts": ["systems/API-orders-api"],
  "contact": {
    "team": "mobile-team",
    "slackChannel": "#mobile-eng"
  },
  "quotas": {
    "rateLimit": "1000/min",
    "dailyLimit": 500000
  },
  "contractVersion": "2.1.0",
  "relations": [
    { "type": "consumes", "target": "systems/API-orders-api" }
  ]
}
```

#### JSON Schema: `consumer.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://anchored-spec.dev/schemas/ea/consumer.schema.json",
  "title": "EA Consumer Artifact",
  "description": "A declared consumer of an API or event contract.",
  "allOf": [
    { "$ref": "./artifact-base.schema.json" }
  ],
  "properties": {
    "kind": { "const": "consumer" },
    "consumerType": {
      "type": "string",
      "enum": ["internal", "external", "partner"]
    },
    "consumesContracts": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1
    },
    "contact": {
      "type": "object",
      "properties": {
        "team": { "type": "string" },
        "email": { "type": "string", "format": "email" },
        "slackChannel": { "type": "string" }
      },
      "additionalProperties": false
    },
    "quotas": {
      "type": "object",
      "properties": {
        "rateLimit": { "type": "string" },
        "dailyLimit": { "type": "integer" },
        "burstLimit": { "type": "integer" }
      },
      "additionalProperties": false
    },
    "contractVersion": { "type": "string" }
  },
  "required": ["consumerType", "consumesContracts"]
}
```

## Delivery Domain Completion

### `cloud-resource` Kind

A cloud resource represents a specific managed cloud resource — an RDS instance, an S3 bucket, a Lambda function, a managed Kafka cluster. It sits below `platform` in the hierarchy: a platform hosts multiple cloud resources.

```typescript
export interface CloudResourceArtifact extends ArtifactBase {
  kind: "cloud-resource";

  /** Cloud provider */
  provider: "aws" | "gcp" | "azure" | "other";

  /** Provider-specific resource type */
  resourceType: string;

  /** Region or location */
  region?: string;

  /** Account or project identifier */
  account?: string;

  /** Provider-specific ARN, resource ID, or self-link */
  resourceId?: string;

  /** Cost allocation tags or metadata */
  costCenter?: string;

  /** Provisioning method */
  provisionedBy?: "terraform" | "cloudformation" | "pulumi" | "manual" | "cdk" | "other";

  /** Technology details */
  technology?: {
    engine?: string;
    version?: string;
    tier?: string;
  };
}
```

#### Example

```json
{
  "id": "delivery/CLOUD-orders-rds",
  "schemaVersion": "1.0.0",
  "kind": "cloud-resource",
  "title": "Orders RDS PostgreSQL",
  "status": "active",
  "summary": "AWS RDS PostgreSQL instance hosting the orders database.",
  "owners": ["data-platform"],
  "confidence": "declared",
  "provider": "aws",
  "resourceType": "aws_rds_cluster",
  "region": "us-east-1",
  "account": "123456789012",
  "resourceId": "arn:aws:rds:us-east-1:123456789012:cluster:orders-prod",
  "costCenter": "platform-orders",
  "provisionedBy": "terraform",
  "technology": {
    "engine": "postgresql",
    "version": "15.4",
    "tier": "db.r6g.xlarge"
  },
  "relations": [
    { "type": "runsOn", "target": "delivery/PLAT-kubernetes-prod" },
    { "type": "boundedBy", "target": "delivery/ZONE-private-data" }
  ],
  "anchors": {
    "infra": [
      "terraform:aws_rds_cluster.orders_prod",
      "aws:arn:aws:rds:us-east-1:123456789012:cluster:orders-prod"
    ]
  }
}
```

#### JSON Schema: `cloud-resource.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://anchored-spec.dev/schemas/ea/cloud-resource.schema.json",
  "title": "EA Cloud Resource Artifact",
  "description": "A specific managed cloud resource.",
  "allOf": [
    { "$ref": "./artifact-base.schema.json" }
  ],
  "properties": {
    "kind": { "const": "cloud-resource" },
    "provider": {
      "type": "string",
      "enum": ["aws", "gcp", "azure", "other"]
    },
    "resourceType": { "type": "string" },
    "region": { "type": "string" },
    "account": { "type": "string" },
    "resourceId": { "type": "string" },
    "costCenter": { "type": "string" },
    "provisionedBy": {
      "type": "string",
      "enum": ["terraform", "cloudformation", "pulumi", "manual", "cdk", "other"]
    },
    "technology": {
      "type": "object",
      "properties": {
        "engine": { "type": "string" },
        "version": { "type": "string" },
        "tier": { "type": "string" }
      },
      "additionalProperties": false
    }
  },
  "required": ["provider", "resourceType"]
}
```

### `environment` Kind

An environment represents a deployment environment — production, staging, development, QA. Deployments target environments, and environments belong to platforms.

```typescript
export interface EnvironmentArtifact extends ArtifactBase {
  kind: "environment";

  /** Environment tier/purpose */
  tier: "production" | "staging" | "development" | "qa" | "sandbox" | "dr" | "other";

  /** Whether this environment receives live traffic */
  isProduction: boolean;

  /** Platforms available in this environment */
  platforms?: string[];

  /** Network zones active in this environment */
  networkZones?: string[];

  /** Access control level */
  accessLevel?: "restricted" | "team" | "org" | "public";

  /** Data classification ceiling — highest data classification allowed */
  maxDataClassification?: string;

  /** Promotion pipeline: which environment feeds into this one */
  promotesFrom?: string;

  /** Promotion pipeline: which environment this feeds into */
  promotesTo?: string;
}
```

#### Example

```json
{
  "id": "delivery/ENV-production",
  "schemaVersion": "1.0.0",
  "kind": "environment",
  "title": "Production Environment",
  "status": "active",
  "summary": "Production environment serving live customer traffic.",
  "owners": ["platform-engineering"],
  "confidence": "declared",
  "tier": "production",
  "isProduction": true,
  "platforms": ["delivery/PLAT-kubernetes-prod"],
  "networkZones": ["delivery/ZONE-private-services", "delivery/ZONE-private-data", "delivery/ZONE-public-ingress"],
  "accessLevel": "restricted",
  "maxDataClassification": "information/CLASS-pii",
  "promotesFrom": "delivery/ENV-staging",
  "relations": [
    { "type": "uses", "target": "delivery/PLAT-kubernetes-prod" },
    { "type": "boundedBy", "target": "delivery/ZONE-private-services" }
  ]
}
```

#### JSON Schema: `environment.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://anchored-spec.dev/schemas/ea/environment.schema.json",
  "title": "EA Environment Artifact",
  "description": "A deployment environment.",
  "allOf": [
    { "$ref": "./artifact-base.schema.json" }
  ],
  "properties": {
    "kind": { "const": "environment" },
    "tier": {
      "type": "string",
      "enum": ["production", "staging", "development", "qa", "sandbox", "dr", "other"]
    },
    "isProduction": { "type": "boolean" },
    "platforms": { "type": "array", "items": { "type": "string" } },
    "networkZones": { "type": "array", "items": { "type": "string" } },
    "accessLevel": {
      "type": "string",
      "enum": ["restricted", "team", "org", "public"]
    },
    "maxDataClassification": { "type": "string" },
    "promotesFrom": { "type": "string" },
    "promotesTo": { "type": "string" }
  },
  "required": ["tier", "isProduction"]
}
```

### `technology-standard` Kind

A technology standard declares an approved (or deprecated) technology choice. It enables the `ea:delivery/technology-standard-violation` drift rule — any deployment using a technology not covered by an active standard can be flagged.

```typescript
export interface TechnologyStandardArtifact extends ArtifactBase {
  kind: "technology-standard";

  /** Category of the standard */
  category: "language" | "framework" | "database" | "messaging" | "runtime" | "cloud-service" | "tool" | "protocol" | "other";

  /** The specific technology */
  technology: string;

  /** Approved versions (semver ranges or specific versions) */
  approvedVersions?: string[];

  /** Deprecated versions that should be migrated away from */
  deprecatedVersions?: string[];

  /** Scope: where this standard applies */
  scope?: {
    domains?: string[];
    environments?: string[];
    teams?: string[];
  };

  /** When this standard was approved */
  approvedAt?: string;

  /** When this standard will be reviewed */
  reviewBy?: string;

  /** Alternative technologies if this one is deprecated */
  alternatives?: string[];

  /** Rationale or ADR reference */
  rationale?: string;
}
```

#### Example

```json
{
  "id": "delivery/TECH-postgresql",
  "schemaVersion": "1.0.0",
  "kind": "technology-standard",
  "title": "PostgreSQL — Approved RDBMS",
  "status": "active",
  "summary": "PostgreSQL is the approved relational database for all transactional workloads.",
  "owners": ["enterprise-architecture"],
  "confidence": "declared",
  "category": "database",
  "technology": "postgresql",
  "approvedVersions": [">=14", "<=16"],
  "deprecatedVersions": ["<14"],
  "scope": {
    "environments": ["delivery/ENV-production", "delivery/ENV-staging"]
  },
  "approvedAt": "2025-01-15T00:00:00Z",
  "reviewBy": "2026-01-15T00:00:00Z",
  "rationale": "See ADR-12 for selection rationale. MySQL and Oracle are not approved for new workloads."
}
```

#### JSON Schema: `technology-standard.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://anchored-spec.dev/schemas/ea/technology-standard.schema.json",
  "title": "EA Technology Standard Artifact",
  "description": "An approved or deprecated technology standard.",
  "allOf": [
    { "$ref": "./artifact-base.schema.json" }
  ],
  "properties": {
    "kind": { "const": "technology-standard" },
    "category": {
      "type": "string",
      "enum": ["language", "framework", "database", "messaging", "runtime", "cloud-service", "tool", "protocol", "other"]
    },
    "technology": { "type": "string" },
    "approvedVersions": { "type": "array", "items": { "type": "string" } },
    "deprecatedVersions": { "type": "array", "items": { "type": "string" } },
    "scope": {
      "type": "object",
      "properties": {
        "domains": { "type": "array", "items": { "type": "string" } },
        "environments": { "type": "array", "items": { "type": "string" } },
        "teams": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "approvedAt": { "type": "string", "format": "date-time" },
    "reviewBy": { "type": "string", "format": "date-time" },
    "alternatives": { "type": "array", "items": { "type": "string" } },
    "rationale": { "type": "string" }
  },
  "required": ["category", "technology"]
}
```

## New Relations for Phase 2A

### Registry Entries

```typescript
const PHASE_2A_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "interfacesWith",
    inverse: "interfacedBy",
    validSourceKinds: ["application", "service", "integration"],
    validTargetKinds: ["system-interface"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system interfaces with an external system boundary."
  },
  {
    type: "standardizes",
    inverse: "standardizedBy",
    validSourceKinds: ["technology-standard"],
    validTargetKinds: ["application", "service", "data-store", "cloud-resource", "platform"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Technology standard governs what technology the target may use."
  },
  {
    type: "providedBy",
    inverse: "provides",
    validSourceKinds: ["cloud-resource"],
    validTargetKinds: ["platform"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Cloud resource is provided by a platform."
  }
];
```

### Updated Relation Validity

Phase 2A also extends existing relations with new valid source/target kinds:

| Existing Relation | New Valid Targets/Sources |
|---|---|
| `runsOn` | Add `cloud-resource` as valid target |
| `boundedBy` | Add `cloud-resource`, `environment` as valid sources |
| `deployedTo` | Add `environment` as valid target |
| `consumes` | Add `system-interface` as valid target |

## New Drift Rules for Phase 2A

| Rule ID | Severity | Description |
|---|---|---|
| `ea:systems/unmodeled-external-dependency` | warning | Application consumes an external API not modeled as a system-interface |
| `ea:systems/consumer-contract-version-mismatch` | warning | Consumer's contractVersion doesn't match the latest api-contract version |
| `ea:delivery/unmodeled-cloud-resource` | warning | Cloud resource found by resolver but not modeled |
| `ea:delivery/technology-standard-violation` | error | Deployment or cloud resource uses technology not covered by active standard |
| `ea:delivery/deprecated-version-in-use` | warning | Cloud resource uses a version listed in a standard's deprecatedVersions |
| `ea:delivery/environment-promotion-gap` | warning | Environment promotesFrom references a non-existent environment |

## Validation Rules for Phase 2A

Add these quality rules to `src/ea/validate.ts`:

- `ea:quality:system-interface-missing-direction` — system-interface without direction
- `ea:quality:consumer-missing-contract` — consumer with empty consumesContracts
- `ea:quality:cloud-resource-missing-provider` — cloud-resource without provider
- `ea:quality:environment-production-not-restricted` — production environment without restricted access
- `ea:quality:technology-standard-expired-review` — standard past its reviewBy date

## `ea create` Templates

### system-interface template

```json
{
  "id": "systems/SIF-{slug}",
  "schemaVersion": "1.0.0",
  "kind": "system-interface",
  "title": "{title}",
  "status": "draft",
  "summary": "",
  "owners": [],
  "confidence": "declared",
  "direction": "outbound",
  "ownership": "external",
  "relations": [],
  "anchors": {}
}
```

### consumer template

```json
{
  "id": "systems/CON-{slug}",
  "schemaVersion": "1.0.0",
  "kind": "consumer",
  "title": "{title}",
  "status": "draft",
  "summary": "",
  "owners": [],
  "confidence": "declared",
  "consumerType": "internal",
  "consumesContracts": [],
  "relations": [],
  "anchors": {}
}
```

### cloud-resource template

```json
{
  "id": "delivery/CLOUD-{slug}",
  "schemaVersion": "1.0.0",
  "kind": "cloud-resource",
  "title": "{title}",
  "status": "draft",
  "summary": "",
  "owners": [],
  "confidence": "declared",
  "provider": "aws",
  "resourceType": "",
  "relations": [],
  "anchors": {}
}
```

### environment template

```json
{
  "id": "delivery/ENV-{slug}",
  "schemaVersion": "1.0.0",
  "kind": "environment",
  "title": "{title}",
  "status": "draft",
  "summary": "",
  "owners": [],
  "confidence": "declared",
  "tier": "development",
  "isProduction": false,
  "relations": [],
  "anchors": {}
}
```

### technology-standard template

```json
{
  "id": "delivery/TECH-{slug}",
  "schemaVersion": "1.0.0",
  "kind": "technology-standard",
  "title": "{title}",
  "status": "draft",
  "summary": "",
  "owners": [],
  "confidence": "declared",
  "category": "other",
  "technology": "",
  "approvedVersions": [],
  "relations": []
}
```

## PR Breakdown

### PR 2A-1: Schemas, Types, Kind Registration

1. Add TypeScript interfaces to `src/ea/types.ts`: `SystemInterfaceArtifact`, `ConsumerArtifact`, `CloudResourceArtifact`, `EnvironmentArtifact`, `TechnologyStandardArtifact`
2. Create 5 JSON Schema files in `src/ea/schemas/`
3. Register 5 new kinds in the kind taxonomy
4. Add `ea create` templates for all 5 kinds
5. Add test fixtures in `src/ea/__tests__/fixtures/valid/` for each kind
6. Write schema validation tests (valid + invalid cases)

**Acceptance criteria:**
- All 5 schemas validate their example fixtures
- `ea create system-interface --title "Stripe"` produces valid JSON
- Invalid artifacts are rejected

### PR 2A-2: Relations, Drift Rules, Validation

1. Add `PHASE_2A_RELATIONS` to relation registry
2. Extend existing relations with new valid kinds
3. Add Phase 2A drift rules to the drift rule catalog
4. Add Phase 2A quality rules to the validator
5. Write tests for:
   - New relations validate correctly
   - Invalid kind-pairs are rejected
   - Drift rules fire on test fixtures
   - Quality rules catch missing required fields

**Acceptance criteria:**
- `technology-standard → standardizes → application` validates
- `application → standardizes → technology-standard` fails (wrong direction)
- Technology standard violation drift rule fires when deployment uses unapproved tech
