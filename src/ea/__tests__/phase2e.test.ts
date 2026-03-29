/**
 * Tests for Phase 2E: Transition Layer Schemas, Types, Quality Rules
 *
 * Covers:
 *  - 5 transition-layer kinds in EA_KIND_REGISTRY
 *  - Schema validation for all 5 kinds
 *  - 5 quality rules for transition-layer artifacts
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
  getEaSchemaNames,
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

describe("Phase 2E: Transition Layer Kinds", () => {
  const TRANSITION_KINDS = ["baseline", "target", "transition-plan", "migration-wave", "exception"];

  it("has 41 total kinds after Phase 2E", () => {
    expect(EA_KIND_REGISTRY).toHaveLength(41);
  });

  it("has 5 kinds in transitions domain", () => {
    const kinds = getKindsByDomain("transitions");
    expect(kinds).toHaveLength(5);
    const kindNames = kinds.map((k) => k.kind);
    for (const k of TRANSITION_KINDS) {
      expect(kindNames).toContain(k);
    }
  });

  it.each([
    ["baseline", "BASELINE"],
    ["target", "TARGET"],
    ["transition-plan", "PLAN"],
    ["migration-wave", "WAVE"],
    ["exception", "EXCEPT"],
  ])("kind %s has prefix %s", (kind, prefix) => {
    const entry = getKindEntry(kind);
    expect(entry).toBeDefined();
    expect(entry!.prefix).toBe(prefix);
    expect(entry!.domain).toBe("transitions");
  });
});

// ─── Schema Validation ──────────────────────────────────────────────────────────

describe("Phase 2E: Transition Schema Validation", () => {
  it("validates a valid baseline", () => {
    const data = {
      apiVersion: "anchored-spec/ea/v1",
      id: "BASELINE-current",
      kind: "baseline",
      title: "Current State Baseline",
      summary: "Q1 2026 baseline",
      owners: ["team-arch"],
      confidence: "observed",
      status: "active",
      schemaVersion: "1.0.0",
      scope: { description: "All systems domain artifacts", domains: ["systems"] },
      capturedAt: "2026-01-15",
      artifactRefs: ["APP-orders", "APP-payments"],
    };
    const result = validateEaSchema(data, "baseline");
    expect(result.valid).toBe(true);
  });

  it("rejects baseline without required fields", () => {
    const data = {
      apiVersion: "anchored-spec/ea/v1",
      id: "BASELINE-bad",
      kind: "baseline",
      title: "Bad Baseline",
      summary: "Missing fields",
      owners: ["team-test"],
      confidence: "declared",
      status: "draft",
      schemaVersion: "1.0.0",
    };
    const result = validateEaSchema(data, "baseline");
    expect(result.valid).toBe(false);
  });

  it("validates a valid target", () => {
    const data = {
      apiVersion: "anchored-spec/ea/v1",
      id: "TARGET-cloud-native",
      kind: "target",
      title: "Cloud-Native Architecture",
      summary: "Move to K8s",
      owners: ["team-arch"],
      confidence: "declared",
      status: "active",
      schemaVersion: "1.0.0",
      scope: { description: "Migrate all services to Kubernetes" },
      effectiveBy: "2026-12-31",
      artifactRefs: ["APP-orders-v2"],
      successMetrics: [{ id: "m1", metric: "Service count on K8s", target: "100%" }],
    };
    const result = validateEaSchema(data, "target");
    expect(result.valid).toBe(true);
  });

  it("validates a valid transition-plan", () => {
    const data = {
      apiVersion: "anchored-spec/ea/v1",
      id: "PLAN-cloud-migration",
      kind: "transition-plan",
      title: "Cloud Migration Plan",
      summary: "Move from on-prem to cloud",
      owners: ["team-arch"],
      confidence: "declared",
      status: "active",
      schemaVersion: "1.0.0",
      baseline: "BASELINE-current",
      target: "TARGET-cloud-native",
      milestones: [
        { id: "m1", title: "Containerize services", deliverables: ["APP-orders-v2"], status: "pending" },
        { id: "m2", title: "Deploy to K8s", deliverables: ["DEPLOY-k8s-orders"], status: "pending" },
      ],
      riskRegister: [
        { id: "r1", description: "Data loss during migration", likelihood: "low", impact: "critical", mitigation: "Full backup before each wave" },
      ],
    };
    const result = validateEaSchema(data, "transition-plan");
    expect(result.valid).toBe(true);
  });

  it("validates a valid migration-wave", () => {
    const data = {
      apiVersion: "anchored-spec/ea/v1",
      id: "WAVE-phase1",
      kind: "migration-wave",
      title: "Phase 1 Wave",
      summary: "First batch of migrations",
      owners: ["team-ops"],
      confidence: "declared",
      status: "active",
      schemaVersion: "1.0.0",
      transitionPlan: "PLAN-cloud-migration",
      milestones: ["m1"],
      sequenceOrder: 1,
      scope: { create: ["APP-orders-v2"], modify: [], retire: ["APP-orders-legacy"] },
      preconditions: ["APP-orders"],
      rollbackStrategy: "Blue-green deployment with instant rollback",
    };
    const result = validateEaSchema(data, "migration-wave");
    expect(result.valid).toBe(true);
  });

  it("validates a valid exception", () => {
    const data = {
      apiVersion: "anchored-spec/ea/v1",
      id: "EXCEPT-legacy-api",
      kind: "exception",
      title: "Legacy API Exception",
      summary: "Allow non-standard API for legacy system",
      owners: ["team-arch"],
      confidence: "declared",
      status: "active",
      schemaVersion: "1.0.0",
      scope: { artifactIds: ["API-legacy-orders"], rules: ["ea:quality:api-missing-spec"] },
      approvedBy: "cto",
      approvedAt: "2026-01-15T00:00:00Z",
      expiresAt: "2026-06-15T00:00:00Z",
      reason: "Legacy system being retired in Q2",
      reviewSchedule: "monthly",
    };
    const result = validateEaSchema(data, "exception");
    expect(result.valid).toBe(true);
  });

  it("validates all 44 schemas load correctly", () => {
    const names = getEaSchemaNames();
    expect(names).toHaveLength(44);
  });
});

// ─── Quality Rules ──────────────────────────────────────────────────────────────

describe("Phase 2E: Transition Quality Rules", () => {
  it("warns when baseline has no artifact refs", () => {
    const artifacts = [
      makeArtifact({
        id: "BASELINE-empty",
        kind: "baseline",
        scope: { description: "test" },
        capturedAt: "2026-01-15",
        artifactRefs: [],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.warnings.find((w) => w.rule === "ea:quality:baseline-empty-refs")).toBeDefined();
  });

  it("does not warn when baseline has artifact refs", () => {
    const artifacts = [
      makeArtifact({
        id: "BASELINE-good",
        kind: "baseline",
        scope: { description: "test" },
        capturedAt: "2026-01-15",
        artifactRefs: ["APP-orders"],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.warnings.find((w) => w.rule === "ea:quality:baseline-empty-refs")).toBeUndefined();
  });

  it("warns when target has no success metrics", () => {
    const artifacts = [
      makeArtifact({
        id: "TARGET-no-metrics",
        kind: "target",
        scope: { description: "test" },
        effectiveBy: "2026-12-31",
        artifactRefs: ["APP-orders"],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.warnings.find((w) => w.rule === "ea:quality:target-missing-metrics")).toBeDefined();
  });

  it("warns when transition plan has no milestones", () => {
    const artifacts = [
      makeArtifact({
        id: "PLAN-empty",
        kind: "transition-plan",
        baseline: "BASELINE-x",
        target: "TARGET-x",
        milestones: [],
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.warnings.find((w) => w.rule === "ea:quality:plan-empty-milestones")).toBeDefined();
  });

  it("errors when exception has empty scope", () => {
    const artifacts = [
      makeArtifact({
        id: "EXCEPT-wild",
        kind: "exception",
        scope: {},
        approvedBy: "cto",
        approvedAt: "2026-01-15",
        expiresAt: "2026-06-15",
        reason: "Just because",
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:exception-empty-scope")).toBeDefined();
  });

  it("does not error when exception has scoped rules", () => {
    const artifacts = [
      makeArtifact({
        id: "EXCEPT-scoped",
        kind: "exception",
        scope: { rules: ["ea:quality:some-rule"] },
        approvedBy: "cto",
        approvedAt: "2026-01-15",
        expiresAt: "2026-06-15",
        reason: "Valid exception",
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.errors.find((e) => e.rule === "ea:quality:exception-empty-scope")).toBeUndefined();
  });

  it("warns when migration wave has empty scope", () => {
    const artifacts = [
      makeArtifact({
        id: "WAVE-empty",
        kind: "migration-wave",
        transitionPlan: "PLAN-x",
        milestones: ["m1"],
        sequenceOrder: 1,
        scope: {},
      } as any),
    ];
    const result = validateEaArtifacts(artifacts);
    expect(result.warnings.find((w) => w.rule === "ea:quality:wave-empty-scope")).toBeDefined();
  });
});

// ─── Phase 2E: New Relations ────────────────────────────────────────────────────

describe("Phase 2E: Transition Relations", () => {
  const registry = createDefaultRegistry();

  it("has 27 total relation types after Phase 2E", () => {
    expect(registry.allTypes()).toHaveLength(27);
  });

  describe("supersedes", () => {
    it("is registered with wildcard source and target", () => {
      const entry = registry.get("supersedes");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("supersededBy");
      expect(entry!.validSourceKinds).toBe("*");
      expect(entry!.validTargetKinds).toBe("*");
    });

    it("validates app → app via supersedes", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-orders-v2",
          kind: "application",
          relations: [{ type: "supersedes", target: "APP-orders-v1" }],
        }),
        makeArtifact({ id: "APP-orders-v1", kind: "application", status: "retired" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("generates", () => {
    it("is registered with transition-plan/migration-wave source", () => {
      const entry = registry.get("generates");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("generatedBy");
      expect(entry!.validSourceKinds).toContain("transition-plan");
      expect(entry!.validSourceKinds).toContain("migration-wave");
    });

    it("validates plan → any via generates", () => {
      const artifacts = [
        makeArtifact({
          id: "PLAN-migration",
          kind: "transition-plan",
          baseline: "BASELINE-x",
          target: "TARGET-x",
          milestones: [],
          relations: [{ type: "generates", target: "APP-orders-v2" }],
        } as any),
        makeArtifact({ id: "APP-orders-v2", kind: "application" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("mitigates", () => {
    it("is registered with exception source", () => {
      const entry = registry.get("mitigates");
      expect(entry).toBeDefined();
      expect(entry!.inverse).toBe("mitigatedBy");
      expect(entry!.validSourceKinds).toEqual(["exception"]);
      expect(entry!.validTargetKinds).toBe("*");
    });

    it("validates exception → any via mitigates", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCEPT-legacy",
          kind: "exception",
          scope: { artifactIds: ["APP-legacy"] },
          approvedBy: "cto",
          approvedAt: "2026-01-15",
          expiresAt: "2027-01-15",
          reason: "Legacy system",
          relations: [{ type: "mitigates", target: "APP-legacy" }],
        } as any),
        makeArtifact({ id: "APP-legacy", kind: "application" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects non-exception as source for mitigates", () => {
      const artifacts = [
        makeArtifact({
          id: "APP-orders",
          kind: "application",
          relations: [{ type: "mitigates", target: "APP-legacy" }],
        }),
        makeArtifact({ id: "APP-legacy", kind: "application" }),
      ];
      const result = validateEaRelations(artifacts, registry);
      expect(result.errors.find((e) => e.rule === "ea:relation:invalid-source")).toBeDefined();
    });
  });
});

// ─── Phase 2E: Transition Drift Rules ───────────────────────────────────────────

describe("Phase 2E: Transition Drift Rules", () => {

  describe("ea:transition/baseline-missing-artifacts", () => {
    it("fires when baseline references non-existent artifact", () => {
      const artifacts = [
        makeArtifact({
          id: "BASELINE-q1",
          kind: "baseline",
          scope: { description: "test" },
          capturedAt: new Date().toISOString(),
          artifactRefs: ["APP-nonexistent"],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:transition/baseline-missing-artifacts")).toBeDefined();
    });

    it("does not fire when all refs exist", () => {
      const artifacts = [
        makeArtifact({
          id: "BASELINE-q1",
          kind: "baseline",
          scope: { description: "test" },
          capturedAt: new Date().toISOString(),
          artifactRefs: ["APP-orders"],
        } as any),
        makeArtifact({ id: "APP-orders", kind: "application" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:transition/baseline-missing-artifacts")).toBeUndefined();
    });
  });

  describe("ea:transition/baseline-stale", () => {
    it("fires when baseline is older than 90 days", () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
      const artifacts = [
        makeArtifact({
          id: "BASELINE-old",
          kind: "baseline",
          scope: { description: "test" },
          capturedAt: oldDate,
          artifactRefs: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:transition/baseline-stale")).toBeDefined();
    });
  });

  describe("ea:transition/invalid-target-reference", () => {
    it("fires when target references non-existent artifact", () => {
      const artifacts = [
        makeArtifact({
          id: "TARGET-cloud",
          kind: "target",
          scope: { description: "test" },
          effectiveBy: "2027-12-31",
          artifactRefs: ["APP-nonexistent"],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:transition/invalid-target-reference")).toBeDefined();
    });
  });

  describe("ea:transition/expired-target", () => {
    it("fires when target effectiveBy is in the past", () => {
      const artifacts = [
        makeArtifact({
          id: "TARGET-old",
          kind: "target",
          scope: { description: "test" },
          effectiveBy: "2020-01-01",
          artifactRefs: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:transition/expired-target")).toBeDefined();
    });
  });

  describe("ea:transition/missing-baseline", () => {
    it("fires when plan references non-existent baseline", () => {
      const artifacts = [
        makeArtifact({
          id: "PLAN-migration",
          kind: "transition-plan",
          baseline: "BASELINE-nonexistent",
          target: "TARGET-x",
          milestones: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:transition/missing-baseline")).toBeDefined();
    });

    it("does not fire when baseline exists", () => {
      const artifacts = [
        makeArtifact({
          id: "PLAN-migration",
          kind: "transition-plan",
          baseline: "BASELINE-q1",
          target: "TARGET-x",
          milestones: [],
        } as any),
        makeArtifact({
          id: "BASELINE-q1",
          kind: "baseline",
          scope: { description: "test" },
          capturedAt: new Date().toISOString(),
          artifactRefs: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:transition/missing-baseline")).toBeUndefined();
    });
  });

  describe("ea:transition/missing-target", () => {
    it("fires when plan references non-existent target", () => {
      const artifacts = [
        makeArtifact({
          id: "PLAN-migration",
          kind: "transition-plan",
          baseline: "BASELINE-x",
          target: "TARGET-nonexistent",
          milestones: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:transition/missing-target")).toBeDefined();
    });
  });

  describe("ea:transition/milestone-on-retired-artifact", () => {
    it("fires when milestone delivers retired artifact", () => {
      const artifacts = [
        makeArtifact({
          id: "PLAN-migration",
          kind: "transition-plan",
          baseline: "BASELINE-x",
          target: "TARGET-x",
          milestones: [{ id: "m1", title: "Test", deliverables: ["APP-retired"] }],
        } as any),
        makeArtifact({ id: "APP-retired", kind: "application", status: "retired" }),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:transition/milestone-on-retired-artifact")).toBeDefined();
    });
  });

  describe("ea:transition/orphan-wave", () => {
    it("fires when wave has no plan reference", () => {
      const artifacts = [
        makeArtifact({
          id: "WAVE-orphan",
          kind: "migration-wave",
          transitionPlan: "PLAN-nonexistent",
          milestones: [],
          sequenceOrder: 1,
          scope: {},
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:transition/orphan-wave")).toBeDefined();
    });

    it("does not fire when wave references existing plan", () => {
      const artifacts = [
        makeArtifact({
          id: "WAVE-good",
          kind: "migration-wave",
          transitionPlan: "PLAN-migration",
          milestones: [],
          sequenceOrder: 1,
          scope: {},
        } as any),
        makeArtifact({
          id: "PLAN-migration",
          kind: "transition-plan",
          baseline: "BASELINE-x",
          target: "TARGET-x",
          milestones: [],
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:transition/orphan-wave")).toBeUndefined();
    });
  });

  describe("ea:exception/expired", () => {
    it("fires when exception is past expiry", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCEPT-old",
          kind: "exception",
          scope: { rules: ["some-rule"] },
          approvedBy: "cto",
          approvedAt: "2020-01-01",
          expiresAt: "2020-06-01",
          reason: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:exception/expired")).toBeDefined();
    });

    it("does not fire when exception is still valid", () => {
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const artifacts = [
        makeArtifact({
          id: "EXCEPT-valid",
          kind: "exception",
          scope: { rules: ["some-rule"] },
          approvedBy: "cto",
          approvedAt: "2026-01-01",
          expiresAt: future,
          reason: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.warnings.find((w) => w.rule === "ea:exception/expired")).toBeUndefined();
    });
  });

  describe("ea:exception/missing-scope", () => {
    it("fires when exception has empty scope", () => {
      const artifacts = [
        makeArtifact({
          id: "EXCEPT-wild",
          kind: "exception",
          scope: {},
          approvedBy: "cto",
          approvedAt: "2026-01-01",
          expiresAt: "2027-01-01",
          reason: "test",
        } as any),
      ];
      const result = evaluateEaDrift(artifacts);
      expect(result.errors.find((e) => e.rule === "ea:exception/missing-scope")).toBeDefined();
    });
  });

  it("evaluates all 37 static drift rules", () => {
    const result = evaluateEaDrift([]);
    expect(result.rulesEvaluated).toBe(37);
    expect(result.rulesSkipped).toBe(5);
  });
});
