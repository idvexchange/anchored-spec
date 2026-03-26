import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectEvidence,
  validateEvidence,
  writeEvidence,
  loadEvidence,
  VitestParser,
} from "../evidence.js";
import type { Requirement } from "../types.js";

const TMP = join(tmpdir(), "anchored-spec-evidence-test-" + process.pid);

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

describe("evidence pipeline", () => {
  beforeAll(() => {
    mkdirSync(join(TMP, "evidence"), { recursive: true });
  });

  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  describe("VitestParser", () => {
    it("parses vitest JSON report and maps to requirements", () => {
      const reportPath = join(TMP, "vitest-report.json");
      writeFileSync(
        reportPath,
        JSON.stringify({
          testResults: [
            {
              name: "/project/tests/auth.test.ts",
              status: "passed",
              assertionResults: [],
            },
            {
              name: "/project/tests/other.test.ts",
              status: "failed",
              assertionResults: [],
            },
          ],
        }),
      );

      const req = makeReq({
        verification: {
          coverageStatus: "full",
          testRefs: [{ kind: "unit", path: "tests/auth.test.ts" }],
        },
      });

      const parser = new VitestParser();
      const records = parser.parse(reportPath, [req]);

      expect(records).toHaveLength(1);
      expect(records[0].requirementId).toBe("REQ-1");
      expect(records[0].status).toBe("passed");
      expect(records[0].kind).toBe("unit");
    });
  });

  describe("collectEvidence", () => {
    it("collects evidence from vitest format", () => {
      const reportPath = join(TMP, "vitest-report2.json");
      writeFileSync(
        reportPath,
        JSON.stringify({
          testResults: [
            { name: "tests/auth.test.ts", status: "passed", assertionResults: [] },
          ],
        }),
      );

      const req = makeReq({
        verification: {
          coverageStatus: "full",
          testRefs: [{ kind: "unit", path: "tests/auth.test.ts" }],
        },
      });

      const evidence = collectEvidence(reportPath, "vitest", [req]);
      expect(evidence.source).toBe("vitest");
      expect(evidence.records).toHaveLength(1);
      expect(evidence.generatedAt).toBeTruthy();
    });

    it("throws for unsupported format", () => {
      expect(() =>
        collectEvidence("/fake", "unknown-format", []),
      ).toThrow("Unsupported");
    });
  });

  describe("writeEvidence / loadEvidence", () => {
    it("round-trips evidence through write/load", () => {
      const evidence = {
        generatedAt: new Date().toISOString(),
        source: "vitest" as const,
        records: [
          {
            requirementId: "REQ-1",
            testFile: "tests/auth.test.ts",
            kind: "unit",
            status: "passed" as const,
            recordedAt: new Date().toISOString(),
          },
        ],
      };

      const path = join(TMP, "evidence", "evidence.json");
      writeEvidence(evidence, path);

      const loaded = loadEvidence(path);
      expect(loaded).not.toBeNull();
      expect(loaded!.records).toHaveLength(1);
      expect(loaded!.source).toBe("vitest");
    });
  });

  describe("validateEvidence", () => {
    it("returns warning when evidence file missing", () => {
      const issues = validateEvidence("/nonexistent/path.json", []);
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("evidence:file-exists");
    });

    it("reports error when requirement requires evidence but has none", () => {
      const evidencePath = join(TMP, "evidence", "empty.json");
      writeFileSync(
        evidencePath,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          source: "vitest",
          records: [],
        }),
      );

      const req = makeReq({
        verification: {
          coverageStatus: "full",
          executionPolicy: { requiresEvidence: true },
        } as any,
      });

      const issues = validateEvidence(evidencePath, [req]);
      expect(issues.some((i) => i.rule === "evidence:requirement-covered")).toBe(true);
    });

    it("reports error when evidence has failing tests", () => {
      const evidencePath = join(TMP, "evidence", "failing.json");
      writeFileSync(
        evidencePath,
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          source: "vitest",
          records: [
            {
              requirementId: "REQ-1",
              testFile: "tests/auth.test.ts",
              kind: "unit",
              status: "failed",
              recordedAt: new Date().toISOString(),
            },
          ],
        }),
      );

      const req = makeReq({
        verification: {
          coverageStatus: "full",
          executionPolicy: { requiresEvidence: true },
        } as any,
      });

      const issues = validateEvidence(evidencePath, [req]);
      expect(issues.some((i) => i.rule === "evidence:tests-passing")).toBe(true);
    });

    it("passes when no requirements need evidence", () => {
      const evidencePath = join(TMP, "evidence", "evidence.json");
      const req = makeReq({});
      const issues = validateEvidence(evidencePath, [req]);
      expect(issues).toHaveLength(0);
    });
  });
});
