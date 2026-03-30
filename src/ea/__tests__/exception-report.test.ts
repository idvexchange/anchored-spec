/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EA Exception Report & Report Index — Tests
 *
 * Tests for:
 * - buildExceptionReport() — active/expired/expiring-soon classification
 * - renderExceptionReportMarkdown() — Markdown rendering
 * - buildReportIndex() — all-reports index generation
 * - REPORT_VIEWS registry
 * - CLI: ea report --view exceptions
 * - CLI: ea report --all
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  buildExceptionReport,
  renderExceptionReportMarkdown,
  buildReportIndex,
  REPORT_VIEWS,
} from "../index.js";
import type { EaArtifactBase } from "../index.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    name: overrides.name ?? overrides.id,
    summary: "Test artifact",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    domain: "systems",
    owner: "team-a",
    lastUpdated: "2025-01-01",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
}

function makeException(overrides: Record<string, unknown> = {}) {
  const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000); // 120 days from now
  return makeArtifact({
    id: overrides.id as string ?? "EXCEPT-001",
    kind: "exception",
    domain: "transitions" as any,
    scope: { artifactIds: ["SYS-001"], rules: ["ea:drift/stale"], domains: [] },
    approvedBy: "chief-architect",
    approvedAt: "2025-01-15",
    expiresAt: overrides.expiresAt as string ?? future.toISOString().split("T")[0],
    reason: overrides.reason as string ?? "Legacy system migration in progress",
    reviewSchedule: overrides.reviewSchedule ?? "quarterly",
    ...overrides,
  } as any);
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ea-exception-report-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── REPORT_VIEWS ───────────────────────────────────────────────────────────────

describe("REPORT_VIEWS", () => {
  it("includes 6 report views", () => {
    expect(REPORT_VIEWS).toHaveLength(7);
  });

  it("includes exceptions view", () => {
    expect(REPORT_VIEWS).toContain("exceptions");
  });

  it("includes all expected views", () => {
    expect(REPORT_VIEWS).toContain("system-data-matrix");
    expect(REPORT_VIEWS).toContain("classification-coverage");
    expect(REPORT_VIEWS).toContain("capability-map");
    expect(REPORT_VIEWS).toContain("gap-analysis");
    expect(REPORT_VIEWS).toContain("exceptions");
  });
});

// ─── buildExceptionReport ───────────────────────────────────────────────────────

describe("buildExceptionReport", () => {
  it("returns empty report with no artifacts", () => {
    const report = buildExceptionReport([]);
    expect(report.summary.total).toBe(0);
    expect(report.summary.active).toBe(0);
    expect(report.summary.expired).toBe(0);
    expect(report.summary.expiringSoon).toBe(0);
    expect(report.exceptions).toHaveLength(0);
  });

  it("ignores non-exception artifacts", () => {
    const artifacts = [
      makeArtifact({ id: "SYS-001", kind: "system" }),
      makeArtifact({ id: "APP-001", kind: "application" }),
    ];
    const report = buildExceptionReport(artifacts);
    expect(report.summary.total).toBe(0);
  });

  it("classifies active exceptions", () => {
    const artifacts = [makeException()];
    const report = buildExceptionReport(artifacts);

    expect(report.summary.total).toBe(1);
    expect(report.summary.active).toBe(1);
    expect(report.exceptions[0].status).toBe("active");
    expect(report.exceptions[0].daysRemaining).toBeGreaterThan(30);
  });

  it("classifies expired exceptions", () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const artifacts = [
      makeException({ id: "EXCEPT-EXPIRED", expiresAt: pastDate.toISOString().split("T")[0] }),
    ];
    const report = buildExceptionReport(artifacts);

    expect(report.summary.total).toBe(1);
    expect(report.summary.expired).toBe(1);
    expect(report.exceptions[0].status).toBe("expired");
    expect(report.exceptions[0].daysRemaining).toBeLessThan(0);
  });

  it("classifies expiring-soon exceptions (within threshold)", () => {
    const soonDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
    const artifacts = [
      makeException({ id: "EXCEPT-SOON", expiresAt: soonDate.toISOString().split("T")[0] }),
    ];
    const report = buildExceptionReport(artifacts);

    expect(report.summary.total).toBe(1);
    expect(report.summary.expiringSoon).toBe(1);
    expect(report.exceptions[0].status).toBe("expiring-soon");
  });

  it("respects custom expiring threshold", () => {
    const soonDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
    const artifacts = [
      makeException({ id: "EXCEPT-THRESH", expiresAt: soonDate.toISOString().split("T")[0] }),
    ];

    // 7-day threshold → should be active (15 > 7)
    const r1 = buildExceptionReport(artifacts, { expiringThresholdDays: 7 });
    expect(r1.exceptions[0].status).toBe("active");

    // 20-day threshold → should be expiring-soon (15 < 20)
    const r2 = buildExceptionReport(artifacts, { expiringThresholdDays: 20 });
    expect(r2.exceptions[0].status).toBe("expiring-soon");
  });

  it("sorts exceptions: expired → expiring-soon → active", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    const artifacts = [
      makeException({ id: "EXCEPT-ACTIVE", expiresAt: future.toISOString().split("T")[0] }),
      makeException({ id: "EXCEPT-EXPIRED", expiresAt: past.toISOString().split("T")[0] }),
      makeException({ id: "EXCEPT-SOON", expiresAt: soon.toISOString().split("T")[0] }),
    ];

    const report = buildExceptionReport(artifacts);
    expect(report.exceptions[0].id).toBe("EXCEPT-EXPIRED");
    expect(report.exceptions[1].id).toBe("EXCEPT-SOON");
    expect(report.exceptions[2].id).toBe("EXCEPT-ACTIVE");
  });

  it("counts scope sizes", () => {
    const artifacts = [
      makeException({
        id: "EXCEPT-SCOPED",
        scope: {
          artifactIds: ["SYS-001", "SYS-002"],
          rules: ["ea:drift/stale", "ea:drift/orphan"],
          domains: ["systems"],
        },
      }),
    ];

    const report = buildExceptionReport(artifacts);
    expect(report.exceptions[0].scopeArtifactCount).toBe(2);
    expect(report.exceptions[0].scopeRuleCount).toBe(2);
    expect(report.exceptions[0].scopeDomainCount).toBe(1);
  });

  it("handles multiple exceptions with mixed statuses", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    const artifacts = [
      makeException({ id: "EX-1", expiresAt: past.toISOString().split("T")[0] }),
      makeException({ id: "EX-2", expiresAt: past.toISOString().split("T")[0] }),
      makeException({ id: "EX-3", expiresAt: soon.toISOString().split("T")[0] }),
      makeException({ id: "EX-4", expiresAt: future.toISOString().split("T")[0] }),
      makeException({ id: "EX-5", expiresAt: future.toISOString().split("T")[0] }),
    ];

    const report = buildExceptionReport(artifacts);
    expect(report.summary.total).toBe(5);
    expect(report.summary.expired).toBe(2);
    expect(report.summary.expiringSoon).toBe(1);
    expect(report.summary.active).toBe(2);
  });
});

// ─── renderExceptionReportMarkdown ──────────────────────────────────────────────

describe("renderExceptionReportMarkdown", () => {
  it("renders empty report", () => {
    const report = buildExceptionReport([]);
    const md = renderExceptionReportMarkdown(report);

    expect(md).toContain("# Exception Report");
    expect(md).toContain("_No exceptions found._");
    expect(md).toContain("| Active | 0 |");
  });

  it("renders exceptions table", () => {
    const artifacts = [makeException({ id: "EXCEPT-001" })];
    const report = buildExceptionReport(artifacts);
    const md = renderExceptionReportMarkdown(report);

    expect(md).toContain("# Exception Report");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Exceptions");
    expect(md).toContain("`EXCEPT-001`");
    expect(md).toContain("chief-architect");
    expect(md).toContain("quarterly");
  });

  it("shows status icons", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);

    const artifacts = [
      makeException({ id: "EX-EXP", expiresAt: past.toISOString().split("T")[0] }),
      makeException({ id: "EX-SOON", expiresAt: soon.toISOString().split("T")[0] }),
      makeException({ id: "EX-OK", expiresAt: future.toISOString().split("T")[0] }),
    ];
    const report = buildExceptionReport(artifacts);
    const md = renderExceptionReportMarkdown(report);

    expect(md).toContain("❌ expired");
    expect(md).toContain("⚠️ expiring-soon");
    expect(md).toContain("✅ active");
  });
});

// ─── buildReportIndex ───────────────────────────────────────────────────────────

describe("buildReportIndex", () => {
  it("returns index with all report types", () => {
    const index = buildReportIndex([]);
    expect(index.reports).toHaveLength(6);
    expect(index.reports.map((r) => r.name)).toEqual([
      "system-data-matrix",
      "classification-coverage",
      "capability-map",
      "exceptions",
      "drift-heatmap",
      "traceability-index",
    ]);
  });

  it("counts artifacts by domain", () => {
    const artifacts = [
      makeArtifact({ id: "APP-001", kind: "application" }),
      makeArtifact({ id: "APP-002", kind: "application" }),
      makeArtifact({ id: "DS-001", kind: "data-store" }),
    ];
    const index = buildReportIndex(artifacts);

    expect(index.summary.totalArtifacts).toBe(3);
    expect(index.summary.byDomain.systems).toBe(2);
    expect(index.summary.byDomain.data).toBe(1);
  });

  it("includes exception stats in index", () => {
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const artifacts = [
      makeException({ id: "EX-1", expiresAt: future.toISOString().split("T")[0] }),
      makeException({ id: "EX-2", expiresAt: past.toISOString().split("T")[0] }),
    ];

    const index = buildReportIndex(artifacts);
    const excReport = index.reports.find((r) => r.name === "exceptions")!;

    expect(excReport.stats.total).toBe(2);
    expect(excReport.stats.active).toBe(1);
    expect(excReport.stats.expired).toBe(1);
  });

  it("has generatedAt timestamp", () => {
    const index = buildReportIndex([]);
    expect(index.generatedAt).toBeTruthy();
    expect(new Date(index.generatedAt).getTime()).not.toBeNaN();
  });
});

// ─── CLI Integration Tests ──────────────────────────────────────────────────────

describe("CLI: ea report (exceptions & --all)", () => {
  const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

  function initEa(dir: string): void {
    mkdirSync(join(dir, "ea", "systems"), { recursive: true });
    mkdirSync(join(dir, "ea", "delivery"), { recursive: true });
    mkdirSync(join(dir, "ea", "data"), { recursive: true });
    mkdirSync(join(dir, "ea", "information"), { recursive: true });
    mkdirSync(join(dir, "ea", "business"), { recursive: true });
    mkdirSync(join(dir, "ea", "transitions"), { recursive: true });
    mkdirSync(join(dir, "specs"), { recursive: true });

    writeFileSync(
      join(dir, "ea", "ea.config.json"),
      JSON.stringify({ rootDir: "ea", schemaVersion: "1.0.0" }),
    );
  }

  function runCLI(args: string, cwd?: string): { stdout: string; code: number } {
    try {
      const stdout = execSync(`node ${CLI_PATH} ${args}`, {
        encoding: "utf-8",
        cwd: cwd ?? tempDir,
        env: ENV,
        timeout: 15_000,
      });
      return { stdout, code: 0 };
    } catch (err: any) {
      return { stdout: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 };
    }
  }

  it("shows exceptions report (empty)", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea report --view exceptions");
    expect(code).toBe(0);
    expect(stdout).toContain("Exception Report");
    expect(stdout).toContain("No exceptions found");
  });

  it("shows exceptions report with data", () => {
    initEa(tempDir);
    const future = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    writeFileSync(
      join(tempDir, "ea", "transitions", "except-001.json"),
      JSON.stringify({
        id: "EXCEPT-001",
        kind: "exception",
        title: "Legacy DB Exception",
        schemaVersion: "1.0.0",
        status: "current",
        summary: "Exception for legacy DB migration",
        owners: ["team-a"],
        confidence: "declared",
        scope: { artifactIds: ["SYS-001"] },
        approvedBy: "chief-architect",
        approvedAt: "2025-01-15",
        expiresAt: future.toISOString().split("T")[0],
        reason: "Legacy migration in progress",
        reviewSchedule: "quarterly",
      }),
    );

    const { stdout, code } = runCLI("ea report --view exceptions");
    expect(code).toBe(0);
    expect(stdout).toContain("EXCEPT-001");
    expect(stdout).toContain("active");
  });

  it("shows exceptions report as JSON", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea report --view exceptions --format json");
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("summary");
    expect(parsed).toHaveProperty("exceptions");
  });

  it("generates all reports with --all", () => {
    initEa(tempDir);
    const outDir = join(tempDir, "ea", "generated");
    const { stdout, code } = runCLI("ea report --all");
    expect(code).toBe(0);
    expect(stdout).toContain("Generated 6 reports + index");

    // Check report files exist
    expect(existsSync(join(outDir, "system-data-matrix.md"))).toBe(true);
    expect(existsSync(join(outDir, "classification-coverage.md"))).toBe(true);
    expect(existsSync(join(outDir, "capability-map.md"))).toBe(true);
    expect(existsSync(join(outDir, "exception-report.md"))).toBe(true);
    expect(existsSync(join(outDir, "traceability-index.md"))).toBe(true);
    expect(existsSync(join(outDir, "report-index.json"))).toBe(true);
  });

  it("generates all reports in JSON with --all --format json", () => {
    initEa(tempDir);
    const outDir = join(tempDir, "ea", "generated");
    const { code } = runCLI("ea report --all --format json");
    expect(code).toBe(0);

    expect(existsSync(join(outDir, "system-data-matrix.json"))).toBe(true);
    expect(existsSync(join(outDir, "exception-report.json"))).toBe(true);
    expect(existsSync(join(outDir, "report-index.json"))).toBe(true);

    // Validate index JSON
    const index = JSON.parse(readFileSync(join(outDir, "report-index.json"), "utf-8"));
    expect(index.reports).toHaveLength(6);    expect(index.summary).toHaveProperty("totalArtifacts");
    expect(index.summary).toHaveProperty("byDomain");
  });

  it("errors without --view or --all", () => {
    initEa(tempDir);
    const { code, stdout } = runCLI("ea report");
    expect(code).not.toBe(0);
    expect(stdout).toContain("--view");
  });
});
