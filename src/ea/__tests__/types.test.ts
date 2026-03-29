import { describe, it, expect } from "vitest";
import {
  EA_DOMAINS,
  EA_KIND_REGISTRY,
  getKindEntry,
  getKindsByDomain,
  getKindPrefix,
  getDomainForKind,
  isValidEaId,
} from "../types.js";
import type {
  EaArtifactBase,
  EaRelation,
  EaAnchors,
  ApplicationArtifact,
  ApiContractArtifact,
  DeploymentArtifact,
  EaArtifact,
} from "../types.js";

// ─── Domain Constants ───────────────────────────────────────────────────────────

describe("EA_DOMAINS", () => {
  it("contains all six domains", () => {
    expect(EA_DOMAINS).toEqual([
      "systems",
      "delivery",
      "data",
      "information",
      "business",
      "transitions",
    ]);
  });
});

// ─── Kind Registry ──────────────────────────────────────────────────────────────

describe("EA_KIND_REGISTRY", () => {
  it("contains 36 kinds (15 Phase A + 7 Data + 6 Information + 8 Business)", () => {
    expect(EA_KIND_REGISTRY).toHaveLength(36);
  });

  it("has 7 systems kinds, 8 delivery kinds, and 7 data kinds", () => {
    const systems = EA_KIND_REGISTRY.filter((e) => e.domain === "systems");
    const delivery = EA_KIND_REGISTRY.filter((e) => e.domain === "delivery");
    const data = EA_KIND_REGISTRY.filter((e) => e.domain === "data");
    expect(systems).toHaveLength(7);
    expect(delivery).toHaveLength(8);
    expect(data).toHaveLength(7);
  });

  it("has unique prefixes", () => {
    const prefixes = EA_KIND_REGISTRY.map((e) => e.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("has unique kind names", () => {
    const kinds = EA_KIND_REGISTRY.map((e) => e.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("getKindEntry", () => {
  it("returns the entry for a known kind", () => {
    const entry = getKindEntry("application");
    expect(entry).toEqual({
      kind: "application",
      prefix: "APP",
      domain: "systems",
      description: expect.any(String),
    });
  });

  it("returns undefined for an unknown kind", () => {
    expect(getKindEntry("nonexistent")).toBeUndefined();
  });
});

describe("getKindsByDomain", () => {
  it("returns systems kinds", () => {
    const kinds = getKindsByDomain("systems");
    expect(kinds.map((k) => k.kind)).toContain("application");
    expect(kinds.map((k) => k.kind)).toContain("api-contract");
  });

  it("returns data domain kinds", () => {
    const kinds = getKindsByDomain("data");
    expect(kinds).toHaveLength(7);
    expect(kinds.map((k) => k.kind)).toContain("logical-data-model");
    expect(kinds.map((k) => k.kind)).toContain("data-product");
  });
});

describe("getKindPrefix", () => {
  it("returns the prefix for a known kind", () => {
    expect(getKindPrefix("application")).toBe("APP");
    expect(getKindPrefix("deployment")).toBe("DEPLOY");
    expect(getKindPrefix("api-contract")).toBe("API");
  });

  it("returns undefined for an unknown kind", () => {
    expect(getKindPrefix("nonexistent")).toBeUndefined();
  });
});

describe("getDomainForKind", () => {
  it("returns the domain for a known kind", () => {
    expect(getDomainForKind("application")).toBe("systems");
    expect(getDomainForKind("deployment")).toBe("delivery");
  });
});

// ─── ID Validation ──────────────────────────────────────────────────────────────

describe("isValidEaId", () => {
  it("accepts valid domain-qualified IDs", () => {
    expect(isValidEaId("systems/APP-order-service")).toBe(true);
    expect(isValidEaId("delivery/DEPLOY-order-service-prod")).toBe(true);
    expect(isValidEaId("systems/API-orders-api")).toBe(true);
  });

  it("accepts valid short IDs", () => {
    expect(isValidEaId("APP-order-service")).toBe(true);
    expect(isValidEaId("DEPLOY-order-prod")).toBe(true);
  });

  it("rejects IDs with invalid domain", () => {
    expect(isValidEaId("invalid-domain/APP-foo")).toBe(false);
  });

  it("rejects IDs without a slug", () => {
    expect(isValidEaId("APP-")).toBe(false);
    expect(isValidEaId("APP")).toBe(false);
  });

  it("rejects IDs with uppercase slug", () => {
    expect(isValidEaId("APP-OrderService")).toBe(false);
  });

  it("validates prefix against kind when provided", () => {
    expect(isValidEaId("APP-order-service", "application")).toBe(true);
    expect(isValidEaId("SVC-order-service", "application")).toBe(false);
  });

  it("passes when kind has no registered prefix", () => {
    expect(isValidEaId("CUSTOM-foo", "unknown-kind")).toBe(true);
  });

  it("rejects IDs with too many slashes", () => {
    expect(isValidEaId("a/b/c")).toBe(false);
  });
});

// ─── Type Shape Verification ────────────────────────────────────────────────────

describe("Type shapes", () => {
  it("EaArtifactBase has all required fields", () => {
    const artifact: EaArtifactBase = {
      id: "systems/APP-test",
      schemaVersion: "1.0.0",
      kind: "application",
      title: "Test App",
      status: "active",
      summary: "A test application for type verification.",
      owners: ["test-team"],
      confidence: "declared",
    };
    expect(artifact.id).toBe("systems/APP-test");
    expect(artifact.kind).toBe("application");
  });

  it("ApplicationArtifact extends base with technology", () => {
    const app: ApplicationArtifact = {
      id: "systems/APP-order-service",
      schemaVersion: "1.0.0",
      kind: "application",
      title: "Order Service",
      status: "active",
      summary: "Primary system responsible for order orchestration.",
      owners: ["platform-orders"],
      confidence: "declared",
      technology: {
        language: "typescript",
        framework: "nestjs",
        runtime: "node",
      },
      repository: "https://github.com/acme/order-service",
    };
    expect(app.technology?.language).toBe("typescript");
    expect(app.repository).toContain("github.com");
  });

  it("ApiContractArtifact extends base with protocol fields", () => {
    const api: ApiContractArtifact = {
      id: "systems/API-orders",
      schemaVersion: "1.0.0",
      kind: "api-contract",
      title: "Orders API",
      status: "active",
      summary: "REST API for order management.",
      owners: ["platform-orders"],
      confidence: "declared",
      protocol: "rest",
      specFormat: "openapi",
      specPath: "api/openapi.yaml",
      version: "2.1.0",
    };
    expect(api.protocol).toBe("rest");
    expect(api.specFormat).toBe("openapi");
  });

  it("DeploymentArtifact extends base with environment/replicas", () => {
    const dep: DeploymentArtifact = {
      id: "delivery/DEPLOY-order-prod",
      schemaVersion: "1.0.0",
      kind: "deployment",
      title: "Order Service Prod",
      status: "active",
      summary: "Production deployment of the order service.",
      owners: ["platform-orders"],
      confidence: "declared",
      environment: "prod",
      replicas: 3,
      resources: { cpu: "500m", memory: "512Mi" },
    };
    expect(dep.replicas).toBe(3);
    expect(dep.resources?.cpu).toBe("500m");
  });

  it("EaRelation has required type and target", () => {
    const rel: EaRelation = {
      type: "dependsOn",
      target: "systems/APP-payment",
      criticality: "high",
    };
    expect(rel.type).toBe("dependsOn");
    expect(rel.target).toBe("systems/APP-payment");
  });

  it("EaAnchors supports all anchor types", () => {
    const anchors: EaAnchors = {
      symbols: ["OrderService"],
      apis: ["POST /orders", "GET /orders/:id"],
      events: ["order.created"],
      schemas: ["OrderSchema"],
      infra: ["kubernetes:deployment/order-service"],
      catalogRefs: ["service:order-service"],
      iam: ["aws:iam-role/order-service"],
      network: ["aws:security-group/sg-123"],
      other: { custom: ["ref-1"] },
    };
    expect(anchors.apis).toHaveLength(2);
    expect(anchors.other?.custom).toEqual(["ref-1"]);
  });

  it("EaArtifact union accepts different kinds", () => {
    const artifacts: EaArtifact[] = [
      {
        id: "systems/APP-test",
        schemaVersion: "1.0.0",
        kind: "application",
        title: "Test",
        status: "active",
        summary: "Test application for union verification.",
        owners: ["test"],
        confidence: "declared",
      },
      {
        id: "delivery/DEPLOY-test",
        schemaVersion: "1.0.0",
        kind: "deployment",
        title: "Test Deploy",
        status: "active",
        summary: "Test deployment for union verification.",
        owners: ["test"],
        confidence: "declared",
        replicas: 2,
      },
    ];
    expect(artifacts).toHaveLength(2);
  });
});
