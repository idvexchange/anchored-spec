import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { createEaEvidenceRecord, loadEaEvidence, mergeEaEvidence, summarizeEaEvidence, validateEaEvidence, writeEaEvidence, } from "../evidence.js";
import { cleanupTestWorkspace, createTestWorkspace, makeArtifact, readJsonFile, runCli, writeManifestProject, } from "../../test-helpers/workspace.js";
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
describe("evidence helpers", () => {
    it("creates, merges, writes, and reloads EA evidence records", () => {
        const dir = makeWorkspace("evidence-io");
        const outputPath = join(dir, "docs", "evidence", "ea-evidence.json");
        const initial = createEaEvidenceRecord("component:auth", "test", "passed", "ci/test");
        const replacement = createEaEvidenceRecord("component:auth", "test", "failed", "ci/test", {
            summary: "Regression suite failed"
        });
        const merged = mergeEaEvidence(null, [initial]);
        const updated = mergeEaEvidence(merged, [replacement]);
        writeEaEvidence(updated, outputPath);
        const loaded = loadEaEvidence(outputPath);
        expect(loaded?.records).toHaveLength(1);
        expect(loaded?.records[0]?.status).toBe("failed");
        expect(loaded?.records[0]?.summary).toBe("Regression suite failed");
    });
    it("validates freshness, failed statuses, and evidence coverage", () => {
        const artifact = makeEntity({
            ref: "component:auth",
            kind: "Component",
            type: "service",
            producesEvidence: ["test"]
        });
        const staleRecord = {
            entityRef: "component:auth",
            kind: "test",
            status: "failed",
            recordedAt: "2020-01-01T00:00:00.000Z",
            source: "ci"
        };
        const coverageGapArtifact = makeEntity({
            ref: "component:payments",
            kind: "Component",
            type: "website",
            producesEvidence: ["deployment"]
        });
        const evidence = {
            generatedAt: new Date().toISOString(),
            records: [staleRecord]
        };
        const issues = validateEaEvidence(evidence, [artifact, coverageGapArtifact], {
            freshnessWindowDays: 30
        });
        expect(issues.some((issue) => issue.rule === "ea:evidence/freshness")).toBe(true);
        expect(issues.some((issue) => issue.rule === "ea:evidence/status")).toBe(true);
        expect(issues.some((issue) => issue.rule === "ea:evidence/coverage")).toBe(true);
        const summary = summarizeEaEvidence(evidence, [artifact, coverageGapArtifact], {
            freshnessWindowDays: 30
        });
        expect(summary.totalRecords).toBe(1);
        expect(summary.byStatus.failed).toBe(1);
        expect(summary.staleCount).toBe(1);
        expect(summary.uncoveredEntities).toBe(1);
    });
});
describe("evidence CLI", () => {
    it("ingests evidence and summarizes it against a manifest project", () => {
        const dir = makeWorkspace("evidence-cli");
        writeManifestProject(dir, [
            makeArtifact({ ref: "component:auth", kind: "Component", type: "service" }),
        ]);
        const ingest = runCli([
            "evidence",
            "ingest",
            "--entity",
            "component:auth",
            "--kind",
            "test",
            "--status",
            "passed",
            "--source",
            "ci",
            "--summary",
            "Smoke tests passed",
        ], dir);
        expect(ingest.exitCode).toBe(0);
        const summary = runCli(["evidence", "summary", "--format", "json"], dir);
        expect(summary.exitCode).toBe(0);
        const payload = JSON.parse(summary.stdout) as {
            totalRecords: number;
            byStatus: Record<string, number>;
        };
        expect(payload.totalRecords).toBe(1);
        expect(payload.byStatus.passed).toBe(1);
    });
    it("fails validation when evidence contains current error records", () => {
        const dir = makeWorkspace("evidence-cli-validate");
        writeManifestProject(dir, [
            makeArtifact({ ref: "component:auth", kind: "Component", type: "service" }),
        ]);
        const evidencePath = join(dir, "docs", "evidence", "ea-evidence.json");
        writeEaEvidence({
            generatedAt: new Date().toISOString(),
            records: [
                {
                    entityRef: "component:auth",
                    kind: "test",
                    status: "failed",
                    recordedAt: new Date().toISOString(),
                    source: "ci"
                }
            ]
        }, evidencePath);
        const result = runCli(["evidence", "validate"], dir);
        expect(result.exitCode).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain('status "failed"');
        expect(readJsonFile<{
            records: Array<{
                entityRef: string;
            }>;
        }>(dir, "docs/evidence/ea-evidence.json").records[0]?.entityRef).toBe("component:auth");
    });
});
