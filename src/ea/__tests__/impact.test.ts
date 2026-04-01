import { afterEach, describe, expect, it } from "vitest";

import { analyzeImpact, renderImpactReportMarkdown } from "../impact.js";
import type { ImpactedEntity, ImpactReport } from "../impact.js";
import { buildRelationGraph } from "../graph.js";
import { createDefaultRegistry } from "../relation-registry.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  runCli,
  toBackstageEntity,
  writeManifestProject,
} from "../../test-helpers/workspace.js";

const workspaces: string[] = [];

function makeWorkspace(prefix: string): string {
  const dir = createTestWorkspace(prefix);
  workspaces.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    cleanupTestWorkspace(dir);
  }
});

function makeGraphArtifacts() {
  return [
    makeArtifact({ id: "SVC-auth", kind: "service", title: "Auth Service" }),
    makeArtifact({
      id: "APP-payments",
      kind: "application",
      title: "Payments App",
      relations: [{ type: "uses", target: "SVC-auth" }],
    }),
    makeArtifact({
      id: "APP-portal",
      kind: "application",
      title: "Portal App",
      relations: [{ type: "uses", target: "APP-payments" }],
    }),
  ];
}

function makeExtendedGraph() {
  return [
    makeArtifact({ id: "SVC-auth", kind: "service", title: "Auth Service" }),
    makeArtifact({
      id: "APP-payments",
      kind: "application",
      title: "Payments App",
      relations: [{ type: "uses", target: "SVC-auth" }],
    }),
    makeArtifact({
      id: "APP-portal",
      kind: "application",
      title: "Portal App",
      relations: [{ type: "uses", target: "APP-payments" }],
    }),
    makeArtifact({
      id: "API-payments",
      kind: "api-contract",
      title: "Payments API",
      relations: [{ type: "dependsOn", target: "SVC-auth" }],
    }),
    makeArtifact({
      id: "DOC-security",
      kind: "requirement",
      title: "Security Requirement",
      relations: [{ type: "governedBy", target: "SVC-auth" }],
    }),
  ];
}

describe("impact analysis", () => {
  it("analyzes transitive impact using Backstage entity refs", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((artifact) => toBackstageEntity(artifact)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    expect(report.sourceRef).toBe("component:auth");
    expect(report.totalImpacted).toBe(2);
    expect(report.maxDepth).toBe(2);
    // Sorted by score, both are "uses" but depth-1 scores higher
    const ids = report.impacted.map((e) => e.id);
    expect(ids).toContain("component:payments");
    expect(ids).toContain("component:portal");
    expect(renderImpactReportMarkdown(report)).toContain(
      "# Impact Analysis: Auth Service",
    );
  });

  it("computes scores between 0 and 1", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    for (const entity of report.impacted) {
      expect(entity.score).toBeGreaterThanOrEqual(0);
      expect(entity.score).toBeLessThanOrEqual(1);
      expect(entity.scoreBreakdown).toBeDefined();
    }
  });

  it("ranks depth-1 entities higher than depth-2", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    const depth1 = report.impacted.filter((e) => e.depth === 1);
    const depth2 = report.impacted.filter((e) => e.depth === 2);
    expect(depth1.length).toBeGreaterThan(0);
    expect(depth2.length).toBeGreaterThan(0);
    expect(depth1[0].score).toBeGreaterThan(depth2[0].score);
  });

  it("classifies categories for known kinds", () => {
    const graph = buildRelationGraph(
      makeExtendedGraph().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    // service/application -> "code", api-contract -> "contracts", requirement -> "docs"
    const categories = new Set(report.impacted.map((e) => e.category));
    expect(categories.size).toBeGreaterThanOrEqual(1);

    for (const entity of report.impacted) {
      expect(["code", "contracts", "data", "docs", "constraints", "ops", "teams"]).toContain(entity.category);
    }
  });

  it("groups by category in byCategory", () => {
    const graph = buildRelationGraph(
      makeExtendedGraph().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    expect(report.byCategory.length).toBeGreaterThan(0);
    const totalFromCategories = report.byCategory.reduce((sum, c) => sum + c.count, 0);
    expect(totalFromCategories).toBe(report.totalImpacted);
  });

  it("filters by minScore", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    // Use a very high minScore to filter out at least some
    const report = analyzeImpact(graph, "component:auth", { minScore: 0.99 });
    // Depending on scoring, some or all may be filtered
    for (const entity of report.impacted) {
      expect(entity.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("limits results with maxResults", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth", { maxResults: 1 });
    expect(report.impacted.length).toBeLessThanOrEqual(1);
    expect(report.totalImpacted).toBeLessThanOrEqual(1);
  });

  it("sorts by depth when sortBy is depth", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth", { sortBy: "depth" });
    for (let i = 1; i < report.impacted.length; i++) {
      expect(report.impacted[i].depth).toBeGreaterThanOrEqual(report.impacted[i - 1].depth);
    }
  });

  it("sorts by score descending by default", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");
    for (let i = 1; i < report.impacted.length; i++) {
      expect(report.impacted[i].score).toBeLessThanOrEqual(report.impacted[i - 1].score);
    }
  });

  it("returns empty report for unknown entity", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((a) => toBackstageEntity(a)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:nonexistent");
    expect(report.sourceRef).toBe("component:nonexistent");
    expect(report.totalImpacted).toBe(0);
    expect(report.byCategory).toEqual([]);
  });
});

describe("impact CLI", () => {
  it("accepts canonical entity refs and reports entity-native source refs", () => {
    const dir = makeWorkspace("impact-cli");
    writeManifestProject(dir, makeGraphArtifacts());

    const result = runCli(["impact", "component:auth", "--format", "json"], dir);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      sourceRef: string;
      totalImpacted: number;
    };
    expect(payload.sourceRef).toBe("component:auth");
    expect(payload.totalImpacted).toBe(2);
    expect(result.stderr).toContain("entities impacted");
  });
});
