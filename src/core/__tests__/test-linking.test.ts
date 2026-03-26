import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkTestLinking } from "../test-linking.js";
import type { Requirement } from "../types.js";

const TMP = join(tmpdir(), "anchored-spec-tl-test-" + process.pid);

function makeReq(overrides: Partial<Requirement>): Requirement {
  return {
    id: "REQ-1",
    title: "Test requirement",
    summary: "Test summary for validation.",
    priority: "must",
    status: "active",
    behaviorStatements: [],
    owners: ["team"],
    docSource: "canonical-json",
    ...overrides,
  } as Requirement;
}

describe("checkTestLinking", () => {
  beforeAll(() => {
    mkdirSync(join(TMP, "tests"), { recursive: true });
    mkdirSync(join(TMP, "src"), { recursive: true });
    writeFileSync(
      join(TMP, "tests/auth.test.ts"),
      '// REQ-1\ndescribe("auth", () => { it("works", () => {}) })',
    );
    writeFileSync(
      join(TMP, "tests/orphan.test.ts"),
      '// REQ-99\ndescribe("orphan", () => {})',
    );
    writeFileSync(
      join(TMP, "tests/no-req.test.ts"),
      'describe("no refs", () => {})',
    );
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("finds linked test file", () => {
    const req = makeReq({
      id: "REQ-1",
      verification: {
        coverageStatus: "full",
        testRefs: [{ kind: "unit", path: "tests/auth.test.ts" }],
      },
    });

    const report = checkTestLinking([req], TMP);
    const linked = report.findings.filter((f) => f.status === "linked");
    expect(linked.length).toBeGreaterThanOrEqual(1);
    expect(linked[0].reqId).toBe("REQ-1");
  });

  it("detects orphan test-to-req (test mentions REQ not in testRefs)", () => {
    const req = makeReq({
      id: "REQ-1",
      verification: { coverageStatus: "none" },
    });

    const report = checkTestLinking([req], TMP);
    const orphans = report.findings.filter(
      (f) => f.status === "orphan" && f.direction === "test-to-req" && f.reqId === "REQ-1",
    );
    expect(orphans.length).toBeGreaterThanOrEqual(1);
    expect(orphans[0].message).toContain("not listed");
  });

  it("detects orphan req-to-test (req has testRefs but no test mentions it)", () => {
    const req = makeReq({
      id: "REQ-50",
      status: "active",
      verification: {
        coverageStatus: "full",
        testRefs: [{ kind: "unit", path: "tests/phantom.test.ts" }],
      },
    });

    const report = checkTestLinking([req], TMP);
    const orphans = report.findings.filter(
      (f) => f.status === "orphan" && f.direction === "req-to-test" && f.reqId === "REQ-50",
    );
    expect(orphans).toHaveLength(1);
    expect(orphans[0].message).toContain("no test file contains a reference");
  });

  it("ignores unknown requirement IDs in test files", () => {
    const req = makeReq({ id: "REQ-1" });
    const report = checkTestLinking([req], TMP);
    // REQ-99 is in orphan.test.ts but REQ-99 is not a known requirement
    const req99 = report.findings.filter((f) => f.reqId === "REQ-99");
    expect(req99).toHaveLength(0);
  });

  it("supports custom test globs", () => {
    const req = makeReq({ id: "REQ-1" });
    const report = checkTestLinking([req], TMP, {
      testGlobs: ["**/*.spec.ts"], // no .spec.ts files exist
    });
    // No test files found, so no findings either
    expect(report.findings.filter((f) => f.direction === "test-to-req")).toHaveLength(0);
  });

  it("handles requirement with no testRefs or testFiles", () => {
    const req = makeReq({ id: "REQ-1" });
    const report = checkTestLinking([req], TMP);
    expect(report.summary.reqsMissingTests).toBeGreaterThanOrEqual(1);
  });
});
