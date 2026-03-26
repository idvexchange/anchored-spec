import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildSemanticLinkMap } from "../../cli/commands/drift.js";
import type { DriftReport } from "../types.js";

const TMP = join(tmpdir(), "anchored-spec-slm-test-" + process.pid);

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("buildSemanticLinkMap", () => {
  it("produces correct structure for various semantic ref kinds", () => {
    const report: DriftReport = {
      findings: [
        { reqId: "REQ-1", kind: "interface", ref: "UserService", status: "found", foundIn: ["src/user.ts"] },
        { reqId: "REQ-1", kind: "route", ref: "POST /api/users", status: "found", foundIn: ["src/routes.ts"] },
        { reqId: "REQ-1", kind: "errorCode", ref: "ERR_USER_NOT_FOUND", status: "missing", foundIn: [] },
        { reqId: "REQ-2", kind: "symbol", ref: "calculateTotal", status: "found", foundIn: ["src/calc.ts"] },
      ],
      summary: { totalRefs: 4, found: 3, missing: 1 },
    };

    const map = buildSemanticLinkMap(report);

    expect(map.generatedAt).toBeDefined();
    expect(map.summary.totalRefs).toBe(4);
    expect(map.summary.found).toBe(3);
    expect(map.summary.missing).toBe(1);
    expect(map.summary.resolutionRate).toBe(0.75);
    expect(map.requirements).toHaveLength(2);

    const req1 = map.requirements.find((r: { reqId: string }) => r.reqId === "REQ-1");
    expect(req1).toBeDefined();
    expect(req1!.refs).toHaveLength(3);
    expect(req1!.refs.map((r: { kind: string }) => r.kind).sort()).toEqual(["errorCode", "interface", "route"]);

    const req2 = map.requirements.find((r: { reqId: string }) => r.reqId === "REQ-2");
    expect(req2).toBeDefined();
    expect(req2!.refs).toHaveLength(1);
    expect(req2!.refs[0].kind).toBe("symbol");
  });

  it("includes foundIn only for found refs", () => {
    const report: DriftReport = {
      findings: [
        { reqId: "REQ-1", kind: "interface", ref: "Found", status: "found", foundIn: ["src/a.ts"] },
        { reqId: "REQ-1", kind: "interface", ref: "Missing", status: "missing", foundIn: [] },
      ],
      summary: { totalRefs: 2, found: 1, missing: 1 },
    };

    const map = buildSemanticLinkMap(report);
    const refs = map.requirements[0].refs;

    const foundRef = refs.find((r: { ref: string }) => r.ref === "Found");
    expect(foundRef!.foundIn).toEqual(["src/a.ts"]);

    const missingRef = refs.find((r: { ref: string }) => r.ref === "Missing");
    // Missing refs have empty foundIn array (truthy but empty)
    expect(missingRef!.foundIn).toEqual([]);
  });

  it("handles empty report", () => {
    const report: DriftReport = {
      findings: [],
      summary: { totalRefs: 0, found: 0, missing: 0 },
    };

    const map = buildSemanticLinkMap(report);
    expect(map.requirements).toHaveLength(0);
    expect(map.summary.resolutionRate).toBe(1);
  });

  it("detects staleness when written map differs from fresh", () => {
    const original: DriftReport = {
      findings: [
        { reqId: "REQ-1", kind: "interface", ref: "OldRef", status: "found", foundIn: ["src/old.ts"] },
      ],
      summary: { totalRefs: 1, found: 1, missing: 0 },
    };

    const updated: DriftReport = {
      findings: [
        { reqId: "REQ-1", kind: "interface", ref: "NewRef", status: "missing", foundIn: [] },
      ],
      summary: { totalRefs: 1, found: 0, missing: 1 },
    };

    const originalMap = buildSemanticLinkMap(original);
    const mapPath = join(TMP, "semantic-links.json");
    writeFileSync(mapPath, JSON.stringify(originalMap, null, 2));

    const freshMap = buildSemanticLinkMap(updated);
    const existing = JSON.parse(readFileSync(mapPath, "utf-8"));

    // Staleness check: summary differs
    const isStale =
      existing.summary?.found !== freshMap.summary.found ||
      existing.summary?.missing !== freshMap.summary.missing ||
      existing.summary?.totalRefs !== freshMap.summary.totalRefs;

    expect(isStale).toBe(true);
  });

  it("passes staleness check when map is current", () => {
    const report: DriftReport = {
      findings: [
        { reqId: "REQ-1", kind: "symbol", ref: "stableSymbol", status: "found", foundIn: ["src/x.ts"] },
      ],
      summary: { totalRefs: 1, found: 1, missing: 0 },
    };

    const map = buildSemanticLinkMap(report);
    const mapPath = join(TMP, "stable-links.json");
    writeFileSync(mapPath, JSON.stringify(map, null, 2));

    const freshMap = buildSemanticLinkMap(report);
    const existing = JSON.parse(readFileSync(mapPath, "utf-8"));

    const isStale =
      existing.summary?.found !== freshMap.summary.found ||
      existing.summary?.missing !== freshMap.summary.missing ||
      existing.summary?.totalRefs !== freshMap.summary.totalRefs;

    expect(isStale).toBe(false);
  });
});
