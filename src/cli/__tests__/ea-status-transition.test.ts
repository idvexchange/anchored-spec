import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTestWorkspace,
  cliOutput,
  createTestWorkspace,
  makeArtifact,
  readTextFile,
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

describe("status and transition", () => {
  it("summarizes entity-first projects in status JSON", () => {
    const dir = makeWorkspace("status-json");
    writeManifestProject(dir, [
      makeArtifact({
        id: "APP-payments",
        kind: "application",
        status: "active",
        relations: [{ type: "uses", target: "SVC-auth" }],
        anchors: { symbols: ["PaymentsController"] },
      }),
      makeArtifact({
        id: "SVC-auth",
        kind: "service",
        status: "draft",
        confidence: "inferred",
      }),
    ]);

    const result = runCli(["status", "--json"], dir);
    expect(result.exitCode).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      total: number;
      byDomain: Record<string, number>;
      byKind: Record<string, number>;
      byStatus: Record<string, number>;
      byConfidence: Record<string, number>;
      relationCount: number;
      anchoredCount: number;
    };
    expect(payload.total).toBe(2);
    expect(payload.byDomain.systems).toBe(2);
    expect(payload.byKind.application).toBe(1);
    expect(payload.byKind.service).toBe(1);
    expect(payload.byStatus.active).toBe(1);
    expect(payload.byStatus.draft).toBe(1);
    expect(payload.byConfidence.inferred).toBe(1);
    expect(payload.relationCount).toBe(3);
    expect(payload.anchoredCount).toBe(1);
  });

  it("advances a manifest-backed entity to its next lifecycle status", () => {
    const dir = makeWorkspace("transition-success");
    writeManifestProject(dir, [
      makeArtifact({ id: "APP-draft", kind: "application", status: "draft" }),
    ]);

    const result = runCli(["transition", "component:draft", "--force"], dir);
    expect(result.exitCode).toBe(0);
    expect(cliOutput(result)).toContain("planned");
    expect(readTextFile(dir, "catalog-info.yaml")).toContain("lifecycle: development");
    expect(readTextFile(dir, "catalog-info.yaml")).not.toContain("status: planned");
  });

  it("suggests similar ids when a target entity is missing", () => {
    const dir = makeWorkspace("transition-missing");
    writeManifestProject(dir, [
      makeArtifact({ id: "SVC-auth", kind: "service" }),
    ]);

    const result = runCli(["transition", "missing-auth"], dir);
    expect(result.exitCode).not.toBe(0);
    expect(cliOutput(result)).toContain('Entity "missing-auth" not found');
    expect(cliOutput(result)).toContain("Did you mean: component:auth");
  });
});
