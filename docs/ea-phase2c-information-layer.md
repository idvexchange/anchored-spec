# EA Phase 2C: Information Architecture Layer

This document specifies the complete information architecture domain — 6 artifact kinds covering information concepts, canonical entities, exchanges, classifications, retention policies, and glossary terms.

## Prerequisites

- Phase 1 complete
- Phase 2B (Data Layer) complete — the `implementedBy` relation targets data kinds
- Read [ea-phase2-overview.md](./ea-phase2-overview.md) for Phase 2 context
- Read [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) for base model

## What This Phase Adds

| Kind | Prefix | Description |
|---|---|---|
| `information-concept` | `IC` | An abstract business information concept |
| `canonical-entity` | `CE` | A canonical entity definition with typed attributes |
| `information-exchange` | `EXCH` | An information exchange pattern between systems |
| `classification` | `CLASS` | A data classification category (PII, PHI, etc.) |
| `retention-policy` | `RET` | A data retention and disposal policy |
| `glossary-term` | `TERM` | A business glossary term definition |

**New relations:** 3 (`classifiedAs`, `exchangedVia`, `retainedUnder`)

**Running total after 2C:** 28 kinds, 20 relations

## Kind Specifications

### `information-concept` Kind

An information concept is the most abstract representation of a business idea — "Customer," "Order," "Payment" — before it becomes a canonical entity with attributes or a logical data model with columns. Use it for early-stage architecture modeling or when defining the vocabulary of an enterprise.

```typescript
export interface InformationConceptArtifact extends ArtifactBase {
  kind: "information-concept";

  /** Which business domain this concept belongs to */
  domain: string;

  /** Related glossary terms */
  glossaryTerms?: string[];

  /** Sub-concepts this decomposes into */
  decomposesInto?: string[];

  /** Parent concept (if this is a specialization) */
  specializationOf?: string;

  /** Known synonyms across the enterprise */
  synonyms?: string[];
}
```

#### Example

```json
{
  "id": "information/IC-customer",
  "schemaVersion": "1.0.0",
  "kind": "information-concept",
  "title": "Customer",
  "status": "active",
  "summary": "A party who purchases goods or services from the enterprise.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "domain": "commerce",
  "glossaryTerms": ["information/TERM-customer", "information/TERM-buyer"],
  "decomposesInto": ["information/IC-customer-identity", "information/IC-customer-preferences", "information/IC-customer-history"],
  "synonyms": ["buyer", "purchaser", "client", "account holder"],
  "relations": [
    { "type": "implementedBy", "target": "information/CE-customer" },
    { "type": "classifiedAs", "target": "information/CLASS-pii" }
  ]
}
```

### `canonical-entity` Kind

A canonical entity is a governed, attributed definition of a business entity. It sits between the abstract information-concept and the physical logical-data-model: it defines *what fields* exist on the canonical representation without specifying physical types.

```typescript
export interface CanonicalEntityArtifact extends ArtifactBase {
  kind: "canonical-entity";

  /** Typed attributes */
  attributes: Array<{
    name: string;
    type: string;
    required?: boolean;
    description?: string;
    classification?: string;
    example?: string;
  }>;

  /** The information concept this entity realizes */
  conceptRef?: string;

  /** Version of this canonical definition */
  entityVersion?: string;

  /** Whether this entity has been ratified by governance */
  governanceStatus?: "proposed" | "ratified" | "under-review";
}
```

#### Example

```json
{
  "id": "information/CE-customer",
  "schemaVersion": "1.0.0",
  "kind": "canonical-entity",
  "title": "Customer (Canonical)",
  "status": "active",
  "summary": "Canonical enterprise representation of a Customer.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "conceptRef": "information/IC-customer",
  "entityVersion": "2.0.0",
  "governanceStatus": "ratified",
  "attributes": [
    { "name": "customerId", "type": "uuid", "required": true, "description": "Globally unique customer identifier" },
    { "name": "email", "type": "email", "required": true, "classification": "information/CLASS-pii", "example": "jane@example.com" },
    { "name": "fullName", "type": "string", "required": true, "classification": "information/CLASS-pii" },
    { "name": "phoneNumber", "type": "phone", "required": false, "classification": "information/CLASS-pii" },
    { "name": "createdAt", "type": "timestamp", "required": true },
    { "name": "segment", "type": "enum(individual,business,enterprise)", "required": true },
    { "name": "status", "type": "enum(active,suspended,closed)", "required": true }
  ],
  "relations": [
    { "type": "classifiedAs", "target": "information/CLASS-pii" },
    { "type": "implementedBy", "target": "data/LDM-customer" },
    { "type": "exchangedVia", "target": "information/EXCH-customer-onboarding" }
  ]
}
```

### `information-exchange` Kind

An information exchange describes a pattern of information flowing between systems or domains. It is more abstract than an API contract — it describes *what information moves* and *why*, not the wire format.

```typescript
export interface InformationExchangeArtifact extends ArtifactBase {
  kind: "information-exchange";

  /** Source of the information */
  source: {
    artifactId: string;
    role?: string;
  };

  /** Destination of the information */
  destination: {
    artifactId: string;
    role?: string;
  };

  /** What entities or data elements are exchanged */
  exchangedEntities: string[];

  /** Why this exchange happens */
  purpose: string;

  /** Trigger for the exchange */
  trigger?: "event" | "request" | "scheduled" | "manual";

  /** Implementing contracts (API or event) */
  implementingContracts?: string[];

  /** Data classification level of the exchanged information */
  classificationLevel?: string;

  /** Consent or regulatory basis for the exchange */
  legalBasis?: string;
}
```

#### Example

```json
{
  "id": "information/EXCH-customer-onboarding",
  "schemaVersion": "1.0.0",
  "kind": "information-exchange",
  "title": "Customer Onboarding Exchange",
  "status": "active",
  "summary": "Customer identity and preference data flows from onboarding service to CRM and marketing.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "source": {
    "artifactId": "systems/APP-onboarding-service",
    "role": "producer"
  },
  "destination": {
    "artifactId": "systems/APP-crm",
    "role": "consumer"
  },
  "exchangedEntities": ["information/CE-customer"],
  "purpose": "Propagate new customer data to downstream systems for CRM setup and marketing consent tracking.",
  "trigger": "event",
  "implementingContracts": ["systems/EVT-customer-created", "systems/API-crm-customer-sync"],
  "classificationLevel": "information/CLASS-pii",
  "legalBasis": "Legitimate interest + explicit consent for marketing",
  "relations": [
    { "type": "dependsOn", "target": "systems/EVT-customer-created" },
    { "type": "dependsOn", "target": "systems/API-crm-customer-sync" }
  ]
}
```

### `classification` Kind

A classification is a data sensitivity or regulatory category — PII, PHI, PCI, public, internal, confidential, etc. Classifications propagate through the graph: if a canonical entity is classified as PII, every store that holds it should enforce PII controls.

```typescript
export interface ClassificationArtifact extends ArtifactBase {
  kind: "classification";

  /** Classification level or category name */
  level: string;

  /** Regulatory frameworks that mandate this classification */
  regulations?: string[];

  /** Required controls for data carrying this classification */
  requiredControls: Array<{
    control: string;
    description: string;
    enforcedBy?: string;
  }>;

  /** Handling instructions */
  handling?: {
    encryption?: "at-rest" | "in-transit" | "both" | "not-required";
    accessControl?: string;
    auditLogging?: boolean;
    masking?: string;
    crossBorderRestrictions?: string;
  };

  /** Parent classification (for hierarchical schemes) */
  parentClassification?: string;
}
```

#### Example

```json
{
  "id": "information/CLASS-pii",
  "schemaVersion": "1.0.0",
  "kind": "classification",
  "title": "PII — Personally Identifiable Information",
  "status": "active",
  "summary": "Data that can directly or indirectly identify a natural person.",
  "owners": ["security", "data-governance"],
  "confidence": "declared",
  "level": "sensitive",
  "regulations": ["GDPR", "CCPA", "LGPD"],
  "requiredControls": [
    { "control": "encryption-at-rest", "description": "All PII must be encrypted at rest", "enforcedBy": "business/CTRL-encryption-at-rest" },
    { "control": "encryption-in-transit", "description": "All PII must be encrypted in transit (TLS 1.2+)", "enforcedBy": "business/CTRL-tls-policy" },
    { "control": "access-logging", "description": "All access to PII must be logged", "enforcedBy": "business/CTRL-audit-logging" },
    { "control": "right-to-erasure", "description": "PII must be deletable within 30 days of request" }
  ],
  "handling": {
    "encryption": "both",
    "accessControl": "role-based, need-to-know",
    "auditLogging": true,
    "masking": "Mask in non-production environments",
    "crossBorderRestrictions": "EU PII must remain within EU data centers"
  }
}
```

### `retention-policy` Kind

A retention policy declares how long data should be kept and when/how it should be disposed of.

```typescript
export interface RetentionPolicyArtifact extends ArtifactBase {
  kind: "retention-policy";

  /** What this policy applies to */
  appliesTo: string[];

  /** Retention duration */
  retention: {
    duration: string;
    basis: string;
    startEvent?: string;
  };

  /** Disposal method */
  disposal: {
    method: "delete" | "anonymize" | "archive" | "aggregate";
    description?: string;
    automatedBy?: string;
  };

  /** Legal or regulatory basis */
  legalBasis?: string;

  /** Exception conditions where retention may be extended */
  exceptions?: Array<{
    condition: string;
    extendedDuration?: string;
  }>;

  /** Last compliance check date */
  lastVerifiedAt?: string;
}
```

#### Example

```json
{
  "id": "information/RET-order-data-7y",
  "schemaVersion": "1.0.0",
  "kind": "retention-policy",
  "title": "Order Data — 7 Year Retention",
  "status": "active",
  "summary": "Order transaction data must be retained for 7 years for tax and audit compliance.",
  "owners": ["legal", "data-governance"],
  "confidence": "declared",
  "appliesTo": ["data/STORE-orders-postgres", "data/STORE-analytics-warehouse"],
  "retention": {
    "duration": "7 years",
    "basis": "Tax compliance (IRS Section 6501)",
    "startEvent": "Order completion date"
  },
  "disposal": {
    "method": "anonymize",
    "description": "After 7 years, PII fields are anonymized. Aggregate transaction data is kept indefinitely.",
    "automatedBy": "data-lifecycle-service"
  },
  "legalBasis": "IRS Section 6501, SOX Section 802",
  "exceptions": [
    {
      "condition": "Order is subject to active legal hold",
      "extendedDuration": "Until legal hold is released"
    }
  ],
  "lastVerifiedAt": "2026-01-15T00:00:00Z"
}
```

### `glossary-term` Kind

A glossary term is a standardized business vocabulary entry — ensuring "customer," "order," "fulfillment" mean the same thing across the enterprise.

```typescript
export interface GlossaryTermArtifact extends ArtifactBase {
  kind: "glossary-term";

  /** The canonical definition */
  definition: string;

  /** Business domain this term belongs to */
  domain: string;

  /** Alternative terms or synonyms */
  synonyms?: string[];

  /** Terms commonly confused with this one */
  antonymsOrConfusables?: Array<{
    term: string;
    distinction: string;
  }>;

  /** Related information concepts */
  relatedConcepts?: string[];

  /** Usage examples */
  examples?: string[];

  /** Who approved this definition */
  approvedBy?: string;
}
```

#### Example

```json
{
  "id": "information/TERM-customer",
  "schemaVersion": "1.0.0",
  "kind": "glossary-term",
  "title": "Customer",
  "status": "active",
  "summary": "Standardized definition of 'Customer' across the enterprise.",
  "owners": ["data-governance"],
  "confidence": "declared",
  "definition": "A natural person or legal entity that has completed at least one purchase transaction with the enterprise, or has an active account in any customer-facing system.",
  "domain": "commerce",
  "synonyms": ["buyer", "purchaser", "account holder"],
  "antonymsOrConfusables": [
    { "term": "prospect", "distinction": "A prospect has NOT completed a purchase. They become a customer upon first transaction." },
    { "term": "lead", "distinction": "A lead is a marketing-qualified contact. They may not have interacted with any system." },
    { "term": "user", "distinction": "A user is an authenticated identity. Not all users are customers (e.g., internal staff)." }
  ],
  "relatedConcepts": ["information/IC-customer"],
  "examples": [
    "Jane Doe who placed order ORD-12345 on 2026-01-15 is a customer.",
    "Acme Corp with enterprise account ACC-67890 is a customer.",
    "A visitor who added items to cart but never checked out is NOT a customer."
  ],
  "approvedBy": "data-governance-board"
}
```

## Phase 2C Relations

### Registry Entries

```typescript
const PHASE_2C_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "classifiedAs",
    inverse: "classifies",
    validSourceKinds: [
      "canonical-entity", "logical-data-model", "data-store",
      "information-exchange", "information-concept", "physical-schema",
      "data-product"
    ],
    validTargetKinds: ["classification"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source data artifact is classified under a data classification category."
  },
  {
    type: "exchangedVia",
    inverse: "exchanges",
    validSourceKinds: ["canonical-entity", "information-concept"],
    validTargetKinds: ["information-exchange", "api-contract", "event-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Information is exchanged via a contract or exchange pattern."
  },
  {
    type: "retainedUnder",
    inverse: "retains",
    validSourceKinds: ["data-store", "data-product", "physical-schema"],
    validTargetKinds: ["retention-policy"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Data in the source artifact is subject to the target retention policy."
  }
];
```

### Extended Existing Relations

| Existing Relation | New Valid Sources/Targets |
|---|---|
| `implementedBy` | Add `information-concept` as valid source; add `canonical-entity` as valid target |
| `classifiedAs` | (New, defined above) |
| `dependsOn` | Already `*`/`*` |

## Information Drift Rules

| Rule ID | Severity | Description |
|---|---|---|
| `ea:information/entity-missing-implementation` | warning | Canonical entity has no `implementedBy` relation to any data artifact |
| `ea:information/exchange-missing-contract` | error | Information exchange has no implementing contracts (no API or event contract) |
| `ea:information/classification-not-propagated` | warning | Classification applied to canonical entity but not to downstream data stores that hold the entity |
| `ea:information/retention-not-enforced` | warning | Retention policy covers a store but no evidence of enforcement exists |
| `ea:information/concept-not-materialized` | info | Information concept has no canonical entity or logical data model |
| `ea:information/orphan-classification` | warning | Classification not referenced by any entity, store, or exchange |
| `ea:information/glossary-inconsistency` | warning | Glossary term definition conflicts with canonical entity summary |
| `ea:information/exchange-classification-mismatch` | error | Information exchange carries PII-classified entities but does not declare the classification level |

### Classification Propagation Rule

The `ea:information/classification-not-propagated` rule implements graph traversal:

1. Find all canonical entities with `classifiedAs → CLASS-*`
2. For each, find all `implementedBy → data artifacts`
3. For each data artifact, check if it also has `classifiedAs → same CLASS-*`
4. If not, emit a warning with suggestion to add the classification

This is a key governance rule: if an entity is PII, every store holding it must know.

## Information-Specific Validation Rules

- `ea:quality:ce-missing-attributes` — canonical entity with empty attributes
- `ea:quality:ce-attribute-missing-type` — attribute without type field
- `ea:quality:exchange-missing-source-destination` — exchange without source or destination
- `ea:quality:exchange-missing-purpose` — exchange without purpose field
- `ea:quality:classification-missing-controls` — classification with empty requiredControls
- `ea:quality:retention-missing-duration` — retention policy without retention.duration
- `ea:quality:glossary-missing-definition` — glossary term without definition

## PR Breakdown

### PR 2C-1: Information Schemas and Types

1. Add 6 TypeScript interfaces to `src/ea/types.ts`
2. Create 6 JSON Schema files in `src/ea/schemas/`
3. Register 6 kinds in the kind taxonomy
4. Add `ea create` templates for all 6 kinds
5. Add test fixtures and schema validation tests

### PR 2C-2: Information Relations and Drift Rules

1. Add `PHASE_2C_RELATIONS` to relation registry
2. Add information drift rules including classification propagation
3. Add validation rules
4. Write comprehensive tests for classification propagation traversal

### PR 2C-3: Classification Coverage Report

1. Implement classification coverage report in `src/ea/report.ts`
2. Content: for each classification → which entities carry it → which stores enforce it → gaps
3. Add `anchored-spec ea report --view classification-coverage` CLI option
4. Generate JSON and Markdown output
