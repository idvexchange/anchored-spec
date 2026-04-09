import { afterEach, describe, expect, it } from "vitest";

import { analyzeImpact, renderImpactReportMarkdown } from "../impact.js";
import { buildRelationGraph } from "../graph.js";
import { createDefaultRegistry } from "../relation-registry.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeEntity,
  writeTextFile,
  runCli,
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
    makeEntity({ ref: "component:auth", kind: "Component", type: "service", title: "Auth Service" }),
    makeEntity({
      ref: "component:payments",
      kind: "Component",
      type: "website",
      title: "Payments App",
      uses: ["component:auth"],
    }),
    makeEntity({
      ref: "component:portal",
      kind: "Component",
      type: "website",
      title: "Portal App",
      uses: ["component:payments"],
    }),
  ];
}

function makeExtendedGraph() {
  return [
    makeEntity({ ref: "service:auth", kind: "service", title: "Auth Service" }),
    makeEntity({
      ref: "application:payments",
      kind: "application",
      title: "Payments App",
      uses: ["service:auth"],
    }),
    makeEntity({
      ref: "application:portal",
      kind: "application",
      title: "Portal App",
      uses: ["application:payments"],
    }),
    makeEntity({
      ref: "api-contract:payments",
      kind: "api-contract",
      title: "Payments API",
      dependsOn: ["service:auth"],
    }),
    makeEntity({
      ref: "requirement:security",
      kind: "requirement",
      title: "Security Requirement",
      governedBy: ["service:auth"],
    }),
  ];
}

describe("impact analysis", () => {
  it("analyzes transitive impact using Backstage entity refs", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");

    expect(report.sourceRef).toBe("component:auth");
    expect(report.totalImpacted).toBe(2);
    expect(report.maxDepth).toBe(2);
    const ids = report.impacted.map((e) => e.id);
    expect(ids).toContain("component:default/payments");
    expect(ids).toContain("component:default/portal");
    expect(renderImpactReportMarkdown(report)).toContain("# Impact Analysis: Auth Service");
  });

  it("computes scores between 0 and 1", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
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
      makeGraphArtifacts(),
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
      makeExtendedGraph(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "service:auth");

    const categories = new Set(report.impacted.map((e) => e.category));
    expect(categories.size).toBeGreaterThanOrEqual(1);

    for (const entity of report.impacted) {
      expect(["code", "contracts", "data", "docs", "constraints", "ops", "teams"]).toContain(entity.category);
    }
  });

  it("groups by category in byCategory", () => {
    const graph = buildRelationGraph(
      makeExtendedGraph(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "service:auth");

    expect(report.byCategory.length).toBeGreaterThan(0);
    const totalFromCategories = report.byCategory.reduce((sum, c) => sum + c.count, 0);
    expect(totalFromCategories).toBe(report.totalImpacted);
  });

  it("filters by minScore", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth", { minScore: 0.99 });
    for (const entity of report.impacted) {
      expect(entity.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  it("limits results with maxResults", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth", { maxResults: 1 });
    expect(report.impacted.length).toBeLessThanOrEqual(1);
    expect(report.totalImpacted).toBeLessThanOrEqual(1);
  });

  it("sorts by depth when sortBy is depth", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth", { sortBy: "depth" });
    for (let i = 1; i < report.impacted.length; i++) {
      expect(report.impacted[i].depth).toBeGreaterThanOrEqual(report.impacted[i - 1].depth);
    }
  });

  it("sorts by score descending by default", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
      createDefaultRegistry(),
    );
    const report = analyzeImpact(graph, "component:auth");
    for (let i = 1; i < report.impacted.length; i++) {
      expect(report.impacted[i].score).toBeLessThanOrEqual(report.impacted[i - 1].score);
    }
  });

  it("returns empty report for unknown entity", () => {
    const graph = buildRelationGraph(
      makeGraphArtifacts(),
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
    expect(payload.sourceRef).toBe("component:default/auth");
    expect(payload.totalImpacted).toBe(2);
    expect(result.stderr).toContain("entities impacted");
  });

  it("builds suggestion-oriented command plans from workflow policy and workspace scripts", () => {
    const dir = makeWorkspace("impact-cli-commands");
    writeManifestProject(dir, [
      makeEntity({
        ref: "component:auth",
        kind: "Component",
        type: "library",
        title: "Auth Package",
        annotations: {
          "anchored-spec.dev/code-location": "packages/auth/src/",
        },
      }),
      makeEntity({
        ref: "component:payments",
        kind: "Component",
        type: "website",
        title: "Payments App",
        uses: ["component:auth"],
        annotations: {
          "anchored-spec.dev/code-location": "apps/payments/src/",
        },
      }),
    ]);

    writeTextFile(dir, "package.json", JSON.stringify({
      name: "repo-root",
      private: true,
      workspaces: ["apps/*", "packages/*"],
      scripts: {
        typecheck: "tsc --noEmit",
      },
    }, null, 2));

    writeTextFile(dir, "apps/payments/package.json", JSON.stringify({
      name: "@acme/payments",
      scripts: {
        typecheck: "tsc --noEmit",
        test: "vitest run",
        "db:generate": "prisma generate",
      },
    }, null, 2));
    writeTextFile(dir, "apps/payments/src/index.ts", "export const payments = true;\n");

    writeTextFile(dir, "packages/auth/package.json", JSON.stringify({
      name: "@acme/auth",
      scripts: {
        typecheck: "tsc --noEmit",
      },
    }, null, 2));
    writeTextFile(dir, "packages/auth/src/index.ts", "export const auth = true;\n");

    writeTextFile(dir, "docs/workflow-policy.yaml", `workflowVariants:
  - id: feature
    name: "Feature"
    defaultTypes: [feature]
    requiredSchemas: [change]
changeRequiredRules:
  - id: app-source
    include: ["apps/**"]
    commands: ["pnpm validate"]
    broaderCommands: ["pnpm test"]
    actionCommands: ["pnpm db:generate"]
trivialExemptions: ["**/*.md"]
lifecycleRules:
  plannedToActiveRequiresChange: true
`);

    const result = runCli(["impact", "component:auth", "--format", "json", "--with-commands"], dir);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      commandPlan?: {
        commands: string[];
        broaderCommands: string[];
        actionCommands: string[];
        impactedWorkspaces: Array<{ name: string }>;
      };
    };

    expect(payload.commandPlan).toBeDefined();
    expect(payload.commandPlan?.impactedWorkspaces.some((workspace) => workspace.name === "@acme/payments")).toBe(true);
    expect(payload.commandPlan?.commands).toContain("pnpm --filter @acme/payments run typecheck");
    expect(payload.commandPlan?.commands).toContain("pnpm validate");
    expect(payload.commandPlan?.broaderCommands).toContain("pnpm --filter @acme/payments run test");
    expect(payload.commandPlan?.actionCommands).toContain("pnpm --filter @acme/payments run db:generate");
  });
});
