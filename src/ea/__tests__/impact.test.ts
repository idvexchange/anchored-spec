/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * EA Impact Analysis — Tests
 *
 * Tests for:
 * - analyzeImpact() — BFS traversal with depth tracking
 * - renderImpactReportMarkdown() — markdown output
 * - CLI: ea impact
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  analyzeImpact,
  renderImpactReportMarkdown,
  buildRelationGraph,
  createDefaultRegistry,
} from "../index.js";
import type { EaArtifactBase } from "../index.js";

// ─── Unit Tests ─────────────────────────────────────────────────────────────────

describe("analyzeImpact", () => {
  const makeArtifact = (overrides: Partial<EaArtifactBase>): EaArtifactBase => ({
    id: "test/SYS-001",
    schemaVersion: "1.0.0",
    kind: "system",
    title: "Test",
    status: "active",
    summary: "test",
    owners: ["team-a"],
    ...overrides,
  });

  it("returns empty impact for isolated artifact", () => {
    const artifacts = [
      makeArtifact({ id: "systems/APP-001", kind: "application", title: "App A" }),
      makeArtifact({ id: "systems/APP-002", kind: "application", title: "App B" }),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const report = analyzeImpact(graph, "systems/APP-001");

    expect(report.totalImpacted).toBe(0);
    expect(report.sourceId).toBe("systems/APP-001");
    expect(report.impacted).toHaveLength(0);
  });

  it("finds direct dependents", () => {
    const artifacts = [
      makeArtifact({
        id: "systems/SVC-001",
        kind: "service",
        title: "Auth Service",
      }),
      makeArtifact({
        id: "systems/APP-001",
        kind: "application",
        title: "Web App",
        relations: [{ type: "dependsOn", target: "systems/SVC-001" }],
      } as any),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const report = analyzeImpact(graph, "systems/SVC-001");

    expect(report.totalImpacted).toBe(1);
    expect(report.impacted[0]!.id).toBe("systems/APP-001");
    expect(report.impacted[0]!.depth).toBe(1);
  });

  it("finds transitive dependents", () => {
    const artifacts = [
      makeArtifact({
        id: "systems/SVC-001",
        kind: "service",
        title: "Auth Service",
      }),
      makeArtifact({
        id: "systems/SVC-002",
        kind: "service",
        title: "API Gateway",
        relations: [{ type: "dependsOn", target: "systems/SVC-001" }],
      } as any),
      makeArtifact({
        id: "systems/APP-001",
        kind: "application",
        title: "Web App",
        relations: [{ type: "dependsOn", target: "systems/SVC-002" }],
      } as any),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const report = analyzeImpact(graph, "systems/SVC-001");

    expect(report.totalImpacted).toBe(2);
    expect(report.maxDepth).toBe(2);
    // BFS order: depth 1 first
    expect(report.impacted[0]!.depth).toBe(1);
    expect(report.impacted[1]!.depth).toBe(2);
  });

  it("respects maxDepth", () => {
    const artifacts = [
      makeArtifact({
        id: "systems/SVC-001",
        kind: "service",
        title: "Auth Service",
      }),
      makeArtifact({
        id: "systems/SVC-002",
        kind: "service",
        title: "API Gateway",
        relations: [{ type: "dependsOn", target: "systems/SVC-001" }],
      } as any),
      makeArtifact({
        id: "systems/APP-001",
        kind: "application",
        title: "Web App",
        relations: [{ type: "dependsOn", target: "systems/SVC-002" }],
      } as any),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const report = analyzeImpact(graph, "systems/SVC-001", { maxDepth: 1 });

    expect(report.totalImpacted).toBe(1);
    expect(report.impacted[0]!.id).toBe("systems/SVC-002");
  });

  it("groups by domain", () => {
    const artifacts = [
      makeArtifact({
        id: "data/DS-001",
        kind: "data-store",
        title: "User DB",
        technology: { engine: "postgres", category: "relational" },
      } as any),
      makeArtifact({
        id: "systems/APP-001",
        kind: "application",
        title: "Web App",
        relations: [{ type: "dependsOn", target: "data/DS-001" }],
      } as any),
      makeArtifact({
        id: "business/CAP-001",
        kind: "capability",
        title: "User Management",
        relations: [{ type: "supports", target: "systems/APP-001" }],
      } as any),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const report = analyzeImpact(graph, "data/DS-001");

    expect(report.byDomain.length).toBeGreaterThanOrEqual(1);
    expect(report.totalImpacted).toBeGreaterThanOrEqual(1);
  });

  it("returns safe result for unknown artifact", () => {
    const artifacts = [makeArtifact({ id: "systems/APP-001", kind: "application" })];
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(artifacts, registry);
    const report = analyzeImpact(graph, "nonexistent/X-001");

    expect(report.totalImpacted).toBe(0);
    expect(report.sourceKind).toBe("unknown");
  });
});

describe("renderImpactReportMarkdown", () => {
  it("renders empty report", () => {
    const md = renderImpactReportMarkdown({
      sourceId: "systems/APP-001",
      sourceKind: "application",
      sourceTitle: "App A",
      totalImpacted: 0,
      maxDepth: 0,
      byDomain: [],
      impacted: [],
    });

    expect(md).toContain("Impact Analysis: App A");
    expect(md).toContain("No downstream impacts found");
  });

  it("renders report with impacts", () => {
    const md = renderImpactReportMarkdown({
      sourceId: "systems/SVC-001",
      sourceKind: "service",
      sourceTitle: "Auth Service",
      totalImpacted: 2,
      maxDepth: 2,
      byDomain: [
        {
          domain: "systems",
          count: 2,
          artifacts: [
            { id: "systems/APP-001", kind: "application", domain: "systems", title: "Web App", depth: 1, viaRelations: ["dependsOn"] },
            { id: "systems/APP-002", kind: "application", domain: "systems", title: "Mobile App", depth: 2, viaRelations: ["dependsOn"] },
          ],
        },
      ],
      impacted: [
        { id: "systems/APP-001", kind: "application", domain: "systems", title: "Web App", depth: 1, viaRelations: ["dependsOn"] },
        { id: "systems/APP-002", kind: "application", domain: "systems", title: "Mobile App", depth: 2, viaRelations: ["dependsOn"] },
      ],
    });

    expect(md).toContain("Impact Analysis: Auth Service");
    expect(md).toContain("Total impacted: 2");
    expect(md).toContain("By Domain");
    expect(md).toContain("systems/APP-001");
    expect(md).toContain("dependsOn");
  });
});

// ─── CLI Integration Tests ──────────────────────────────────────────────────────

describe("CLI: ea impact", () => {
  let tempDir: string;
  const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

  function runCLI(args: string): { stdout: string; code: number } {
    try {
      const stdout = execSync(`node ${CLI_PATH} ${args}`, {
        encoding: "utf-8",
        cwd: tempDir,
        env: ENV,
        timeout: 15_000,
      });
      return { stdout, code: 0 };
    } catch (err: any) {
      return { stdout: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 };
    }
  }

  function initEa(dir: string): void {
    execSync(`node ${CLI_PATH} ea init`, { cwd: dir, env: ENV, timeout: 10_000 });
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ea-impact-test-"));
    mkdirSync(join(tempDir, "specs"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("shows help", () => {
    const { stdout, code } = runCLI("ea impact --help");
    expect(code).toBe(0);
    expect(stdout).toContain("impact");
    expect(stdout).toContain("artifact-id");
  });

  it("errors when EA not initialized", () => {
    const { stdout, code } = runCLI("ea impact systems/APP-001");
    expect(code).not.toBe(0);
    expect(stdout).toContain("not initialized");
  });

  it("errors when artifact not found", () => {
    initEa(tempDir);
    // Create at least one artifact so graph is non-empty
    mkdirSync(join(tempDir, "ea", "systems"), { recursive: true });
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-001.yaml"),
      `id: systems/APP-001
schemaVersion: "1.0.0"
kind: application
title: Test App
status: active
summary: A test application
owners:
  - team-a
`,
    );
    const { stdout, code } = runCLI("ea impact nonexistent/X-001");
    expect(code).not.toBe(0);
    expect(stdout).toContain("not found");
  });

  it("shows no impacts for isolated artifact", () => {
    initEa(tempDir);
    // Create a simple artifact
    mkdirSync(join(tempDir, "ea", "systems"), { recursive: true });
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-001.yaml"),
      `id: systems/APP-001
schemaVersion: "1.0.0"
kind: application
title: Test App
status: active
summary: A test application
owners:
  - team-a
`,
    );

    const { stdout, code } = runCLI("ea impact systems/APP-001");
    expect(code).toBe(0);
    expect(stdout).toContain("No downstream impacts found");
  });

  it("outputs JSON with --format json", () => {
    initEa(tempDir);
    mkdirSync(join(tempDir, "ea", "systems"), { recursive: true });
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-001.yaml"),
      `id: systems/APP-001
schemaVersion: "1.0.0"
kind: application
title: Test App
status: active
summary: A test application
owners:
  - team-a
`,
    );

    const { stdout, code } = runCLI("ea impact systems/APP-001 --format json");
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("sourceId", "systems/APP-001");
    expect(report).toHaveProperty("totalImpacted", 0);
  });
});
