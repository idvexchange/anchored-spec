import { describe, it, expect, beforeEach } from "vitest";
import { validateEaSchema, resetEaAjv, getSchemaForKind, getEaSchemaNames } from "../validate.js";
import { ENTITY_DESCRIPTOR_REGISTRY } from "../backstage/kind-mapping.js";

beforeEach(() => {
  resetEaAjv();
});

// ─── Helper: minimal valid base entity ────────────────────────────────────────

function validBase(kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `systems/TEST-${kind}`,
    schemaVersion: "1.0.0",
    kind,
    title: `Test ${kind}`,
    status: "active",
    summary: `A test ${kind} entity for schema validation.`,
    owners: ["test-team"],
    confidence: "declared",
    ...extra,
  };
}

// ─── Schema Registry ────────────────────────────────────────────────────────────

describe("getEaSchemaNames", () => {
  it("returns 55 schema names (3 base + 48 kinds + 4 config/governance)", () => {
    const names = getEaSchemaNames();
    expect(names).toHaveLength(55);
    expect(names).toContain("entity-base");
    expect(names).toContain("relation");
    expect(names).toContain("anchors");
    expect(names).toContain("config-v1");
    expect(names).toContain("workflow-policy");
    expect(names).toContain("ea-evidence");
    expect(names).toContain("ea-verification");
  });
});

describe("getSchemaForKind", () => {
  it("returns schema name for known kinds", () => {
    expect(getSchemaForKind("application")).toBe("application");
    expect(getSchemaForKind("deployment")).toBe("deployment");
  });

  it("returns undefined for unknown kinds", () => {
    expect(getSchemaForKind("nonexistent")).toBeUndefined();
  });
});

// ─── Base Schema Validation ─────────────────────────────────────────────────────

describe("entity-base schema", () => {
  it("accepts a valid base entity", () => {
    const result = validateEaSchema(validBase("application"), "entity-base");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing required fields", () => {
    const result = validateEaSchema({}, "entity-base");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid status enum", () => {
    const result = validateEaSchema(
      validBase("application", { status: "bogus" }),
      "entity-base"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("status"))).toBe(true);
  });

  it("rejects invalid confidence enum", () => {
    const result = validateEaSchema(
      validBase("application", { confidence: "guess" }),
      "entity-base"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty owners array", () => {
    const result = validateEaSchema(
      validBase("application", { owners: [] }),
      "entity-base"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects summary that is too short", () => {
    const result = validateEaSchema(
      validBase("application", { summary: "short" }),
      "entity-base"
    );
    expect(result.valid).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = validateEaSchema(
      validBase("application", {
        tags: ["core", "revenue"],
        relations: [{ type: "dependsOn", target: "systems/APP-other" }],
        anchors: { symbols: ["OrderService"], apis: ["POST /orders"] },
        traceRefs: [{ path: "https://docs.example.com", role: "specification" }],
        risk: { level: "medium", description: "Some risk" },
        compliance: { frameworks: ["SOC2"] },
        extensions: { custom: "data" },
      }),
      "entity-base"
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Relation Schema ────────────────────────────────────────────────────────────

describe("relation schema", () => {
  it("accepts a valid relation", () => {
    const result = validateEaSchema(
      { type: "dependsOn", target: "systems/APP-other" },
      "relation"
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a relation with all optional fields", () => {
    const result = validateEaSchema(
      {
        type: "dependsOn",
        target: "systems/APP-other",
        description: "Runtime dependency",
        criticality: "high",
        status: "active",
      },
      "relation"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a relation missing type", () => {
    const result = validateEaSchema({ target: "APP-foo" }, "relation");
    expect(result.valid).toBe(false);
  });

  it("rejects a relation missing target", () => {
    const result = validateEaSchema({ type: "dependsOn" }, "relation");
    expect(result.valid).toBe(false);
  });

  it("rejects invalid criticality", () => {
    const result = validateEaSchema(
      { type: "dependsOn", target: "APP-foo", criticality: "extreme" },
      "relation"
    );
    expect(result.valid).toBe(false);
  });
});

// ─── Anchors Schema ─────────────────────────────────────────────────────────────

describe("anchors schema", () => {
  it("accepts empty anchors object", () => {
    const result = validateEaSchema({}, "anchors");
    expect(result.valid).toBe(true);
  });

  it("accepts all anchor types", () => {
    const result = validateEaSchema(
      {
        symbols: ["OrderService"],
        apis: ["POST /orders"],
        events: ["order.created"],
        schemas: ["OrderSchema"],
        infra: ["kubernetes:deployment/order"],
        catalogRefs: ["service:order"],
        iam: ["aws:iam-role/order"],
        network: ["aws:sg/sg-123"],
        other: { custom: ["ref-1"] },
      },
      "anchors"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects non-string array items", () => {
    const result = validateEaSchema({ symbols: [123] }, "anchors");
    expect(result.valid).toBe(false);
  });
});

// ─── Kind-Specific Schema Tests (Systems) ───────────────────────────────────────

describe("application schema", () => {
  it("accepts a valid application", () => {
    const result = validateEaSchema(validBase("application"));
    expect(result.valid).toBe(true);
  });

  it("accepts with technology and repository", () => {
    const result = validateEaSchema(
      validBase("application", {
        technology: { language: "typescript", framework: "nestjs", runtime: "node" },
        repository: "https://github.com/acme/order-service",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("service schema", () => {
  it("accepts a valid service", () => {
    const result = validateEaSchema(validBase("service"));
    expect(result.valid).toBe(true);
  });

  it("accepts with protocol", () => {
    const result = validateEaSchema(validBase("service", { protocol: "gRPC" }));
    expect(result.valid).toBe(true);
  });
});

describe("api-contract schema", () => {
  it("accepts a valid api-contract", () => {
    const result = validateEaSchema(
      validBase("api-contract", {
        protocol: "rest",
        specFormat: "openapi",
        specPath: "api/openapi.yaml",
        version: "2.1.0",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects invalid protocol enum", () => {
    const result = validateEaSchema(
      validBase("api-contract", { protocol: "websocket" })
    );
    expect(result.valid).toBe(false);
  });
});

describe("event-contract schema", () => {
  it("accepts a valid event-contract", () => {
    const result = validateEaSchema(
      validBase("event-contract", {
        protocol: "kafka",
        specFormat: "asyncapi",
        version: "1.0.0",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("integration schema", () => {
  it("accepts a valid integration", () => {
    const result = validateEaSchema(
      validBase("integration", {
        sourceSystem: "systems/APP-orders",
        targetSystem: "systems/APP-billing",
        pattern: "async-event",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects invalid pattern enum", () => {
    const result = validateEaSchema(
      validBase("integration", { pattern: "magic" })
    );
    expect(result.valid).toBe(false);
  });
});

describe("system-interface schema", () => {
  it("accepts a valid system-interface with required fields", () => {
    const result = validateEaSchema(
      validBase("system-interface", {
        direction: "inbound",
        ownership: "owned",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing required direction", () => {
    const result = validateEaSchema(
      validBase("system-interface", { ownership: "owned" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing required ownership", () => {
    const result = validateEaSchema(
      validBase("system-interface", { direction: "inbound" })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with SLA", () => {
    const result = validateEaSchema(
      validBase("system-interface", {
        direction: "bidirectional",
        ownership: "shared",
        sla: { availability: "99.9%", latencyP99: "200ms" },
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("consumer schema", () => {
  it("accepts a valid consumer with required fields", () => {
    const result = validateEaSchema(
      validBase("consumer", {
        consumesContracts: ["systems/API-orders"],
        consumerType: "external",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing consumesContracts", () => {
    const result = validateEaSchema(
      validBase("consumer", { consumerType: "internal" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty consumesContracts", () => {
    const result = validateEaSchema(
      validBase("consumer", { consumesContracts: [], consumerType: "internal" })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with quotas and contact", () => {
    const result = validateEaSchema(
      validBase("consumer", {
        consumesContracts: ["systems/API-orders"],
        consumerType: "partner",
        contact: { team: "partner-team", email: "partner@example.com" },
        quotas: { rateLimit: "100/min", dailyLimit: 10000 },
      })
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Kind-Specific Schema Tests (Delivery) ──────────────────────────────────────

describe("platform schema", () => {
  it("accepts a valid platform", () => {
    const result = validateEaSchema(
      validBase("platform", { platformType: "kubernetes", provider: "aws", region: "us-east-1" })
    );
    expect(result.valid).toBe(true);
  });
});

describe("deployment schema", () => {
  it("accepts a valid deployment", () => {
    const result = validateEaSchema(
      validBase("deployment", {
        environment: "prod",
        replicas: 3,
        resources: { cpu: "500m", memory: "512Mi" },
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects negative replicas", () => {
    const result = validateEaSchema(
      validBase("deployment", { replicas: -1 })
    );
    expect(result.valid).toBe(false);
  });
});

describe("runtime-cluster schema", () => {
  it("accepts a valid runtime-cluster", () => {
    const result = validateEaSchema(
      validBase("runtime-cluster", {
        clusterType: "kubernetes",
        provider: "aws",
        nodeCount: 5,
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("network-zone schema", () => {
  it("accepts a valid network-zone", () => {
    const result = validateEaSchema(
      validBase("network-zone", {
        zoneType: "private",
        cidr: "10.0.0.0/16",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("identity-boundary schema", () => {
  it("accepts a valid identity-boundary", () => {
    const result = validateEaSchema(
      validBase("identity-boundary", {
        boundaryType: "oauth2",
        provider: "auth0",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("cloud-resource schema", () => {
  it("accepts a valid cloud-resource with required fields", () => {
    const result = validateEaSchema(
      validBase("cloud-resource", {
        provider: "aws",
        resourceType: "rds",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing provider", () => {
    const result = validateEaSchema(
      validBase("cloud-resource", { resourceType: "rds" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing resourceType", () => {
    const result = validateEaSchema(
      validBase("cloud-resource", { provider: "aws" })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with all optional fields", () => {
    const result = validateEaSchema(
      validBase("cloud-resource", {
        provider: "aws",
        resourceType: "rds",
        region: "us-east-1",
        account: "123456789",
        resourceId: "i-abc123",
        costCenter: "engineering",
        provisionedBy: "terraform",
        technology: { engine: "postgresql", version: "15", tier: "db.r6g.large" },
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("environment schema", () => {
  it("accepts a valid environment with required fields", () => {
    const result = validateEaSchema(
      validBase("environment", {
        tier: "production",
        isProduction: true,
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing tier", () => {
    const result = validateEaSchema(
      validBase("environment", { isProduction: true })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing isProduction", () => {
    const result = validateEaSchema(
      validBase("environment", { tier: "production" })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with promotion chain", () => {
    const result = validateEaSchema(
      validBase("environment", {
        tier: "staging",
        isProduction: false,
        promotesFrom: "delivery/ENV-dev",
        promotesTo: "delivery/ENV-prod",
        accessLevel: "team",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("technology-standard schema", () => {
  it("accepts a valid technology-standard with required fields", () => {
    const result = validateEaSchema(
      validBase("technology-standard", {
        category: "database",
        technology: "PostgreSQL",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing category", () => {
    const result = validateEaSchema(
      validBase("technology-standard", { technology: "PostgreSQL" })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing technology", () => {
    const result = validateEaSchema(
      validBase("technology-standard", { category: "database" })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with versions and scope", () => {
    const result = validateEaSchema(
      validBase("technology-standard", {
        category: "language",
        technology: "TypeScript",
        approvedVersions: ["5.0", "5.1", "5.2"],
        deprecatedVersions: ["4.9"],
        scope: { teams: ["platform", "commerce"] },
        rationale: "Type safety and ecosystem support",
      })
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Auto-Resolution ────────────────────────────────────────────────────────────

describe("schema auto-resolution from kind", () => {
  it("resolves application schema from kind field", () => {
    const result = validateEaSchema(validBase("application"));
    expect(result.valid).toBe(true);
  });

  it("falls back to entity-base for unknown kinds", () => {
    const result = validateEaSchema(validBase("custom-kind"));
    expect(result.valid).toBe(true); // base schema accepts any kind string
  });
});

// ─── Every registered kind has a schema ─────────────────────────────────────────

describe("schema coverage", () => {
  it("every mapped schema profile has a matching schema", () => {
    const schemaNames = getEaSchemaNames();
    for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
      expect(schemaNames).toContain(entry.schema);
    }
  });
});

// ─── Kind-Specific Schema Tests (Data) ──────────────────────────────────────────

describe("logical-data-model schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("logical-data-model", {
        attributes: [{ name: "id", type: "string", required: true }],
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing attributes", () => {
    const result = validateEaSchema(validBase("logical-data-model"));
    expect(result.valid).toBe(false);
  });

  it("accepts with entityRelations and boundedContext", () => {
    const result = validateEaSchema(
      validBase("logical-data-model", {
        attributes: [{ name: "id", type: "uuid" }],
        entityRelations: [{ target: "Address", cardinality: "1:N" }],
        boundedContext: "orders",
        isAggregateRoot: true,
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("physical-schema schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("physical-schema", { engine: "postgresql" })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing engine", () => {
    const result = validateEaSchema(validBase("physical-schema"));
    expect(result.valid).toBe(false);
  });

  it("accepts with tables", () => {
    const result = validateEaSchema(
      validBase("physical-schema", {
        engine: "postgresql",
        tables: [{
          name: "orders",
          columns: [
            { name: "id", type: "uuid", primaryKey: true },
            { name: "customer_id", type: "uuid", foreignKey: { table: "customers", column: "id" } },
          ],
          indexes: [{ name: "idx_customer", columns: ["customer_id"], unique: false }],
        }],
        managedBy: "migrations",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("data-store schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("data-store", {
        technology: { engine: "postgresql", category: "relational" },
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing technology", () => {
    const result = validateEaSchema(validBase("data-store"));
    expect(result.valid).toBe(false);
  });

  it("accepts with volume and backup", () => {
    const result = validateEaSchema(
      validBase("data-store", {
        technology: { engine: "redis", version: "7.0", category: "cache" },
        dataVolume: { sizeOnDisk: "50GB", growthRate: "5%/month" },
        backup: { frequency: "hourly", pointInTimeRecovery: true },
        isShared: true,
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("lineage schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("lineage", {
        source: { entityRef: "data/STORE-orders-db" },
        destination: { entityRef: "data/STORE-warehouse" },
        mechanism: "etl",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing source", () => {
    const result = validateEaSchema(
      validBase("lineage", {
        destination: { entityRef: "data/STORE-warehouse" },
        mechanism: "etl",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing destination", () => {
    const result = validateEaSchema(
      validBase("lineage", {
        source: { entityRef: "data/STORE-orders-db" },
        mechanism: "etl",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing mechanism", () => {
    const result = validateEaSchema(
      validBase("lineage", {
        source: { entityRef: "data/STORE-orders-db" },
        destination: { entityRef: "data/STORE-warehouse" },
      })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with all optional fields", () => {
    const result = validateEaSchema(
      validBase("lineage", {
        source: { entityRef: "data/STORE-orders-db", description: "Orders DB" },
        destination: { entityRef: "data/STORE-warehouse", description: "Data warehouse" },
        mechanism: "streaming",
        executedBy: "kafka-connect",
        transformation: "flatten nested orders",
        schedule: "real-time",
        latency: "<5s",
        qualityChecks: ["row-count", "schema-match"],
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("master-data-domain schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("master-data-domain", {
        entities: ["Customer"],
        steward: { team: "data-governance" },
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing entities", () => {
    const result = validateEaSchema(
      validBase("master-data-domain", {
        steward: { team: "data-governance" },
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing steward", () => {
    const result = validateEaSchema(
      validBase("master-data-domain", {
        entities: ["Customer"],
      })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with optional fields", () => {
    const result = validateEaSchema(
      validBase("master-data-domain", {
        entities: ["Customer", "Product"],
        steward: { team: "data-governance", contact: "dg@example.com" },
        goldenSource: "data/STORE-crm",
        governanceRules: ["no-PII-in-analytics"],
        matchingStrategy: "fuzzy-name-match",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("data-quality-rule schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("data-quality-rule", {
        ruleType: "not-null",
        appliesTo: ["data/STORE-orders"],
        assertion: "order_id must not be null",
        onFailure: "alert",
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing ruleType", () => {
    const result = validateEaSchema(
      validBase("data-quality-rule", {
        appliesTo: ["data/STORE-orders"],
        assertion: "order_id must not be null",
        onFailure: "alert",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing appliesTo", () => {
    const result = validateEaSchema(
      validBase("data-quality-rule", {
        ruleType: "not-null",
        assertion: "order_id must not be null",
        onFailure: "alert",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing assertion", () => {
    const result = validateEaSchema(
      validBase("data-quality-rule", {
        ruleType: "not-null",
        appliesTo: ["data/STORE-orders"],
        onFailure: "alert",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing onFailure", () => {
    const result = validateEaSchema(
      validBase("data-quality-rule", {
        ruleType: "not-null",
        appliesTo: ["data/STORE-orders"],
        assertion: "order_id must not be null",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with threshold", () => {
    const result = validateEaSchema(
      validBase("data-quality-rule", {
        ruleType: "freshness",
        appliesTo: ["data/STORE-orders"],
        assertion: "Data must be < 1 hour old",
        onFailure: "block",
        threshold: { maxFailureRate: 0.01, maxFailureCount: 100 },
        expression: "age < interval '1 hour'",
        executor: "great-expectations",
        schedule: "hourly",
      })
    );
    expect(result.valid).toBe(true);
  });
});

describe("data-product schema", () => {
  it("accepts valid with required fields", () => {
    const result = validateEaSchema(
      validBase("data-product", {
        domain: "orders",
        outputPorts: [{ name: "orders-table", type: "table" }],
      })
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing domain", () => {
    const result = validateEaSchema(
      validBase("data-product", {
        outputPorts: [{ name: "orders-table", type: "table" }],
      })
    );
    expect(result.valid).toBe(false);
  });

  it("rejects missing outputPorts", () => {
    const result = validateEaSchema(
      validBase("data-product", {
        domain: "orders",
      })
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with all optional fields", () => {
    const result = validateEaSchema(
      validBase("data-product", {
        domain: "orders",
        outputPorts: [
          { name: "orders-api", type: "api", format: "json", location: "/api/v1/orders", contractRef: "systems/API-orders" },
        ],
        inputPorts: [
          { name: "raw-events", sourceRef: "data/STORE-events", description: "Raw order events" },
        ],
        sla: { freshness: "< 5 min", availability: "99.9%", quality: "99.5%" },
        qualityRules: ["data/DQR-orders-not-null"],
        catalog: { catalogRef: "datahub:orders", tags: ["pii", "revenue"], description: "Order data product" },
      })
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Governance Schema Tests ────────────────────────────────────────────────────

describe("workflow-policy schema", () => {
  it("accepts a valid workflow policy", () => {
    const result = validateEaSchema(
      {
        workflowVariants: [
          { id: "feature", name: "Feature", defaultTypes: ["feature"], requiredSchemas: ["change"] },
        ],
        changeRequiredRules: [
          { id: "src-rule", include: ["src/**"] },
        ],
        trivialExemptions: ["**/*.md"],
        lifecycleRules: {
          plannedToActiveRequiresChange: true,
        },
      },
      "workflow-policy"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = validateEaSchema({}, "workflow-policy");
    expect(result.valid).toBe(false);
  });
});

describe("ea-evidence schema", () => {
  it("accepts valid evidence", () => {
    const result = validateEaSchema(
      {
        generatedAt: "2026-01-15T10:00:00Z",
        source: "vitest",
        records: [
          {
            entityRef: "SVC-auth",
            testFile: "src/auth.test.ts",
            kind: "unit",
            status: "passed",
            recordedAt: "2026-01-15T10:00:00Z",
          },
        ],
      },
      "ea-evidence"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing entityRef in records", () => {
    const result = validateEaSchema(
      {
        generatedAt: "2026-01-15T10:00:00Z",
        source: "vitest",
        records: [
          { testFile: "test.ts", kind: "unit", status: "passed", recordedAt: "2026-01-15T10:00:00Z" },
        ],
      },
      "ea-evidence"
    );
    expect(result.valid).toBe(false);
  });
});

describe("ea-verification schema", () => {
  it("accepts valid verification", () => {
    const result = validateEaSchema(
      {
        entityRef: "SVC-auth",
        commands: [
          { name: "typecheck", command: "tsc --noEmit", required: true, status: "pending" },
        ],
      },
      "ea-verification"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects missing entityRef", () => {
    const result = validateEaSchema(
      { commands: [{ name: "test", command: "npm test", required: true }] },
      "ea-verification"
    );
    expect(result.valid).toBe(false);
  });

  it("accepts with drift checks and evidence", () => {
    const result = validateEaSchema(
      {
        entityRef: "WAVE-q1",
        commands: [
          { name: "build", command: "npm run build", required: true },
        ],
        driftChecks: ["anchors", "openapi"],
        evidence: { collected: true, collectedAt: "2026-01-15T10:00:00Z", adapter: "vitest" },
      },
      "ea-verification"
    );
    expect(result.valid).toBe(true);
  });
});
