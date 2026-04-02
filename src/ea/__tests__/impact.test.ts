import { afterEach, describe, expect, it } from "vitest";
import { analyzeImpact, renderImpactReportMarkdown } from "../impact.js";
import { buildRelationGraph } from "../graph.js";
import { createDefaultRegistry } from "../relation-registry.js";
import { cleanupTestWorkspace, createTestWorkspace, makeEntity, runCli, writeManifestProject } from "../../test-helpers/workspace.js";
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
function makeGraphEntities() {
    return [
        makeEntity({ ref: "component:auth", kind: "Component", type: "service", title: "Auth Service" }),
        makeEntity({
            ref: "component:payments",
            kind: "Component",
            type: "website",
            title: "Payments App",
            uses: ["component:auth"]
        }),
        makeEntity({
            ref: "component:portal",
            kind: "Component",
            type: "website",
            title: "Portal App",
            uses: ["component:payments"]
        }),
    ];
}
describe("impact analysis", () => {
    it("analyzes transitive impact using Backstage entity refs", () => {
        const graph = buildRelationGraph(makeGraphEntities().map((entity) => entity), createDefaultRegistry());
        const report = analyzeImpact(graph, "component:auth");
        expect(report.sourceId).toBe("component:default/auth");
        expect(report.totalImpacted).toBe(2);
        expect(report.maxDepth).toBe(2);
        expect(report.impacted.map((entity) => entity.id)).toEqual([
            "component:default/payments",
            "component:default/portal",
        ]);
        expect(renderImpactReportMarkdown(report)).toContain("# Impact Analysis: Auth Service");
    });
});
describe("impact CLI", () => {
    it("accepts canonical entity refs and reports entity-native source ids", () => {
        const dir = makeWorkspace("impact-cli");
        writeManifestProject(dir, makeGraphEntities());
        const result = runCli(["impact", "component:auth", "--format", "json"], dir);
        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(result.stdout) as {
            sourceId: string;
            totalImpacted: number;
        };
        expect(payload.sourceId).toBe("component:default/auth");
        expect(payload.totalImpacted).toBe(2);
        expect(result.stderr).toContain("entities impacted");
    });
});
