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
import type { BackstageEntity } from "../backstage/types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeEntity(overrides: {
  kind?: string;
  name: string;
  title?: string;
  specType?: string;
  spec?: Record<string, unknown>;
}): BackstageEntity {
  const kind = overrides.kind ?? "Component";
  const apiVersion = kind === "Component" || kind === "API" || kind === "Resource" || kind === "System" || kind === "Domain" || kind === "Group"
    ? "backstage.io/v1alpha1"
    : "anchored-spec.dev/v1alpha1";
  return {
    apiVersion,
    kind,
    metadata: {
      name: overrides.name,
      title: overrides.title ?? overrides.name,
      annotations: {
        "anchored-spec.dev/confidence": "declared",
      },
    },
    spec: {
      type: overrides.specType ?? "service",
      owner: "team-a",
      lifecycle: "production",
      ...overrides.spec,
    },
  };
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────────

describe("analyzeImpact", () => {
  it("returns empty impact for isolated artifact", () => {
    const entities: BackstageEntity[] = [
      makeEntity({ name: "app-a", title: "App A" }),
      makeEntity({ name: "app-b", title: "App B" }),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const report = analyzeImpact(graph, "component:app-a");

    expect(report.totalImpacted).toBe(0);
    expect(report.sourceId).toBe("component:app-a");
    expect(report.impacted).toHaveLength(0);
  });

  it("finds direct dependents", () => {
    const entities: BackstageEntity[] = [
      makeEntity({ name: "auth-service", title: "Auth Service" }),
      makeEntity({
        name: "web-app",
        title: "Web App",
        spec: { dependsOn: ["component:auth-service"] },
      }),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const report = analyzeImpact(graph, "component:auth-service");

    expect(report.totalImpacted).toBe(1);
    expect(report.impacted[0]!.id).toBe("component:web-app");
    expect(report.impacted[0]!.depth).toBe(1);
  });

  it("finds transitive dependents", () => {
    const entities: BackstageEntity[] = [
      makeEntity({ name: "auth-service", title: "Auth Service" }),
      makeEntity({
        name: "api-gateway",
        title: "API Gateway",
        spec: { dependsOn: ["component:auth-service"] },
      }),
      makeEntity({
        name: "web-app",
        title: "Web App",
        spec: { dependsOn: ["component:api-gateway"] },
      }),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const report = analyzeImpact(graph, "component:auth-service");

    expect(report.totalImpacted).toBe(2);
    expect(report.maxDepth).toBe(2);
    // BFS order: depth 1 first
    expect(report.impacted[0]!.depth).toBe(1);
    expect(report.impacted[1]!.depth).toBe(2);
  });

  it("respects maxDepth", () => {
    const entities: BackstageEntity[] = [
      makeEntity({ name: "auth-service", title: "Auth Service" }),
      makeEntity({
        name: "api-gateway",
        title: "API Gateway",
        spec: { dependsOn: ["component:auth-service"] },
      }),
      makeEntity({
        name: "web-app",
        title: "Web App",
        spec: { dependsOn: ["component:api-gateway"] },
      }),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const report = analyzeImpact(graph, "component:auth-service", { maxDepth: 1 });

    expect(report.totalImpacted).toBe(1);
    expect(report.impacted[0]!.id).toBe("component:api-gateway");
  });

  it("groups by domain", () => {
    const entities: BackstageEntity[] = [
      makeEntity({
        kind: "Resource",
        name: "user-db",
        title: "User DB",
        specType: "database",
      }),
      makeEntity({
        name: "web-app",
        title: "Web App",
        spec: { dependsOn: ["resource:user-db"] },
      }),
      makeEntity({
        kind: "Capability",
        name: "user-mgmt",
        title: "User Management",
        spec: { supports: ["component:web-app"] },
      }),
    ];

    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const report = analyzeImpact(graph, "resource:user-db");

    expect(report.byDomain.length).toBeGreaterThanOrEqual(1);
    expect(report.totalImpacted).toBeGreaterThanOrEqual(1);
  });

  it("returns safe result for unknown artifact", () => {
    const entities: BackstageEntity[] = [
      makeEntity({ name: "app-001" }),
    ];
    const registry = createDefaultRegistry();
    const graph = buildRelationGraph(entities, registry);
    const report = analyzeImpact(graph, "component:nonexistent");

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
    // Graph uses entity refs — legacy "systems/APP-001" becomes "component:001"
    expect(report).toHaveProperty("sourceId", "component:001");
    expect(report).toHaveProperty("totalImpacted", 0);
  });
});
