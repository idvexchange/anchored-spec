/**
 * Tests for Phase 2D: Business Layer Schemas, Types, Quality Rules,
 * Relations, and Drift Rules
 *
 * Covers:
 *  - 8 business-layer kinds in EA_KIND_REGISTRY
 *  - Schema validation for all 8 kinds
 *  - 7 quality rules for business-layer artifacts
 *  - realizes relation extension (business-service → capability/mission)
 *  - 4 new relations (supports, performedBy, governedBy, owns)
 *  - 10 business drift rules including retired-system-dependency
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
  evaluateEaDrift,
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

// ─── Phase 2D: New Relations ────────────────────────────────────────────────────

describe("Phase 2D: New Relations", () => {
  const registry = createDefaultRegistry();

  describe("supports", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("supports");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("supportedBy");
      expect(entry!.validSourceKinds).toContain("application");
      expect(entry!.validSourceKinds).toContain("capability");
      expect(entry!.validTargetKinds).toContain("capability");
      expect(entry!.validTargetKinds).toContain("mission");
      expect(entry!.validTargetKinds).toContain("value-stream");
    });

    it("validates app → capability via supports", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          relations: [{ type: "supports", target: "CAP-fulfillment" }],
        }),
        makeArtifact({ id: "CAP-fulfillment", kind: "capability" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("performedBy", () => {
    it("is registered with correct source and target kinds", () => {
      const entry = registry.get("performedBy");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("performs");
      expect(entry!.validSourceKinds).toContain("capability");
      expect(entry!.validSourceKinds).toContain("process");
      expect(entry!.validTargetKinds).toContain("org-unit");
    });

    it("validates process → org-unit via performedBy", () => {
      const artifacts = [
        makeArtifact({
          id: "PROC-order-processing",
          kind: "process",
          relations: [{ type: "performedBy", target: "ORG-ops" }],
        }),
        makeArtifact({ id: "ORG-ops", kind: "org-unit" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("governedBy", () => {
    it("accepts any source kind (wildcard)", () => {
      const entry = registry.get("governedBy");
      expect(entry).toBeDefined();
      expect(entry!.validSourceKinds).toBe("*");
    });

    it("validates app → policy-objective via governedBy", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          relations: [{ type: "governedBy", target: "POL-order-sla" }],
        }),
        makeArtifact({ id: "POL-order-sla", kind: "policy-objective" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("owns", () => {
    it("is registered with org-unit source and wildcard target", () => {
      const entry = registry.get("owns");
      expect(entry).toBeDefined();
      expect(entry!.validSourceKinds).toEqual(["org-unit"]);
      expect(entry!.validTargetKinds).toBe("*");
    });

    it("validates org-unit → application via owns", () => {
      const artifacts = [
        makeArtifact({
          id: "ORG-eng",
          kind: "org-unit",
          relations: [{ type: "owns", target: "APP-orders" }],
        }),
        makeArtifact({ id: "APP-orders", kind: "application" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects non-org-unit as source for owns", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          relations: [{ type: "owns", target: "APP-billing" }],
        }),
        makeArtifact({ id: "APP-billing", kind: "application" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors.find((e) => e.rule === "ea:relation:invalid-source")).toBeDefined();
    });
  });
});

// ─── Phase 2D: Drift Rules ─────────────────────────────────────────────────────

describe("Phase 2D: Business Drift Rules", () => {

  describe("ea:business/no-realizing-systems", () => {
    it("fires when active capability has no realizing systems", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-lonely", kind: "capability", status: "active" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/no-realizing-systems")).toBeDefined();
    });

    it("does not fire when capability has a realizes relation", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-good", kind: "capability", status: "active" }),
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          relations: [{ type: "realizes", target: "CAP-good" }],
        }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/no-realizing-systems")).toBeUndefined();
    });
  });

  describe("ea:business/retired-system-dependency", () => {
    it("fires when active capability is realized by retired system", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-fulfillment", kind: "capability", status: "active" }),
        makeArtifact({
          id: "APP-legacy",
          kind: "application",
          status: "retired",
          relations: [{ type: "realizes", target: "CAP-fulfillment" }],
        }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:business/retired-system-dependency")).toBeDefined();
    });

    it("does not fire when realizing system is active", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-fulfillment", kind: "capability", status: "active" }),
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          status: "active",
          relations: [{ type: "realizes", target: "CAP-fulfillment" }],
        }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:business/retired-system-dependency")).toBeUndefined();
    });
  });

  describe("ea:business/process-missing-owner", () => {
    it("fires when process has no owner", () => {
      const artifacts = [
        makeArtifact({ id: "PROC-orphan", kind: "process" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/process-missing-owner")).toBeDefined();
    });

    it("does not fire when process has processOwner field", () => {
      const artifacts = [
        makeArtifact({ id: "PROC-owned", kind: "process", processOwner: "ops-lead" } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/process-missing-owner")).toBeUndefined();
    });
  });

  describe("ea:business/control-missing-evidence", () => {
    it("fires when automated control has no evidence", () => {
      const artifacts = [
        makeArtifact({
          id: "CTRL-no-evidence",
          kind: "control",
          controlType: "detective",
          implementation: "automated",
          assertion: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/control-missing-evidence")).toBeDefined();
    });

    it("does not fire when manual control has no evidence", () => {
      const artifacts = [
        makeArtifact({
          id: "CTRL-manual",
          kind: "control",
          controlType: "detective",
          implementation: "manual",
          assertion: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/control-missing-evidence")).toBeUndefined();
    });
  });

  describe("ea:business/orphan-capability", () => {
    it("fires when capability has no parent, children, or systems", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-island", kind: "capability", level: 1 } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/orphan-capability")).toBeDefined();
    });

    it("does not fire when capability has a child", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-parent", kind: "capability", level: 1 } as any),
        makeArtifact({ id: "CAP-child", kind: "capability", level: 2, parentCapability: "CAP-parent" } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/orphan-capability" && w.path === "CAP-parent")).toBeUndefined();
    });
  });

  describe("ea:business/mission-no-capabilities", () => {
    it("fires when mission has no supporting capabilities", () => {
      const artifacts = [
        makeArtifact({ id: "MISSION-lonely", kind: "mission" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/mission-no-capabilities")).toBeDefined();
    });

    it("does not fire when mission has supports relation", () => {
      const artifacts = [
        makeArtifact({ id: "MISSION-good", kind: "mission" }),
        makeArtifact({
          id: "CAP-commerce",
          kind: "capability",
          relations: [{ type: "supports", target: "MISSION-good" }],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/mission-no-capabilities")).toBeUndefined();
    });
  });

  describe("ea:business/policy-no-controls", () => {
    it("fires when policy has no enforcing controls", () => {
      const artifacts = [
        makeArtifact({ id: "POL-lonely", kind: "policy-objective", category: "sla", objective: "test" } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/policy-no-controls")).toBeDefined();
    });

    it("does not fire when policy has enforcedBy", () => {
      const artifacts = [
        makeArtifact({
          id: "POL-enforced",
          kind: "policy-objective",
          category: "sla",
          objective: "test",
          enforcedBy: ["CTRL-latency"],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/policy-no-controls")).toBeUndefined();
    });
  });

  describe("ea:business/value-stream-bottleneck", () => {
    it("fires when value stream has bottleneck stage", () => {
      const artifacts = [
        makeArtifact({
          id: "VS-onboarding",
          kind: "value-stream",
          stages: [
            { id: "s1", name: "Registration", supportingCapabilities: [], bottleneck: false },
            { id: "s2", name: "KYC Check", supportingCapabilities: [], bottleneck: true },
          ],
          customer: "test",
          valueProposition: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:business/value-stream-bottleneck")).toBeDefined();
    });
  });

  it("evaluates all 27 static drift rules", () => {
    const result = evaluateEaDrift([]);
    expect(result.rulesEvaluated).toBe(27);
    expect(result.rulesSkipped).toBe(5);
  });
});

// ─── Phase 2D: Capability Map Report ────────────────────────────────────────────

import { buildCapabilityMap, renderCapabilityMapMarkdown } from "../index.js";

describe("Phase 2D: Capability Map Report", () => {
  it("returns empty report when no capabilities exist", () => {
    const report = buildCapabilityMap([]);
    expect(report.missions).toHaveLength(0);
    expect(report.unmappedCapabilities).toHaveLength(0);
    expect(report.summary.capabilityCount).toBe(0);
  });

  it("builds hierarchy from parentCapability", () => {
    const artifacts = [
      makeArtifact({ id: "CAP-commerce", kind: "capability", level: 1 } as any),
      makeArtifact({ id: "CAP-orders", kind: "capability", level: 2, parentCapability: "CAP-commerce" } as any),
      makeArtifact({ id: "CAP-payments", kind: "capability", level: 2, parentCapability: "CAP-commerce" } as any),
    ];
    const report = buildCapabilityMap(artifacts);
    expect(report.summary.capabilityCount).toBe(3);
    // All unmapped since no mission
    expect(report.unmappedCapabilities).toHaveLength(1);
    expect(report.unmappedCapabilities[0].id).toBe("CAP-commerce");
    expect(report.unmappedCapabilities[0].children).toHaveLength(2);
  });

  it("maps capabilities to missions via supports", () => {
    const artifacts = [
      makeArtifact({ id: "MISSION-digital", kind: "mission" }),
      makeArtifact({
        id: "CAP-commerce",
        kind: "capability",
        level: 1,
        relations: [{ type: "supports", target: "MISSION-digital" }],
      } as any),
      makeArtifact({ id: "CAP-orders", kind: "capability", level: 2, parentCapability: "CAP-commerce" } as any),
    ];
    const report = buildCapabilityMap(artifacts);
    expect(report.missions).toHaveLength(1);
    expect(report.missions[0].id).toBe("MISSION-digital");
    expect(report.missions[0].capabilities).toHaveLength(1);
    expect(report.missions[0].capabilities[0].id).toBe("CAP-commerce");
    expect(report.missions[0].capabilities[0].children).toHaveLength(1);
    expect(report.unmappedCapabilities).toHaveLength(0);
  });

  it("enriches capabilities with realizing systems", () => {
    const artifacts = [
      makeArtifact({ id: "CAP-orders", kind: "capability", level: 1 } as any),
      makeArtifact({
        id: "APP-orders",
        kind: "application",
        relations: [{ type: "realizes", target: "CAP-orders" }],
      }),
    ];
    const report = buildCapabilityMap(artifacts);
    const cap = report.unmappedCapabilities[0];
    expect(cap.realizingSystems).toEqual(["APP-orders"]);
    expect(report.summary.realizingSystemCount).toBe(1);
  });

  it("enriches capabilities with processes", () => {
    const artifacts = [
      makeArtifact({ id: "CAP-orders", kind: "capability", level: 1 } as any),
      makeArtifact({
        id: "PROC-order-processing",
        kind: "process",
        relations: [{ type: "realizes", target: "CAP-orders" }],
      }),
    ];
    const report = buildCapabilityMap(artifacts);
    expect(report.unmappedCapabilities[0].processes).toEqual(["PROC-order-processing"]);
  });

  it("enriches capabilities with controls via governedBy", () => {
    const artifacts = [
      makeArtifact({
        id: "CAP-orders",
        kind: "capability",
        level: 1,
        relations: [{ type: "governedBy", target: "CTRL-latency" }],
      } as any),
      makeArtifact({
        id: "CTRL-latency",
        kind: "control",
        controlType: "detective",
        implementation: "automated",
        assertion: "latency < 200ms",
      } as any),
    ];
    const report = buildCapabilityMap(artifacts);
    expect(report.unmappedCapabilities[0].controls).toEqual(["CTRL-latency"]);
  });

  it("enriches capabilities with owning org via owns", () => {
    const artifacts = [
      makeArtifact({ id: "CAP-orders", kind: "capability", level: 1 } as any),
      makeArtifact({
        id: "ORG-eng",
        kind: "org-unit",
        relations: [{ type: "owns", target: "CAP-orders" }],
      }),
    ];
    const report = buildCapabilityMap(artifacts);
    expect(report.unmappedCapabilities[0].owningOrg).toBe("ORG-eng");
  });

  it("includes heatMap and maturity metadata", () => {
    const artifacts = [
      makeArtifact({
        id: "CAP-orders",
        kind: "capability",
        level: 1,
        maturity: "managed",
        strategicImportance: "core",
        investmentProfile: "invest",
        heatMap: { businessValue: "high", technicalHealth: "fair", risk: "medium" },
      } as any),
    ];
    const report = buildCapabilityMap(artifacts);
    const cap = report.unmappedCapabilities[0];
    expect(cap.maturity).toBe("managed");
    expect(cap.strategicImportance).toBe("core");
    expect(cap.investmentProfile).toBe("invest");
    expect(cap.heatMap).toEqual({ businessValue: "high", technicalHealth: "fair", risk: "medium" });
  });

  it("includes drift summary per capability", () => {
    // Active capability with no realizing systems → should produce a drift warning
    const artifacts = [
      makeArtifact({ id: "CAP-lonely", kind: "capability", level: 1, status: "active" } as any),
    ];
    const report = buildCapabilityMap(artifacts);
    const cap = report.unmappedCapabilities[0];
    expect(cap.driftSummary.warnings).toBeGreaterThan(0);
    expect(report.summary.driftWarningCount).toBeGreaterThan(0);
  });

  it("computes maxDepth correctly", () => {
    const artifacts = [
      makeArtifact({ id: "CAP-l1", kind: "capability", level: 1 } as any),
      makeArtifact({ id: "CAP-l2", kind: "capability", level: 2, parentCapability: "CAP-l1" } as any),
      makeArtifact({ id: "CAP-l3", kind: "capability", level: 3, parentCapability: "CAP-l2" } as any),
    ];
    const report = buildCapabilityMap(artifacts);
    expect(report.summary.maxDepth).toBe(3);
  });

  describe("renderCapabilityMapMarkdown", () => {
    it("renders empty report", () => {
      const report = buildCapabilityMap([]);
      const md = renderCapabilityMapMarkdown(report);
      expect(md).toContain("# Capability Map");
      expect(md).toContain("_No capabilities found._");
    });

    it("renders missions with capability trees", () => {
      const artifacts = [
        makeArtifact({ id: "MISSION-digital", kind: "mission" }),
        makeArtifact({
          id: "CAP-commerce",
          kind: "capability",
          level: 1,
          strategicImportance: "core",
          investmentProfile: "invest",
          maturity: "managed",
          relations: [{ type: "supports", target: "MISSION-digital" }],
        } as any),
        makeArtifact({
          id: "CAP-orders",
          kind: "capability",
          level: 2,
          parentCapability: "CAP-commerce",
        } as any),
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          status: "active",
          relations: [{ type: "realizes", target: "CAP-orders" }],
        }),
      ];
      const report = buildCapabilityMap(artifacts);
      const md = renderCapabilityMapMarkdown(report);
      expect(md).toContain("## Mission: MISSION-digital");
      expect(md).toContain("**L1: CAP-commerce**");
      expect(md).toContain("core, invest, maturity: managed");
      expect(md).toContain("Realized by:");
      expect(md).toContain("`APP-orders`");
      expect(md).toContain("## Summary");
    });

    it("renders unmapped capabilities section", () => {
      const artifacts = [
        makeArtifact({ id: "CAP-orphan", kind: "capability", level: 1 } as any),
      ];
      const report = buildCapabilityMap(artifacts);
      const md = renderCapabilityMapMarkdown(report);
      expect(md).toContain("## Unmapped Capabilities");
    });
  });
});
