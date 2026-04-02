import { afterEach, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { REPORT_VIEWS, buildExceptionReport, buildReportIndex, renderExceptionReportMarkdown, } from "../report.js";
import { cleanupTestWorkspace, createTestWorkspace, makeArtifact, readJsonFile, runCli, writeManifestProject } from "../../test-helpers/workspace.js";
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
function makeException(ref: string, expiresAt: string) {
    return makeArtifact({
        ref,
        kind: "Exception",
        status: "active",
        reason: "Approved exception",
        approvedBy: "chief-architect",
        approvedAt: "2025-01-01",
        expiresAt,
        reviewSchedule: "monthly",
        scope: { artifactIds: ["component:auth"], rules: ["ea:systems/example"] }
    });
}
describe("exception reporting", () => {
    it("classifies active, expiring, and expired exceptions", () => {
        const entities = [
            makeException("exception:active", "2099-01-01"),
            makeException("exception:soon", new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()),
            makeException("exception:expired", "2020-01-01"),
        ];
        const report = buildExceptionReport(entities, {
            expiringThresholdDays: 30
        });
        expect(report.summary.total).toBe(3);
        expect(report.summary.active).toBe(1);
        expect(report.summary.expiringSoon).toBe(1);
        expect(report.summary.expired).toBe(1);
        expect(renderExceptionReportMarkdown(report)).toContain("# Exception Report");
    });
    it("builds a current report index without legacy report aliases", () => {
        const entities = [
            makeArtifact({ ref: "component:auth", kind: "Component", type: "service" }),
            makeException("exception:active", "2099-01-01"),
        ];
        const index = buildReportIndex(entities);
        const names = index.reports.map((entry) => entry.name);
        expect(index.summary.totalArtifacts).toBe(2);
        expect(names).toContain("exceptions");
        expect(names).toContain("drift-heatmap");
        expect(names).toContain("traceability-index");
        expect(REPORT_VIEWS).toHaveLength(7);
    });
});
describe("report CLI", () => {
    it("renders the exceptions view as JSON", () => {
        const dir = makeWorkspace("exceptions-cli");
        writeManifestProject(dir, [makeException("exception:active", "2099-01-01")]);
        const result = runCli(["report", "--view", "exceptions", "--format", "json"], dir);
        expect(result.exitCode).toBe(0);
        const payload = JSON.parse(result.stdout) as {
            summary: {
                total: number;
            };
        };
        expect(payload.summary.total).toBe(1);
    });
    it("writes the current --all report set plus the report index", () => {
        const dir = makeWorkspace("exceptions-all");
        writeManifestProject(dir, [
            makeArtifact({ ref: "component:auth", kind: "Component", type: "service" }),
            makeException("exception:active", "2099-01-01"),
        ]);
        const result = runCli(["report", "--all", "--format", "json", "--output-dir", "reports"], dir);
        expect(result.exitCode).toBe(0);
        const reportDir = join(dir, "reports");
        const files = readdirSync(reportDir).sort();
        expect(files).toEqual([
            "capability-map.json",
            "classification-coverage.json",
            "drift-heatmap.json",
            "exception-report.json",
            "report-index.json",
            "system-data-matrix.json",
            "traceability-index.json",
        ]);
        const index = readJsonFile<{
            reports: Array<{
                name: string;
            }>;
        }>(dir, "reports/report-index.json");
        expect(index.reports).toHaveLength(6);
    });
});
