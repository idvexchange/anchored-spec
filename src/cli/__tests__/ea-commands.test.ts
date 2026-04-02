import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTestWorkspace, cliOutput, createTestWorkspace, makeEntity, readJsonFile, readTextFile, runCli, writeManifestProject, } from "../../test-helpers/workspace.js";
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
describe("CLI v2 commands", () => {
    it("shows top-level entity-native commands and omits removed alias groups", () => {
        const result = runCli(["--help"], process.cwd());
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("init");
        expect(result.stdout).toContain("create");
        expect(result.stdout).toContain("status");
        expect(result.stdout).toContain("transition");
        expect(result.stdout).not.toMatch(/\nea\s+/);
        expect(result.stdout).not.toContain("move");
        expect(result.stdout).not.toContain("enrich");
        expect(result.stdout).not.toContain("create-batch");
    });
    it("initializes the default manifest-mode project scaffold", () => {
        const dir = makeWorkspace("cli-init-manifest");
        const result = runCli(["init", "--force"], dir);
        expect(result.exitCode).toBe(0);
        expect(existsSync(join(dir, ".anchored-spec", "config.json"))).toBe(true);
        expect(existsSync(join(dir, "catalog-info.yaml"))).toBe(true);
        expect(existsSync(join(dir, "docs", "generated"))).toBe(true);
        expect(existsSync(join(dir, "docs", "schemas", "config-v1.schema.json"))).toBe(true);
        const config = readJsonFile<{
            entityMode: string;
        }>(dir, ".anchored-spec/config.json");
        expect(config.entityMode).toBe("manifest");
    });
    it("supports inline-mode initialization for entity frontmatter projects", () => {
        const dir = makeWorkspace("cli-init-inline");
        const result = runCli(["init", "--mode", "inline", "--force"], dir);
        expect(result.exitCode).toBe(0);
        expect(existsSync(join(dir, "docs"))).toBe(true);
        const config = readJsonFile<{
            entityMode: string;
            inlineDocDirs: string[];
        }>(dir, ".anchored-spec/config.json");
        expect(config.entityMode).toBe("inline");
        expect(config.inlineDocDirs).toContain("docs");
    });
    it("creates a Backstage entity and exposes it through top-level status", () => {
        const dir = makeWorkspace("cli-create");
        expect(runCli(["init", "--force"], dir).exitCode).toBe(0);
        const createResult = runCli([
            "create",
            "--kind",
            "Component",
            "--type",
            "website",
            "--title",
            "Payments App",
            "--owner",
            "group:default/platform",
        ], dir);
        expect(createResult.exitCode).toBe(0);
        const manifest = readTextFile(dir, "catalog-info.yaml");
        expect(manifest).toContain("kind: Component");
        expect(manifest).toContain("name: payments-app");
        expect(manifest).toContain("lifecycle: experimental");
        const statusResult = runCli(["status", "--json"], dir);
        expect(statusResult.exitCode).toBe(0);
        const status = JSON.parse(statusResult.stdout) as {
            total: number;
            byKind: Record<string, number>;
            bySchema: Record<string, number>;
            byStatus: Record<string, number>;
        };
        expect(status.total).toBe(1);
        expect(status.byKind.Component).toBe(1);
        expect(status.bySchema.application).toBe(1);
        expect(status.byStatus.draft).toBe(1);
        expect(cliOutput(createResult)).toContain("Created");
    });
    it("treats removal of an active entity as breaking in diff --compat", () => {
        const dir = makeWorkspace("cli-diff-compat");
        writeManifestProject(dir, [
            makeEntity({ ref: "component:auth", kind: "Component", type: "service", status: "active" }),
        ]);
        expect(spawnSync("git", ["init"], { cwd: dir, encoding: "utf-8" }).status).toBe(0);
        expect(spawnSync("git", ["config", "user.name", "Test User"], { cwd: dir, encoding: "utf-8" }).status).toBe(0);
        expect(spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, encoding: "utf-8" }).status).toBe(0);
        expect(spawnSync("git", ["add", "."], { cwd: dir, encoding: "utf-8" }).status).toBe(0);
        expect(spawnSync("git", ["commit", "-m", "base"], { cwd: dir, encoding: "utf-8" }).status).toBe(0);
        writeManifestProject(dir, []);
        const diffResult = runCli(["diff", "HEAD", "--compat", "--json"], dir);
        expect(diffResult.exitCode).toBe(0);
        const compat = JSON.parse(diffResult.stdout) as {
            overallLevel: string;
            assessments: Array<{
                entityRef: string;
                level: string;
                reasons: Array<{
                    rule: string;
                }>;
            }>;
        };
        expect(compat.overallLevel).toBe("breaking");
        expect(compat.assessments).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entityRef: "component:default/auth",
                level: "breaking",
                reasons: expect.arrayContaining([
                    expect.objectContaining({ rule: "compat:entity-removed" }),
                ])
            }),
        ]));
    });
});
