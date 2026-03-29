import { describe, it, expect, beforeEach } from "vitest";
import { validateEaSchema, resetEaAjv, getSchemaForKind, getEaSchemaNames } from "../validate.js";
import type { EaSchemaName } from "../validate.js";
import { EA_KIND_REGISTRY } from "../types.js";

beforeEach(() => {
  resetEaAjv();
});

// ─── Helper: minimal valid base artifact ────────────────────────────────────────

function validBase(kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `systems/TEST-${kind}`,
    schemaVersion: "1.0.0",
    kind,
    title: `Test ${kind}`,
    status: "active",
    summary: `A test ${kind} artifact for schema validation.`,
    owners: ["test-team"],
    confidence: "declared",
    ...extra,
  };
}

// ─── Schema Registry ────────────────────────────────────────────────────────────

describe("getEaSchemaNames", () => {
  it("returns 18 schema names (3 base + 15 kinds)", () => {
    const names = getEaSchemaNames();
    expect(names).toHaveLength(18);
    expect(names).toContain("artifact-base");
    expect(names).toContain("relation");
    expect(names).toContain("anchors");
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

describe("artifact-base schema", () => {
  it("accepts a valid base artifact", () => {
    const result = validateEaSchema(validBase("application"), "artifact-base");
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing required fields", () => {
    const result = validateEaSchema({}, "artifact-base");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid status enum", () => {
    const result = validateEaSchema(
      validBase("application", { status: "bogus" }),
      "artifact-base"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("status"))).toBe(true);
  });

  it("rejects invalid confidence enum", () => {
    const result = validateEaSchema(
      validBase("application", { confidence: "guess" }),
      "artifact-base"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty owners array", () => {
    const result = validateEaSchema(
      validBase("application", { owners: [] }),
      "artifact-base"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects summary that is too short", () => {
    const result = validateEaSchema(
      validBase("application", { summary: "short" }),
      "artifact-base"
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
      "artifact-base"
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

  it("falls back to artifact-base for unknown kinds", () => {
    const result = validateEaSchema(validBase("custom-kind"));
    expect(result.valid).toBe(true); // base schema accepts any kind string
  });
});

// ─── Every registered kind has a schema ─────────────────────────────────────────

describe("schema coverage", () => {
  it("every kind in EA_KIND_REGISTRY has a matching schema", () => {
    const schemaNames = getEaSchemaNames();
    for (const entry of EA_KIND_REGISTRY) {
      expect(schemaNames).toContain(entry.kind);
    }
  });
});
