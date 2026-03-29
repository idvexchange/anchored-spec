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
