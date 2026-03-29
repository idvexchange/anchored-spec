/**
 * Tests for Phase 2D: Business Layer Schemas, Types, Quality Rules
 *
 * Covers:
 *  - 8 business-layer kinds in EA_KIND_REGISTRY
 *  - Schema validation for all 8 kinds
 *  - 7 quality rules for business-layer artifacts
 *  - realizes relation extension (business-service → capability/mission)
 */

import { describe, it, expect } from "vitest";
import {
  EA_KIND_REGISTRY,
  getKindEntry,
  getKindsByDomain,
  createDefaultRegistry,
  validateEaArtifacts,
  validateEaRelations,
  validateEaSchema,
} from "../index.js";
import type { EaArtifactBase } from "../index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    summary: "A well-described artifact for testing purposes.",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
}

// ─── Kind Registry ──────────────────────────────────────────────────────────────

describe("Phase 2D: Business Layer Kinds", () => {
  const bizKinds = getKindsByDomain("business");

  it("registers 8 business-layer kinds", () => {
    expect(bizKinds).toHaveLength(8);
  });

  it.each([
    ["mission", "MISSION"],
    ["capability", "CAP"],
    ["value-stream", "VS"],
    ["process", "PROC"],
    ["org-unit", "ORG"],
    ["policy-objective", "POL"],
    ["business-service", "BSVC"],
    ["control", "CTRL"],
  ])("registers %s with prefix %s", (kind, prefix) => {
    const entry = getKindEntry(kind);
    expect(entry).toBeDefined();
    expect(entry!.prefix).toBe(prefix);
    expect(entry!.domain).toBe("business");
  });
});

// ─── Schema Validation ──────────────────────────────────────────────────────────

describe("Phase 2D: Schema Validation", () => {
  describe("mission", () => {
    it("validates a valid mission", () => {
      const result = validateEaSchema({
        id: "MISSION-digital-commerce",
        schemaVersion: "1.0.0",
        kind: "mission",
        title: "Digital Commerce Excellence",
        status: "active",
        summary: "Drive digital commerce growth",
        owners: ["cto"],
        confidence: "declared",
        timeHorizon: "long-term",
        keyResults: [{ id: "kr-1", description: "Increase online revenue by 50%", metric: "revenue", target: "150M" }],
        strategicThemes: ["digital-first", "customer-experience"],
        sponsor: "CEO",
      }, "mission");
      expect(result.valid).toBe(true);
    });

    it("validates minimal mission (no required kind-specific fields)", () => {
      const result = validateEaSchema({
        id: "MISSION-basic",
        schemaVersion: "1.0.0",
        kind: "mission",
        title: "Basic Mission",
        status: "draft",
        summary: "A basic mission",
        owners: ["team"],
        confidence: "declared",
      }, "mission");
      expect(result.valid).toBe(true);
    });
  });

  describe("capability", () => {
    it("validates a valid capability", () => {
      const result = validateEaSchema({
        id: "CAP-order-fulfillment",
        schemaVersion: "1.0.0",
        kind: "capability",
        title: "Order Fulfillment",
        status: "active",
        summary: "Capability to fulfill customer orders",
        owners: ["team-ops"],
        confidence: "declared",
        level: 2,
        parentCapability: "CAP-commerce",
        maturity: "managed",
        strategicImportance: "core",
        investmentProfile: "invest",
        heatMap: { businessValue: "high", technicalHealth: "fair", risk: "medium" },
      }, "capability");
      expect(result.valid).toBe(true);
    });

    it("rejects missing level", () => {
      const result = validateEaSchema({
        id: "CAP-bad",
        schemaVersion: "1.0.0",
        kind: "capability",
        title: "Bad Cap",
        status: "active",
        summary: "Missing level",
        owners: ["team"],
        confidence: "declared",
      }, "capability");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid maturity enum", () => {
      const result = validateEaSchema({
        id: "CAP-bad",
        schemaVersion: "1.0.0",
        kind: "capability",
        title: "Bad",
        status: "active",
        summary: "Invalid maturity",
        owners: ["team"],
        confidence: "declared",
        level: 1,
        maturity: "invalid",
      }, "capability");
      expect(result.valid).toBe(false);
    });
  });

  describe("value-stream", () => {
    it("validates a valid value-stream", () => {
      const result = validateEaSchema({
        id: "VS-customer-onboarding",
        schemaVersion: "1.0.0",
        kind: "value-stream",
        title: "Customer Onboarding",
        status: "active",
        summary: "End-to-end customer onboarding",
        owners: ["team-growth"],
        confidence: "declared",
        stages: [
          { id: "s1", name: "Registration", supportingCapabilities: ["CAP-identity"], duration: "5min" },
          { id: "s2", name: "Verification", supportingCapabilities: ["CAP-kyc"], bottleneck: true },
        ],
        customer: "New customers",
        valueProposition: "Seamless onboarding experience",
        trigger: "Customer signup",
        outcome: "Active account",
      }, "value-stream");
      expect(result.valid).toBe(true);
    });

    it("rejects missing stages", () => {
      const result = validateEaSchema({
        id: "VS-bad",
        schemaVersion: "1.0.0",
        kind: "value-stream",
        title: "Bad VS",
        status: "active",
        summary: "Missing stages",
        owners: ["team"],
        confidence: "declared",
        customer: "test",
        valueProposition: "test",
      }, "value-stream");
      expect(result.valid).toBe(false);
    });
  });

  describe("process", () => {
    it("validates a valid process", () => {
      const result = validateEaSchema({
        id: "PROC-order-processing",
        schemaVersion: "1.0.0",
        kind: "process",
        title: "Order Processing",
        status: "active",
        summary: "Process customer orders",
        owners: ["team-ops"],
        confidence: "declared",
        steps: [
          { id: "s1", name: "Receive Order", actor: "system", systemRef: "APP-orders", automated: true },
          { id: "s2", name: "Validate Payment", actor: "payment-gateway" },
        ],
        processOwner: "operations-lead",
        regulated: false,
      }, "process");
      expect(result.valid).toBe(true);
    });
  });

  describe("org-unit", () => {
    it("validates a valid org-unit", () => {
      const result = validateEaSchema({
        id: "ORG-engineering",
        schemaVersion: "1.0.0",
        kind: "org-unit",
        title: "Engineering",
        status: "active",
        summary: "Engineering department",
        owners: ["vp-eng"],
        confidence: "declared",
        unitType: "department",
        lead: "VP Engineering",
        size: 50,
        locations: ["SF", "NYC"],
        costCenter: "CC-100",
      }, "org-unit");
      expect(result.valid).toBe(true);
    });

    it("rejects missing unitType", () => {
      const result = validateEaSchema({
        id: "ORG-bad",
        schemaVersion: "1.0.0",
        kind: "org-unit",
        title: "Bad Org",
        status: "active",
        summary: "Missing type",
        owners: ["team"],
        confidence: "declared",
      }, "org-unit");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid unitType enum", () => {
      const result = validateEaSchema({
        id: "ORG-bad",
        schemaVersion: "1.0.0",
        kind: "org-unit",
        title: "Bad Org",
        status: "active",
        summary: "Invalid type",
        owners: ["team"],
        confidence: "declared",
        unitType: "invalid",
      }, "org-unit");
      expect(result.valid).toBe(false);
    });
  });

  describe("policy-objective", () => {
    it("validates a valid policy-objective", () => {
      const result = validateEaSchema({
        id: "POL-order-sla",
        schemaVersion: "1.0.0",
        kind: "policy-objective",
        title: "Order SLA",
        status: "active",
        summary: "Order processing SLA",
        owners: ["team-ops"],
        confidence: "declared",
        category: "sla",
        objective: "Orders must be processed within 2 hours",
        target: { metric: "processing_time_p99", threshold: "2h", currentValue: "1.5h" },
        enforcedBy: ["CTRL-order-latency"],
      }, "policy-objective");
      expect(result.valid).toBe(true);
    });

    it("rejects missing objective", () => {
      const result = validateEaSchema({
        id: "POL-bad",
        schemaVersion: "1.0.0",
        kind: "policy-objective",
        title: "Bad Policy",
        status: "active",
        summary: "Missing objective",
        owners: ["team"],
        confidence: "declared",
        category: "sla",
      }, "policy-objective");
      expect(result.valid).toBe(false);
    });
  });

  describe("business-service", () => {
    it("validates a valid business-service", () => {
      const result = validateEaSchema({
        id: "BSVC-online-store",
        schemaVersion: "1.0.0",
        kind: "business-service",
        title: "Online Store",
        status: "active",
        summary: "Customer-facing online store",
        owners: ["team-commerce"],
        confidence: "declared",
        serviceType: "customer-facing",
        channels: ["web", "mobile"],
        revenueImpact: "direct",
        serviceLevel: "99.9% availability",
      }, "business-service");
      expect(result.valid).toBe(true);
    });

    it("rejects missing serviceType", () => {
      const result = validateEaSchema({
        id: "BSVC-bad",
        schemaVersion: "1.0.0",
        kind: "business-service",
        title: "Bad Service",
        status: "active",
        summary: "Missing type",
        owners: ["team"],
        confidence: "declared",
      }, "business-service");
      expect(result.valid).toBe(false);
    });
  });

  describe("control", () => {
    it("validates a valid control", () => {
      const result = validateEaSchema({
        id: "CTRL-order-latency",
        schemaVersion: "1.0.0",
        kind: "control",
        title: "Order Latency Monitoring",
        status: "active",
        summary: "Monitors order processing latency",
        owners: ["team-sre"],
        confidence: "declared",
        controlType: "detective",
        implementation: "automated",
        assertion: "P99 order processing latency < 2 hours",
        mechanism: "Prometheus alert rule",
        frequency: "continuous",
        onViolation: { action: "alert", target: "ops-channel", description: "Alert on-call" },
        frameworks: ["SOC2"],
      }, "control");
      expect(result.valid).toBe(true);
    });

    it("rejects missing assertion", () => {
      const result = validateEaSchema({
        id: "CTRL-bad",
        schemaVersion: "1.0.0",
        kind: "control",
        title: "Bad Control",
        status: "active",
        summary: "Missing assertion",
        owners: ["team"],
        confidence: "declared",
        controlType: "detective",
        implementation: "automated",
      }, "control");
      expect(result.valid).toBe(false);
    });

    it("rejects invalid controlType", () => {
      const result = validateEaSchema({
        id: "CTRL-bad",
        schemaVersion: "1.0.0",
        kind: "control",
        title: "Bad",
        status: "active",
        summary: "Invalid type",
        owners: ["team"],
        confidence: "declared",
        controlType: "invalid",
        implementation: "automated",
        assertion: "test",
      }, "control");
      expect(result.valid).toBe(false);
    });
  });
});

// ─── Quality Rules ──────────────────────────────────────────────────────────────

describe("Phase 2D: Quality Rules", () => {
  it("ea:quality:capability-missing-level — fires on missing level", () => {
    const artifacts = [makeArtifact({ id: "CAP-no-level", kind: "capability" } as any)];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:capability-missing-level")).toBeDefined();
  });

  it("ea:quality:process-missing-steps — fires on empty steps", () => {
    const artifacts = [makeArtifact({ id: "PROC-no-steps", kind: "process", steps: [] } as any)];
    const result = validateEaArtifacts(artifacts);
    expect(result.warnings.find((w) => w.rule === "ea:quality:process-missing-steps")).toBeDefined();
  });

  it("ea:quality:value-stream-missing-stages — fires on missing stages", () => {
    const artifacts = [makeArtifact({ id: "VS-no-stages", kind: "value-stream", stages: [] } as any)];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:value-stream-missing-stages")).toBeDefined();
  });

  it("ea:quality:control-missing-assertion — fires on empty assertion", () => {
    const artifacts = [makeArtifact({
      id: "CTRL-no-assert",
      kind: "control",
      controlType: "detective",
      implementation: "automated",
      assertion: "",
    } as any)];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:control-missing-assertion")).toBeDefined();
  });

  it("ea:quality:org-unit-missing-type — fires on missing unitType", () => {
    const artifacts = [makeArtifact({ id: "ORG-no-type", kind: "org-unit", unitType: "" } as any)];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:org-unit-missing-type")).toBeDefined();
  });

  it("ea:quality:policy-missing-objective — fires on empty objective", () => {
    const artifacts = [makeArtifact({
      id: "POL-no-obj",
      kind: "policy-objective",
      category: "sla",
      objective: "",
    } as any)];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:policy-missing-objective")).toBeDefined();
  });

  it("ea:quality:mission-missing-key-results — fires as info on missing KRs", () => {
    const artifacts = [makeArtifact({ id: "MISSION-no-kr", kind: "mission" } as any)];
    const result = validateEaArtifacts(artifacts);
    // info severity maps to warnings
    expect(result.warnings.find((w) => w.rule === "ea:quality:mission-missing-key-results")).toBeDefined();
  });
});

// ─── Relation Extension: realizes ───────────────────────────────────────────────

describe("Phase 2D: realizes Extension", () => {
  const registry = createDefaultRegistry();

  it("accepts business-service as valid source for realizes", () => {
    expect(registry.isValidSource("realizes", "business-service")).toBe(true);
  });

  it("accepts capability as valid target for realizes", () => {
    expect(registry.isValidTarget("realizes", "capability")).toBe(true);
  });

  it("accepts mission as valid target for realizes", () => {
    expect(registry.isValidTarget("realizes", "mission")).toBe(true);
  });

  it("validates application → capability via realizes", () => {
    const artifacts = [
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "realizes", target: "CAP-fulfillment" }],
      }),
      makeArtifact({ id: "CAP-fulfillment", kind: "capability" }),
    ];
    const result = validateEaRelations(artifacts, registry);
    expect(result.errors).toHaveLength(0);
  });
});
