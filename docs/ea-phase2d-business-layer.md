# EA Phase 2D: Business Architecture Layer

This document specifies the complete business architecture domain — 8 artifact kinds covering mission, capabilities, value streams, processes, organizational units, policy objectives, business services, and controls.

## Prerequisites

- Phase 1 complete
- Phase 2C (Information Layer) complete — business artifacts reference information artifacts via `classifiedAs` traversal
- Read [ea-phase2-overview.md](./ea-phase2-overview.md) for Phase 2 context
- Read [ea-unified-artifact-model.md](./ea-unified-artifact-model.md) for base model

## What This Phase Adds

| Kind | Prefix | Description |
|---|---|---|
| `mission` | `MISSION` | An organizational mission or strategic objective |
| `capability` | `CAP` | A business capability |
| `value-stream` | `VS` | A value stream (end-to-end delivery of value) |
| `process` | `PROC` | A business process |
| `org-unit` | `ORG` | An organizational unit |
| `policy-objective` | `POL` | A governance policy objective |
| `business-service` | `BSVC` | A business service (distinct from technical service) |
| `control` | `CTRL` | A governance or compliance control |

**New relations:** 4 (`supports`, `performedBy`, `governedBy`, `owns`)

**Running total after 2D:** 36 kinds, 24 relations

## Kind Specifications

### `mission` Kind

A mission represents a high-level organizational objective. It is the top of the business architecture hierarchy.

```typescript
export interface MissionArtifact extends ArtifactBase {
  kind: "mission";

  /** Time horizon */
  timeHorizon?: "short-term" | "medium-term" | "long-term" | "perpetual";

  /** Key results or objectives that measure mission success */
  keyResults?: Array<{
    id: string;
    description: string;
    metric?: string;
    target?: string;
    currentValue?: string;
  }>;

  /** Strategic themes this mission supports */
  strategicThemes?: string[];

  /** Sponsoring executive or board */
  sponsor?: string;
}
```

#### Example

```json
{
  "id": "business/MISSION-digital-commerce",
  "schemaVersion": "1.0.0",
  "kind": "mission",
  "title": "Digital Commerce Excellence",
  "status": "active",
  "summary": "Deliver a seamless, personalized digital commerce experience that drives 80% of total revenue through digital channels.",
  "owners": ["executive-team"],
  "confidence": "declared",
  "timeHorizon": "long-term",
  "keyResults": [
    { "id": "KR-1", "description": "Digital revenue share", "metric": "% of total revenue from digital channels", "target": "80%", "currentValue": "62%" },
    { "id": "KR-2", "description": "Customer satisfaction", "metric": "NPS score for digital experience", "target": ">70", "currentValue": "58" }
  ],
  "strategicThemes": ["customer-centricity", "operational-efficiency", "data-driven-decisions"],
  "sponsor": "Chief Digital Officer",
  "relations": [
    { "type": "supportedBy", "target": "business/CAP-order-fulfillment", "criticality": "high" },
    { "type": "supportedBy", "target": "business/CAP-customer-management", "criticality": "high" }
  ]
}
```

### `capability` Kind

A business capability represents *what* the organization can do, independent of *how* it does it. Capabilities form a hierarchy and are the primary lens for business-to-IT alignment.

```typescript
export interface CapabilityArtifact extends ArtifactBase {
  kind: "capability";

  /** Capability level in the hierarchy (1 = top, 2 = sub, etc.) */
  level: number;

  /** Parent capability (for hierarchy) */
  parentCapability?: string;

  /** Maturity assessment */
  maturity?: "initial" | "developing" | "defined" | "managed" | "optimized";

  /** Strategic importance */
  strategicImportance?: "commodity" | "differentiating" | "core";

  /** Current investment level */
  investmentProfile?: "invest" | "maintain" | "divest" | "evaluate";

  /** Heat map indicators */
  heatMap?: {
    businessValue: "low" | "medium" | "high";
    technicalHealth: "poor" | "fair" | "good" | "excellent";
    risk: "low" | "medium" | "high" | "critical";
  };
}
```

#### Example

```json
{
  "id": "business/CAP-order-fulfillment",
  "schemaVersion": "1.0.0",
  "kind": "capability",
  "title": "Order Fulfillment",
  "status": "active",
  "summary": "The enterprise can accept, validate, route, and fulfill customer orders across all channels.",
  "owners": ["operations"],
  "confidence": "declared",
  "level": 2,
  "parentCapability": "business/CAP-commerce",
  "maturity": "managed",
  "strategicImportance": "core",
  "investmentProfile": "invest",
  "heatMap": {
    "businessValue": "high",
    "technicalHealth": "fair",
    "risk": "medium"
  },
  "relations": [
    { "type": "realizes", "target": "systems/APP-order-service", "criticality": "high" },
    { "type": "realizes", "target": "systems/APP-warehouse-service", "criticality": "medium" },
    { "type": "performedBy", "target": "business/PROC-order-processing" },
    { "type": "governedBy", "target": "business/POL-order-sla" },
    { "type": "supports", "target": "business/MISSION-digital-commerce" }
  ]
}
```

### `value-stream` Kind

A value stream represents the end-to-end delivery of value to a customer or stakeholder. It is composed of stages, each supported by capabilities.

```typescript
export interface ValueStreamArtifact extends ArtifactBase {
  kind: "value-stream";

  /** Stages of value delivery (ordered) */
  stages: Array<{
    id: string;
    name: string;
    description?: string;
    supportingCapabilities: string[];
    duration?: string;
    bottleneck?: boolean;
  }>;

  /** Who receives the value */
  customer: string;

  /** What value is delivered */
  valueProposition: string;

  /** Trigger that initiates the value stream */
  trigger?: string;

  /** End condition */
  outcome?: string;
}
```

#### Example

```json
{
  "id": "business/VS-order-to-delivery",
  "schemaVersion": "1.0.0",
  "kind": "value-stream",
  "title": "Order to Delivery",
  "status": "active",
  "summary": "End-to-end value stream from customer order placement to physical delivery.",
  "owners": ["operations"],
  "confidence": "declared",
  "customer": "End consumer",
  "valueProposition": "Customer receives ordered goods at their location within the promised timeframe.",
  "trigger": "Customer places an order",
  "outcome": "Customer confirms receipt of goods",
  "stages": [
    { "id": "S1", "name": "Order Capture", "supportingCapabilities": ["business/CAP-order-fulfillment"], "duration": "< 1 min" },
    { "id": "S2", "name": "Payment Processing", "supportingCapabilities": ["business/CAP-payment-processing"], "duration": "< 30 sec" },
    { "id": "S3", "name": "Inventory Allocation", "supportingCapabilities": ["business/CAP-inventory-management"], "duration": "< 5 min" },
    { "id": "S4", "name": "Warehouse Picking", "supportingCapabilities": ["business/CAP-warehouse-operations"], "duration": "< 4 hours", "bottleneck": true },
    { "id": "S5", "name": "Shipping", "supportingCapabilities": ["business/CAP-logistics"], "duration": "1-5 days" },
    { "id": "S6", "name": "Delivery Confirmation", "supportingCapabilities": ["business/CAP-customer-management"], "duration": "< 1 day" }
  ]
}
```

### `process` Kind

A business process describes *how* work is done — a sequence of activities that implements a capability.

```typescript
export interface ProcessArtifact extends ArtifactBase {
  kind: "process";

  /** Process steps (ordered) */
  steps?: Array<{
    id: string;
    name: string;
    description?: string;
    actor?: string;
    systemRef?: string;
    automated?: boolean;
  }>;

  /** Which capabilities this process implements */
  implementsCapabilities?: string[];

  /** Trigger */
  trigger?: string;

  /** Expected outcome */
  outcome?: string;

  /** Process frequency */
  frequency?: string;

  /** Process owner (org unit) */
  processOwner?: string;

  /** Compliance-relevant process? */
  regulated?: boolean;
}
```

#### Example

```json
{
  "id": "business/PROC-order-processing",
  "schemaVersion": "1.0.0",
  "kind": "process",
  "title": "Order Processing",
  "status": "active",
  "summary": "End-to-end process for receiving, validating, and routing a customer order.",
  "owners": ["operations"],
  "confidence": "declared",
  "trigger": "Customer submits order via web/mobile/API",
  "outcome": "Order is confirmed and routed to fulfillment",
  "frequency": "~10,000/day",
  "processOwner": "business/ORG-operations",
  "regulated": false,
  "implementsCapabilities": ["business/CAP-order-fulfillment"],
  "steps": [
    { "id": "P1", "name": "Receive order", "systemRef": "systems/API-orders-api", "automated": true },
    { "id": "P2", "name": "Validate order data", "systemRef": "systems/APP-order-service", "automated": true },
    { "id": "P3", "name": "Check inventory", "systemRef": "systems/APP-inventory-service", "automated": true },
    { "id": "P4", "name": "Process payment", "systemRef": "systems/APP-payment-service", "automated": true },
    { "id": "P5", "name": "Confirm order", "systemRef": "systems/APP-order-service", "automated": true },
    { "id": "P6", "name": "Route to fulfillment", "systemRef": "systems/APP-warehouse-service", "automated": true }
  ],
  "relations": [
    { "type": "performedBy", "target": "business/ORG-operations" },
    { "type": "supports", "target": "business/CAP-order-fulfillment" }
  ]
}
```

### `org-unit` Kind

An organizational unit represents a team, department, division, or other organizational boundary.

```typescript
export interface OrgUnitArtifact extends ArtifactBase {
  kind: "org-unit";

  /** Type of organizational unit */
  unitType: "team" | "department" | "division" | "business-unit" | "guild" | "chapter" | "other";

  /** Parent org unit in the hierarchy */
  parentUnit?: string;

  /** Head/lead of this org unit */
  lead?: string;

  /** Headcount or team size */
  size?: number;

  /** Location(s) */
  locations?: string[];

  /** Cost center */
  costCenter?: string;
}
```

#### Example

```json
{
  "id": "business/ORG-operations",
  "schemaVersion": "1.0.0",
  "kind": "org-unit",
  "title": "Operations Department",
  "status": "active",
  "summary": "Responsible for order fulfillment, warehouse operations, and logistics.",
  "owners": ["vp-operations"],
  "confidence": "declared",
  "unitType": "department",
  "parentUnit": "business/ORG-commerce-division",
  "lead": "VP Operations",
  "size": 45,
  "locations": ["NYC", "LAX"],
  "costCenter": "CC-OPS-001",
  "relations": [
    { "type": "owns", "target": "systems/APP-order-service" },
    { "type": "owns", "target": "systems/APP-warehouse-service" },
    { "type": "performs", "target": "business/PROC-order-processing" }
  ]
}
```

### `policy-objective` Kind

A policy objective is a governance goal — SLA targets, compliance mandates, operational standards.

```typescript
export interface PolicyObjectiveArtifact extends ArtifactBase {
  kind: "policy-objective";

  /** Policy category */
  category: "sla" | "compliance" | "security" | "operational" | "financial" | "data-governance" | "other";

  /** The objective statement */
  objective: string;

  /** Measurable target */
  target?: {
    metric: string;
    threshold: string;
    currentValue?: string;
  };

  /** Controls that enforce this policy */
  enforcedBy?: string[];

  /** Regulatory reference */
  regulatoryRef?: string;

  /** Review frequency */
  reviewCadence?: string;
}
```

#### Example

```json
{
  "id": "business/POL-order-sla",
  "schemaVersion": "1.0.0",
  "kind": "policy-objective",
  "title": "Order Processing SLA",
  "status": "active",
  "summary": "All orders must be confirmed within 30 seconds of submission.",
  "owners": ["operations", "engineering"],
  "confidence": "declared",
  "category": "sla",
  "objective": "Order confirmation latency must not exceed 30 seconds at p99 during business hours.",
  "target": {
    "metric": "p99 order confirmation latency",
    "threshold": "< 30s",
    "currentValue": "22s"
  },
  "enforcedBy": ["business/CTRL-order-latency-monitoring"],
  "reviewCadence": "quarterly",
  "relations": [
    { "type": "governs", "target": "business/CAP-order-fulfillment" },
    { "type": "governs", "target": "systems/APP-order-service" }
  ]
}
```

### `business-service` Kind

A business service is a service from the business perspective — what the organization offers to customers or internal consumers, abstracted from technical implementation.

```typescript
export interface BusinessServiceArtifact extends ArtifactBase {
  kind: "business-service";

  /** Service category */
  serviceType: "customer-facing" | "internal" | "partner" | "shared";

  /** Channels through which this service is delivered */
  channels?: string[];

  /** Revenue impact */
  revenueImpact?: "direct" | "indirect" | "cost-center";

  /** Service level (maps to policy objectives) */
  serviceLevel?: string;

  /** Implementing capabilities */
  implementedByCapabilities?: string[];
}
```

#### Example

```json
{
  "id": "business/BSVC-online-ordering",
  "schemaVersion": "1.0.0",
  "kind": "business-service",
  "title": "Online Ordering Service",
  "status": "active",
  "summary": "Customer-facing service allowing online ordering via web and mobile channels.",
  "owners": ["digital-commerce"],
  "confidence": "declared",
  "serviceType": "customer-facing",
  "channels": ["web", "mobile-app", "api"],
  "revenueImpact": "direct",
  "serviceLevel": "business/POL-order-sla",
  "implementedByCapabilities": ["business/CAP-order-fulfillment", "business/CAP-payment-processing"],
  "relations": [
    { "type": "supports", "target": "business/MISSION-digital-commerce" },
    { "type": "realizes", "target": "systems/APP-order-service" }
  ]
}
```

### `control` Kind

A control is a specific mechanism that enforces a policy objective — monitoring, alerts, automated checks, manual reviews.

```typescript
export interface ControlArtifact extends ArtifactBase {
  kind: "control";

  /** Control type */
  controlType: "preventive" | "detective" | "corrective" | "directive";

  /** How the control is implemented */
  implementation: "automated" | "manual" | "hybrid";

  /** What the control checks or enforces */
  assertion: string;

  /** How the control operates */
  mechanism?: string;

  /** Frequency of control execution */
  frequency?: "continuous" | "hourly" | "daily" | "weekly" | "monthly" | "on-demand" | "event-triggered";

  /** Evidence this control produces */
  producesEvidence?: string;

  /** What happens when the control detects a violation */
  onViolation?: {
    action: "block" | "alert" | "escalate" | "log" | "auto-remediate";
    target?: string;
    description?: string;
  };

  /** Last execution date */
  lastExecutedAt?: string;

  /** Compliance frameworks this control supports */
  frameworks?: string[];
}
```

#### Example

```json
{
  "id": "business/CTRL-order-latency-monitoring",
  "schemaVersion": "1.0.0",
  "kind": "control",
  "title": "Order Latency Monitoring",
  "status": "active",
  "summary": "Continuous monitoring of order confirmation latency against SLA threshold.",
  "owners": ["platform-engineering"],
  "confidence": "declared",
  "controlType": "detective",
  "implementation": "automated",
  "assertion": "p99 order confirmation latency is below 30 seconds",
  "mechanism": "Datadog monitor on order-service.confirm.latency_p99",
  "frequency": "continuous",
  "producesEvidence": "Datadog alert history + monthly SLA report",
  "onViolation": {
    "action": "alert",
    "target": "#platform-orders-oncall",
    "description": "PagerDuty alert triggered, on-call engineer investigates"
  },
  "lastExecutedAt": "2026-03-29T07:00:00Z",
  "frameworks": ["SOC2"],
  "relations": [
    { "type": "governedBy", "target": "business/POL-order-sla" }
  ],
  "anchors": {
    "other": {
      "datadog": ["monitor:order-service-latency-p99"]
    }
  }
}
```

## Phase 2D Relations

### Registry Entries

```typescript
const PHASE_2D_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "supports",
    inverse: "supportedBy",
    validSourceKinds: ["application", "service", "process", "business-service", "capability"],
    validTargetKinds: ["capability", "mission", "value-stream"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source supports a business capability, mission, or value stream."
  },
  {
    type: "performedBy",
    inverse: "performs",
    validSourceKinds: ["capability", "business-service", "process"],
    validTargetKinds: ["process", "org-unit"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Capability or service is performed by a process or org unit."
  },
  {
    type: "governedBy",
    inverse: "governs",
    validSourceKinds: "*",
    validTargetKinds: ["policy-objective", "control"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source artifact is governed by a policy objective or control."
  },
  {
    type: "owns",
    inverse: "ownedBy",
    validSourceKinds: ["org-unit"],
    validTargetKinds: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "none",
    description: "Org unit owns an artifact."
  }
];
```

### Extended Existing Relations

| Existing Relation | New Valid Sources/Targets |
|---|---|
| `realizes` | Add `business-service` as valid source; add `capability`, `mission` as valid target |
| `supports` | (New, defined above) |
| `dependsOn` | Already `*`/`*` |

## Business Drift Rules

| Rule ID | Severity | Description |
|---|---|---|
| `ea:business/no-realizing-systems` | warning | Active capability has no `realizes` or `supports` relation from any application or service |
| `ea:business/process-missing-owner` | warning | Process has no `performedBy` relation to an org-unit |
| `ea:business/control-missing-evidence` | warning | Control with `implementation: automated` has no evidence record within its frequency window |
| `ea:business/retired-system-dependency` | error | Active capability depends on (via `realizes`) a retired application or service |
| `ea:business/orphan-capability` | warning | Capability with no parent and no children and no realizing systems |
| `ea:business/mission-no-capabilities` | warning | Mission with no `supportedBy` capabilities |
| `ea:business/policy-no-controls` | warning | Policy objective with no enforcing controls |
| `ea:business/control-overdue` | warning | Control has `lastExecutedAt` older than its declared frequency |
| `ea:business/value-stream-bottleneck` | info | Value stream stage marked as bottleneck for visibility |
| `ea:business/unowned-critical-system` | warning | Application or service with `criticality: high/critical` relations but no org-unit ownership |

## Business-Specific Validation Rules

- `ea:quality:capability-missing-level` — capability without level field
- `ea:quality:process-missing-steps` — process without any steps
- `ea:quality:value-stream-missing-stages` — value stream without stages
- `ea:quality:control-missing-assertion` — control without assertion text
- `ea:quality:org-unit-missing-type` — org-unit without unitType
- `ea:quality:policy-missing-objective` — policy-objective without objective text
- `ea:quality:mission-missing-key-results` — mission without key results (info level)

## Capability Map Report

The capability map is the signature report of the business layer. It is the primary artifact for business-IT alignment.

### Content

```
Mission: Digital Commerce Excellence
├── L1: Commerce
│   ├── L2: Order Fulfillment [core, invest, maturity: managed]
│   │   ├── Realized by: APP-order-service, APP-warehouse-service
│   │   ├── Process: PROC-order-processing (owned by ORG-operations)
│   │   ├── Governed by: POL-order-sla → CTRL-order-latency-monitoring
│   │   ├── Technical health: fair | Business value: high | Risk: medium
│   │   └── Drift: 1 warning (retired system dependency)
│   ├── L2: Payment Processing [core, maintain, maturity: optimized]
│   │   └── ...
│   └── L2: Customer Management [differentiating, invest, maturity: developing]
│       └── ...
└── L1: Logistics
    └── ...
```

### JSON Output Shape

```json
{
  "generatedAt": "2026-03-29T07:00:00Z",
  "missions": [
    {
      "id": "business/MISSION-digital-commerce",
      "title": "Digital Commerce Excellence",
      "capabilities": [
        {
          "id": "business/CAP-order-fulfillment",
          "title": "Order Fulfillment",
          "level": 2,
          "parent": "business/CAP-commerce",
          "maturity": "managed",
          "strategicImportance": "core",
          "investmentProfile": "invest",
          "heatMap": { "businessValue": "high", "technicalHealth": "fair", "risk": "medium" },
          "realizingSystems": ["systems/APP-order-service", "systems/APP-warehouse-service"],
          "processes": ["business/PROC-order-processing"],
          "controls": ["business/CTRL-order-latency-monitoring"],
          "owningOrg": "business/ORG-operations",
          "driftSummary": { "errors": 0, "warnings": 1 },
          "children": []
        }
      ]
    }
  ]
}
```

### CLI

```bash
anchored-spec ea report --view capability-map
anchored-spec ea report --view capability-map --json
anchored-spec ea report --view capability-map --domain business
```

## PR Breakdown

### PR 2D-1: Business Schemas and Types

1. Add 8 TypeScript interfaces to `src/ea/types.ts`
2. Create 8 JSON Schema files in `src/ea/schemas/`
3. Register 8 kinds in the kind taxonomy
4. Add `ea create` templates for all 8 kinds
5. Add test fixtures and schema validation tests

### PR 2D-2: Business Relations and Drift Rules

1. Add `PHASE_2D_RELATIONS` to relation registry
2. Add business drift rules
3. Add business-specific validation rules
4. Write tests for all business drift rules, especially `retired-system-dependency` graph traversal

### PR 2D-3: Capability Map Report

1. Implement capability map report in `src/ea/report.ts`
2. Build the hierarchy from `parentCapability` and `level` fields
3. Enrich with realizing systems, processes, controls, drift summary
4. Generate JSON and Markdown output
5. Add CLI option and tests
