import { afterEach, describe, expect, it } from "vitest";

import { analyzeImpact, renderImpactReportMarkdown } from "../impact.js";
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

describe("impact analysis", () => {
  it("analyzes transitive impact using Backstage entity refs", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts().map((artifact) => toBackstageEntity(artifact)),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    expect(report.sourceId).toBe("component:auth");
    expect(report.totalImpacted).toBe(2);
    expect(report.maxDepth).toBe(2);
    expect(report.impacted.map((artifact) => artifact.id)).toEqual([
      "component:payments",
      "component:portal",
    ]);
    expect(renderImpactReportMarkdown(report)).toContain(
      "# Impact Analysis: Auth Service",
    );
  });
});

describe("impact CLI", () => {
  it("accepts canonical entity refs and reports entity-native source ids", () => {
    const dir = makeWorkspace("impact-cli");
    writeManifestProject(dir, makeGraphArtifacts());

    const result = runCli(["impact", "component:auth", "--format", "json"], dir);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      sourceId: string;
      totalImpacted: number;
    };
    expect(payload.sourceId).toBe("component:auth");
    expect(payload.totalImpacted).toBe(2);
    expect(result.stderr).toContain("entities impacted");
  });
});
