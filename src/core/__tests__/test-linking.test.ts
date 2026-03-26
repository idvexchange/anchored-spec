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

  it("rejects false positives from substring matches and REQ-0", () => {
    const tmpFp = join(TMP, "false-pos");
    mkdirSync(join(tmpFp, "tests"), { recursive: true });
    writeFileSync(
      join(tmpFp, "tests/fp.test.ts"),
      '// PREREQ-123\n// SOME_REQ-42_OTHER\n// REQ-0\nconst UNREQ-5 = true;',
    );
    const req = makeReq({ id: "REQ-123" });
    const report = checkTestLinking([req], tmpFp);
    // None of the false positives should produce a test→req match for REQ-123
    const matches = report.findings.filter(
      (f) => f.direction === "test-to-req" && f.reqId === "REQ-123" && f.status === "linked",
    );
    expect(matches).toHaveLength(0);
  });

  it("matches valid word-boundary requirement IDs", () => {
    const tmpWb = join(TMP, "word-boundary");
    mkdirSync(join(tmpWb, "tests"), { recursive: true });
    writeFileSync(
      join(tmpWb, "tests/valid.test.ts"),
      '// REQ-1 and REQ-42 are tested here',
    );
    const req1 = makeReq({ id: "REQ-1" });
    const req42 = makeReq({ id: "REQ-42" });
    const report = checkTestLinking([req1, req42], tmpWb);
    // Both REQ-1 and REQ-42 should be matched from the test file (test→req direction)
    const testToReqFindings = report.findings.filter(
      (f) => f.direction === "test-to-req",
    );
    expect(testToReqFindings).toHaveLength(2);
    expect(testToReqFindings.map((f) => f.reqId).sort()).toEqual(["REQ-1", "REQ-42"]);
  });

  it("uses capture group from custom requirementPattern", () => {
    const tmpCg = join(TMP, "capture-group");
    mkdirSync(join(tmpCg, "tests"), { recursive: true });
    writeFileSync(
      join(tmpCg, "tests/meta.test.ts"),
      '// REQ-METADATA: REQ-5\n// REQ-METADATA: REQ-10\n',
    );
    const req5 = makeReq({ id: "REQ-5" });
    const req10 = makeReq({ id: "REQ-10" });
    const report = checkTestLinking([req5, req10], tmpCg, {
      requirementPattern: "REQ-METADATA:\\s*(REQ-[1-9][0-9]*)",
    });
    // Test file references REQ-5 and REQ-10 via capture group — shows as orphan
    // (test mentions req but req doesn't list the test file in testRefs)
    const testToReq = report.findings.filter(
      (f) => f.direction === "test-to-req",
    );
    expect(testToReq).toHaveLength(2);
    expect(testToReq.map((f) => f.reqId).sort()).toEqual(["REQ-10", "REQ-5"]);
  });
});
