import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { detectDrift } from "../../core/drift.js";
import type { Requirement } from "../../core/types.js";

const TMP = join(import.meta.dirname ?? __dirname, "__tmp_drift__");

function makeReq(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "REQ-1",
    title: "Test requirement",
    summary: "A test requirement for drift detection",
    priority: "must",
    status: "active",
    behaviorStatements: [
      { id: "BS-01", text: "When testing, the system shall verify drift", format: "EARS", response: "The system shall verify drift" },
    ],
    owners: ["team"],
    ...overrides,
  };
}

describe("drift detection", () => {
  beforeEach(() => {
    mkdirSync(join(TMP, "src"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it("finds exported interfaces", () => {
    writeFileSync(
      join(TMP, "src", "auth.ts"),
      `export interface UserService {\n  getUser(id: string): User;\n}\n`,
    );
    const req = makeReq({ semanticRefs: { interfaces: ["UserService"] } });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.found).toBe(1);
    expect(report.summary.missing).toBe(0);
    expect(report.findings[0]?.foundIn).toContain("src/auth.ts");
  });

  it("reports missing interfaces", () => {
    writeFileSync(join(TMP, "src", "empty.ts"), `export const x = 1;\n`);
    const req = makeReq({ semanticRefs: { interfaces: ["MissingInterface"] } });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.missing).toBe(1);
    expect(report.findings[0]?.status).toBe("missing");
  });

  it("finds exported symbols (function, const, class)", () => {
    writeFileSync(
      join(TMP, "src", "utils.ts"),
      `export function calculateHash() {}\nexport const MAX_RETRIES = 3;\nexport class EventBus {}\n`,
    );
    const req = makeReq({
      semanticRefs: { symbols: ["calculateHash", "MAX_RETRIES", "EventBus"] },
    });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.found).toBe(3);
    expect(report.summary.missing).toBe(0);
  });

  it("finds route patterns in source", () => {
    writeFileSync(
      join(TMP, "src", "routes.ts"),
      `app.get("/api/v1/users/:id", handler);\n`,
    );
    const req = makeReq({ semanticRefs: { routes: ["GET /api/v1/users/:id"] } });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.found).toBe(1);
  });

  it("finds error codes as string literals", () => {
    writeFileSync(
      join(TMP, "src", "errors.ts"),
      `export const errors = {\n  AUTH_INVALID_TOKEN: "AUTH_INVALID_TOKEN",\n};\n`,
    );
    const req = makeReq({ semanticRefs: { errorCodes: ["AUTH_INVALID_TOKEN"] } });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.found).toBe(1);
  });

  it("skips draft/planned requirements", () => {
    writeFileSync(join(TMP, "src", "a.ts"), `export interface Foo {}\n`);
    const req = makeReq({
      status: "draft",
      semanticRefs: { interfaces: ["Foo"] },
    });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.findings).toHaveLength(0);
  });

  it("handles requirements with no semanticRefs", () => {
    const req = makeReq({ semanticRefs: undefined });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.findings).toHaveLength(0);
  });

  it("handles missing source root gracefully", () => {
    const req = makeReq({ semanticRefs: { symbols: ["Foo"] } });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["nonexistent"] });
    expect(report.summary.missing).toBe(1);
  });

  it("finds re-exported symbols", () => {
    writeFileSync(
      join(TMP, "src", "index.ts"),
      `export { UserService } from "./auth.js";\n`,
    );
    const req = makeReq({ semanticRefs: { symbols: ["UserService"] } });
    const report = detectDrift([req], { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.found).toBe(1);
  });

  it("aggregates findings across multiple requirements", () => {
    writeFileSync(join(TMP, "src", "a.ts"), `export interface A {}\n`);
    writeFileSync(join(TMP, "src", "b.ts"), `export const B = 1;\n`);
    const reqs = [
      makeReq({ id: "REQ-1", semanticRefs: { interfaces: ["A"] } }),
      makeReq({ id: "REQ-2", semanticRefs: { symbols: ["B", "Missing"] } }),
    ];
    const report = detectDrift(reqs, { projectRoot: TMP, sourceRoots: ["src"] });
    expect(report.summary.totalRefs).toBe(3);
    expect(report.summary.found).toBe(2);
    expect(report.summary.missing).toBe(1);
  });
});
