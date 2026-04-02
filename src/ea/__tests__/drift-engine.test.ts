import { afterEach, describe, expect, it } from "vitest";
import { REPORT_VIEWS, buildDriftHeatmap, detectEaDrift, renderDriftHeatmapMarkdown, } from "../index.js";
import { cleanupTestWorkspace, createTestWorkspace, makeArtifact, runCli, writeManifestProject, writeTextFile, } from "../../test-helpers/workspace.js";
import { makeEntity } from "./helpers/make-entity.js";
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
describe("drift engine", () => {
    it("detects contract version mismatches from entity-first inputs", () => {
        const report = detectEaDrift({
            artifacts: [
                makeEntity({
                    ref: "api:orders",
                    kind: "API",
                    type: "openapi",
                    schemaVersion: "2.0.0",
                    protocol: "rest",
                    specification: "openapi",
                    specVersion: "3.0"
                }),
                makeEntity({
                    ref: "component:checkout",
                    kind: "Component",
                    type: "service",
                    contractVersion: "1.0.0",
                    consumesContracts: ["api:orders"]
                })
            ]
        });
        const mismatch = report.findings.find((finding) => finding.rule === "ea:systems/consumer-contract-version-mismatch");
        expect(mismatch).toBeDefined();
        expect(mismatch?.severity).toBe("warning");
        expect(mismatch?.domain).toBe("systems");
    });
    it("supports exception-based suppression and drift heatmap rendering", () => {
        const api = makeEntity({
            ref: "api:orders",
            kind: "API",
            type: "openapi",
            schemaVersion: "2.0.0",
            protocol: "rest",
            specification: "openapi",
            specVersion: "3.0"
        });
        const consumer = makeEntity({
            ref: "component:checkout",
            kind: "Component",
            type: "service",
            contractVersion: "1.0.0",
            consumesContracts: ["api:orders"]
        });
        const baseline = detectEaDrift({ artifacts: [api, consumer] });
        const finding = baseline.findings.find((entry) => entry.rule === "ea:systems/consumer-contract-version-mismatch");
        expect(finding).toBeDefined();
        const suppressed = detectEaDrift({
            artifacts: [api, consumer],
            exceptions: [
                makeEntity({
                    ref: "exception:version-mismatch",
                    kind: "Exception",
                    status: "active",
                    scope: {
                        artifactIds: [finding!.artifactId],
                        rules: [finding!.rule]
                    },
                    approvedBy: "chief-architect",
                    approvedAt: "2025-01-01",
                    expiresAt: "2099-01-01",
                    reason: "Planned migration window",
                    reviewSchedule: "quarterly"
                })
            ]
        });
        const suppressedFinding = suppressed.findings.find((entry) => entry.rule === finding!.rule);
        expect(suppressedFinding?.suppressed).toBe(true);
        expect(suppressed.summary.suppressed).toBeGreaterThanOrEqual(1);
        const heatmap = buildDriftHeatmap([api, consumer]);
        expect(renderDriftHeatmapMarkdown(heatmap)).toContain("# Drift Heatmap");
        expect(REPORT_VIEWS).toContain("drift-heatmap");
        expect(REPORT_VIEWS).toContain("traceability-index");
    });
});
describe("drift CLI", () => {
    it("checks docs consistency with the top-level drift command", () => {
        const dir = makeWorkspace("drift-docs");
        writeManifestProject(dir, [
            makeArtifact({ ref: "component:auth", kind: "Component", type: "service" }),
        ]);
        writeTextFile(dir, "docs/api.md", `| Event | Trigger |\n|-------|---------|\n| dossier.success | Verification passed |\n`);
        writeTextFile(dir, "docs/guide.md", `| Event | Trigger |\n|-------|---------|\n| dossier.success | Identity verified |\n`);
        const result = runCli(["drift", "--domain", "docs", "--json"], dir);
        expect(result.exitCode).toBe(1);
        const payload = JSON.parse(result.stdout) as {
            consistency: {
                passed: boolean;
                findings: Array<{
                    message: string;
                }>;
            };
        };
        expect(payload.consistency.passed).toBe(false);
        expect(payload.consistency.findings.length).toBeGreaterThanOrEqual(1);
    });
    it("generates the drift heatmap report view from current manifest entities", () => {
        const dir = makeWorkspace("drift-report-view");
        writeManifestProject(dir, [
            makeArtifact({ ref: "component:auth", kind: "Component", type: "service" }),
        ]);
        const result = runCli(["report", "--view", "drift-heatmap", "--format", "json"], dir);
        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(result.stdout) as {
            summary: {
                errors: number;
                warnings: number;
            };
        };
        expect(payload.summary.errors).toBeGreaterThanOrEqual(0);
        expect(payload.summary.warnings).toBeGreaterThanOrEqual(0);
    });
});
