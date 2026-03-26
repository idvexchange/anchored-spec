import { describe, it, expect } from "vitest";
import {
  checkCrossReferences,
  checkLifecycleRules,
  checkDependencies,
  detectCycles,
} from "../integrity.js";
import type { Requirement, Change } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    title: "Test Requirement",
    summary: "Summary",
    priority: "should",
    status: "active",
    behaviorStatements: [],
    traceRefs: [],
    semanticRefs: { interfaces: [], routes: [], errorCodes: [], symbols: [] },
    verification: { requiredTestKinds: [], coverageStatus: "none", testFiles: [], testRefs: [] },
    implementation: { activeChanges: [], shippedBy: null, deprecatedBy: null },
    owners: [],
    tags: [],
    supersedes: null,
    supersededBy: null,
    docSource: "canonical-json",
    ...overrides,
  };
}

function makeChange(overrides: Partial<Change> & { id: string }): Change {
  return {
    title: "Test Change",
    slug: "test-change",
    type: "feature",
    phase: "implementation",
    status: "active",
    scope: { include: ["src/**"], exclude: [] },
    timestamps: { createdAt: "2025-01-01" },
    owners: [],
    docSource: "canonical-json",
    ...overrides,
  };
}

// ─── checkCrossReferences ───────────────────────────────────────────────────────

describe("checkCrossReferences", () => {
  it("returns no errors for consistent bidirectional links", () => {
    const reqs = [makeReq({ id: "REQ-1", implementation: { activeChanges: ["CHG-1"], shippedBy: null, deprecatedBy: null } })];
    const chgs = [makeChange({ id: "CHG-1", requirements: ["REQ-1"] })];
    const errors = checkCrossReferences(reqs, chgs);
    expect(errors).toHaveLength(0);
  });

  it("warns when CHG references non-existent REQ", () => {
    const chgs = [makeChange({ id: "CHG-1", requirements: ["REQ-999"] })];
    const errors = checkCrossReferences([], chgs);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.rule).toBe("cross-ref:change-to-requirement");
  });

  it("warns when REQ references non-existent CHG", () => {
    const reqs = [makeReq({ id: "REQ-1", implementation: { activeChanges: ["CHG-999"], shippedBy: null, deprecatedBy: null } })];
    const errors = checkCrossReferences(reqs, []);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.rule).toBe("cross-ref:requirement-to-change");
  });

  it("warns on bidirectional inconsistency (CHG→REQ but not REQ→CHG)", () => {
    const reqs = [makeReq({ id: "REQ-1" })]; // no activeChanges
    const chgs = [makeChange({ id: "CHG-1", requirements: ["REQ-1"] })];
    const errors = checkCrossReferences(reqs, chgs);
    const bidir = errors.filter((e) => e.rule === "cross-ref:bidirectional-consistency");
    expect(bidir.length).toBeGreaterThan(0);
  });

  it("warns on reverse inconsistency (REQ→CHG but not CHG→REQ)", () => {
    const reqs = [makeReq({ id: "REQ-1", implementation: { activeChanges: ["CHG-1"], shippedBy: null, deprecatedBy: null } })];
    const chgs = [makeChange({ id: "CHG-1", requirements: [] })]; // doesn't reference REQ-1
    const errors = checkCrossReferences(reqs, chgs);
    const bidir = errors.filter((e) => e.rule === "cross-ref:bidirectional-consistency");
    expect(bidir.length).toBeGreaterThan(0);
  });

  it("skips non-active changes", () => {
    const reqs = [makeReq({ id: "REQ-1" })];
    const chgs = [makeChange({ id: "CHG-1", status: "complete", requirements: ["REQ-999"] })];
    const errors = checkCrossReferences(reqs, chgs);
    expect(errors).toHaveLength(0);
  });
});

// ─── checkLifecycleRules ────────────────────────────────────────────────────────

describe("checkLifecycleRules", () => {
  const fullPolicy = {
    lifecycleRules: {
      plannedToActiveRequiresChange: true,
      activeToShippedRequiresCoverage: true,
      deprecatedRequiresReason: true,
    },
  };

  it("errors when active requirement has no change", () => {
    const reqs = [makeReq({ id: "REQ-1", status: "active" })];
    const errors = checkLifecycleRules(reqs, [], fullPolicy);
    const matched = errors.filter((e) => e.rule === "lifecycle:active-requires-change");
    expect(matched).toHaveLength(1);
  });

  it("passes when active requirement has an active change", () => {
    const reqs = [makeReq({ id: "REQ-1", status: "active", implementation: { activeChanges: ["CHG-1"], shippedBy: null, deprecatedBy: null } })];
    const chgs = [makeChange({ id: "CHG-1", requirements: ["REQ-1"] })];
    const errors = checkLifecycleRules(reqs, chgs, fullPolicy);
    const matched = errors.filter((e) => e.rule === "lifecycle:active-requires-change");
    expect(matched).toHaveLength(0);
  });

  it("errors when shipped requirement has no coverage", () => {
    const reqs = [makeReq({ id: "REQ-1", status: "shipped" })];
    const errors = checkLifecycleRules(reqs, [], fullPolicy);
    const matched = errors.filter((e) => e.rule === "lifecycle:shipped-requires-coverage");
    expect(matched).toHaveLength(1);
  });

  it("passes when shipped requirement has coverage", () => {
    const reqs = [makeReq({
      id: "REQ-1",
      status: "shipped",
      verification: { requiredTestKinds: ["unit"], coverageStatus: "full", testFiles: ["test.ts"], testRefs: [] },
    })];
    const errors = checkLifecycleRules(reqs, [], fullPolicy);
    const matched = errors.filter((e) => e.rule === "lifecycle:shipped-requires-coverage");
    expect(matched).toHaveLength(0);
  });

  it("errors when deprecated requirement has no reason", () => {
    const reqs = [makeReq({ id: "REQ-1", status: "deprecated" })];
    const errors = checkLifecycleRules(reqs, [], fullPolicy);
    const matched = errors.filter((e) => e.rule === "lifecycle:deprecated-requires-reason");
    expect(matched).toHaveLength(1);
  });

  it("passes when deprecated requirement has statusReason", () => {
    const reqs = [makeReq({ id: "REQ-1", status: "deprecated", statusReason: "No longer needed" })];
    const errors = checkLifecycleRules(reqs, [], fullPolicy);
    const matched = errors.filter((e) => e.rule === "lifecycle:deprecated-requires-reason");
    expect(matched).toHaveLength(0);
  });
});

// ─── checkDependencies ──────────────────────────────────────────────────────────

describe("checkDependencies", () => {
  it("returns no errors for valid dependencies", () => {
    const reqs = [
      makeReq({ id: "REQ-1", dependsOn: ["REQ-2"] }),
      makeReq({ id: "REQ-2" }),
    ];
    const errors = checkDependencies(reqs);
    expect(errors).toHaveLength(0);
  });

  it("errors on missing dependency reference", () => {
    const reqs = [makeReq({ id: "REQ-1", dependsOn: ["REQ-999"] })];
    const errors = checkDependencies(reqs);
    expect(errors.some((e) => e.rule === "dependency:missing-ref")).toBe(true);
  });

  it("errors on circular dependency", () => {
    const reqs = [
      makeReq({ id: "REQ-A", dependsOn: ["REQ-B"] }),
      makeReq({ id: "REQ-B", dependsOn: ["REQ-A"] }),
    ];
    const errors = checkDependencies(reqs);
    expect(errors.some((e) => e.rule === "dependency:cycle")).toBe(true);
  });

  it("warns when active req depends on draft req", () => {
    const reqs = [
      makeReq({ id: "REQ-1", status: "active", dependsOn: ["REQ-2"] }),
      makeReq({ id: "REQ-2", status: "draft" }),
    ];
    const errors = checkDependencies(reqs);
    expect(errors.some((e) => e.rule === "dependency:blocked")).toBe(true);
  });
});

// ─── detectCycles ───────────────────────────────────────────────────────────────

describe("detectCycles", () => {
  it("returns empty for no cycles", () => {
    const reqs = [
      makeReq({ id: "REQ-1", dependsOn: ["REQ-2"] }),
      makeReq({ id: "REQ-2" }),
    ];
    expect(detectCycles(reqs)).toHaveLength(0);
  });

  it("detects a simple 2-node cycle", () => {
    const reqs = [
      makeReq({ id: "REQ-A", dependsOn: ["REQ-B"] }),
      makeReq({ id: "REQ-B", dependsOn: ["REQ-A"] }),
    ];
    const cycles = detectCycles(reqs);
    expect(cycles).toHaveLength(1);
  });

  it("deduplicates cycles (A→B→A reported only once)", () => {
    const reqs = [
      makeReq({ id: "REQ-A", dependsOn: ["REQ-B"] }),
      makeReq({ id: "REQ-B", dependsOn: ["REQ-A"] }),
    ];
    const cycles = detectCycles(reqs);
    // Should be exactly 1, not 2
    expect(cycles).toHaveLength(1);
    // Normalized: smallest ID first
    expect(cycles[0]![0]).toBe("REQ-A");
  });

  it("detects a 3-node cycle", () => {
    const reqs = [
      makeReq({ id: "REQ-A", dependsOn: ["REQ-B"] }),
      makeReq({ id: "REQ-B", dependsOn: ["REQ-C"] }),
      makeReq({ id: "REQ-C", dependsOn: ["REQ-A"] }),
    ];
    const cycles = detectCycles(reqs);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(3);
  });

  it("detects multiple disjoint cycles", () => {
    const reqs = [
      makeReq({ id: "REQ-A", dependsOn: ["REQ-B"] }),
      makeReq({ id: "REQ-B", dependsOn: ["REQ-A"] }),
      makeReq({ id: "REQ-C", dependsOn: ["REQ-D"] }),
      makeReq({ id: "REQ-D", dependsOn: ["REQ-C"] }),
    ];
    const cycles = detectCycles(reqs);
    expect(cycles).toHaveLength(2);
  });
});
