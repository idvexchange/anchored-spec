import { afterEach, describe, expect, it } from "vitest";
import { EaRoot } from "../loader.js";
import { runEaVerification } from "../verify.js";
import { cleanupTestWorkspace, createTestWorkspace, makeEntity, writeManifestProject, } from "../../test-helpers/workspace.js";
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
async function verifyEntities(prefix: string, entities: Array<ReturnType<typeof makeEntity>>, options?: Parameters<typeof runEaVerification>[1]) {
    const dir = makeWorkspace(prefix);
    const config = writeManifestProject(dir, entities);
    const root = new EaRoot(dir, config);
    return runEaVerification(root, options);
}
describe("runEaVerification", () => {
    it("reports broken relation targets as errors", async () => {
        const result = await verifyEntities("verify-broken-relation", [
            makeEntity({
                ref: "component:payments",
                kind: "Component",
                type: "website",
                uses: ["component:missing"]
            }),
        ]);
        expect(result.passed).toBe(false);
        expect(result.findings.some((finding) => finding.rule === "ea:verify:broken-relation-target")).toBe(true);
    });
    it("passes a singly owned active entity without treating owner linkage as orphaned", async () => {
        const result = await verifyEntities("verify-orphan", [
            makeEntity({ ref: "component:auth", kind: "Component", type: "service" }),
        ]);
        expect(result.passed).toBe(true);
        expect(result.findings.some((finding) => finding.severity === "error")).toBe(false);
    });
    it("flags deprecated entities that lack an explanation", async () => {
        const result = await verifyEntities("verify-deprecated", [
            makeEntity({
                ref: "component:sunset",
                kind: "Component",
                type: "service",
                status: "deprecated",
                summary: "Old service",
                tags: []
            }),
        ]);
        expect(result.findings.some((finding) => finding.rule === "ea:verify:deprecated-needs-reason")).toBe(true);
    });
    it("supports strict mode and rule overrides for current v2 findings", async () => {
        const entities = [
            makeEntity({
                ref: "BASE-migration",
                kind: "TransitionPlan",
                type: "baseline",
                status: "active"
            }),
        ];
        const strictResult = await verifyEntities("verify-strict", entities, {
            strict: true
        });
        expect(strictResult.passed).toBe(false);
        expect(strictResult.findings.some((finding) => finding.rule === "ea:verify:transition-needs-target" &&
            finding.severity === "error")).toBe(true);
        const overriddenResult = await verifyEntities("verify-overrides", entities, {
            ruleOverrides: { "ea:verify:transition-needs-target": "off" }
        });
        expect(overriddenResult.findings.some((finding) => finding.rule === "ea:verify:transition-needs-target")).toBe(false);
    });
});
