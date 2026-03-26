import { describe, it, expect } from "vitest";
import { analyzeImpact } from "../impact.js";
import type { Requirement, Change } from "../types.js";

function makeReq(overrides: Partial<Requirement>): Requirement {
  return {
    id: "REQ-1",
    title: "Test requirement",
    summary: "Test summary for impact.",
    priority: "must",
    status: "active",
    behaviorStatements: [],
    owners: ["team"],
    docSource: "canonical-json",
    ...overrides,
  } as Requirement;
}

function makeChange(overrides: Partial<Change>): Change {
  return {
    id: "CHG-2025-0001-test",
    title: "Test change",
    slug: "test",
    type: "feature",
    workflowVariant: "feature-behavior-first",
    phase: "implementation",
    status: "active",
    scope: { include: ["src/auth/**"] },
    requirements: ["REQ-1"],
    branch: null,
    timestamps: { createdAt: "2025-01-01" },
    owners: ["team"],
    docSource: "canonical-json",
    ...overrides,
  } as Change;
}

describe("analyzeImpact", () => {
  it("matches file via change scope", () => {
    const results = analyzeImpact(
      ["src/auth/login.ts"],
      [makeReq({})],
      [makeChange({})],
    );

    expect(results).toHaveLength(1);
    expect(results[0].matchedRequirements).toHaveLength(1);
    expect(results[0].matchedRequirements[0].matchReason).toBe("scope");
    expect(results[0].matchedRequirements[0].reqId).toBe("REQ-1");
  });

  it("matches file via testRef", () => {
    const req = makeReq({
      verification: {
        coverageStatus: "full",
        testRefs: [{ kind: "unit", path: "tests/auth.test.ts" }],
      },
    });

    const results = analyzeImpact(
      ["tests/auth.test.ts"],
      [req],
      [],
    );

    expect(results).toHaveLength(1);
    const testRefMatch = results[0].matchedRequirements.find(
      (m) => m.matchReason === "testRef",
    );
    expect(testRefMatch).toBeDefined();
    expect(testRefMatch!.reqId).toBe("REQ-1");
  });

  it("returns empty matches for unrelated files", () => {
    const results = analyzeImpact(
      ["src/unrelated/file.ts"],
      [makeReq({})],
      [makeChange({})],
    );

    expect(results).toHaveLength(1);
    expect(results[0].matchedRequirements).toHaveLength(0);
  });

  it("deduplicates matches by reqId+reason", () => {
    const change1 = makeChange({ id: "CHG-2025-0001-a" });
    const change2 = makeChange({ id: "CHG-2025-0002-b" });

    const results = analyzeImpact(
      ["src/auth/login.ts"],
      [makeReq({})],
      [change1, change2],
    );

    // Both changes match same scope, but dedup by reqId+reason
    const scopeMatches = results[0].matchedRequirements.filter(
      (m) => m.matchReason === "scope",
    );
    expect(scopeMatches).toHaveLength(1);
  });

  it("skips completed/cancelled changes", () => {
    const results = analyzeImpact(
      ["src/auth/login.ts"],
      [makeReq({})],
      [makeChange({ status: "complete" })],
    );

    expect(results[0].matchedRequirements).toHaveLength(0);
  });
});
