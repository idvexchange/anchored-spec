import { afterEach, describe, expect, it } from "vitest";

import { reconcileEaProject, renderReconcileOutput } from "../reconcile.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  writeTextFile,
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

describe("reconcileEaProject", () => {
  it("can validate a manifest project while skipping legacy generation expectations", async () => {
    const dir = makeWorkspace("reconcile-validate");
    writeManifestProject(dir, [
      makeArtifact({ id: "SVC-auth", kind: "service" }),
    ]);

    const report = await reconcileEaProject({
      projectRoot: dir,
      skipGenerate: true,
      skipDrift: true,
    });
    expect(report.passed).toBe(true);
    expect(report.steps.map((step) => step.step)).toEqual(["validate"]);
    expect(renderReconcileOutput(report)).toContain("Validate");
  });

  it("stops early when failFast is enabled and validation fails", async () => {
    const dir = makeWorkspace("reconcile-failfast");
    writeManifestProject(dir, [
      makeArtifact({
        id: "SVC-auth",
        kind: "service",
        owners: [],
        summary: "short",
      }),
    ]);

    const report = await reconcileEaProject({
      projectRoot: dir,
      skipGenerate: true,
      failFast: true,
    });
    expect(report.passed).toBe(false);
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]?.step).toBe("validate");
    expect(report.steps[0]?.errors).toBeGreaterThanOrEqual(1);
  });

  it("includes the trace step for entity traceRefs and can skip it explicitly", async () => {
    const dir = makeWorkspace("reconcile-trace");
    writeManifestProject(dir, [
      makeArtifact({
        id: "SVC-auth",
        kind: "service",
        traceRefs: [{ path: "docs/missing.md", role: "context" }],
      }),
    ]);

    const withTrace = await reconcileEaProject({
      projectRoot: dir,
      skipGenerate: true,
      skipDrift: true,
      includeTrace: true,
    });
    expect(withTrace.steps.map((step) => step.step)).toEqual([
      "validate",
      "trace",
    ]);
    expect(withTrace.traceReport?.brokenTraceRefs[0]?.path).toBe(
      "docs/missing.md",
    );
    expect(renderReconcileOutput(withTrace)).toContain(
      'traceRef "docs/missing.md"',
    );

    const skippedTrace = await reconcileEaProject({
      projectRoot: dir,
      skipGenerate: true,
      skipDrift: true,
      includeTrace: true,
      skipTrace: true,
    });
    expect(skippedTrace.steps.map((step) => step.step)).toEqual(["validate"]);
  });

  it("fails validation when entity loading reports parse errors", async () => {
    const dir = makeWorkspace("reconcile-load-errors");
    writeTextFile(
      dir,
      ".anchored-spec/config.json",
      JSON.stringify({
        schemaVersion: "1.0",
        entityMode: "manifest",
        manifestPath: "catalog-info.yaml",
      }, null, 2) + "\n",
    );
    writeTextFile(
      dir,
      "catalog-info.yaml",
      [
        "---",
        "apiVersion: backstage.io/v1alpha1",
        "kind: Component",
        "metadata:",
        "  name: broken",
        "spec:",
        "  type: service",
        "  owner: group:default/platform",
        "  lifecycle: production",
        "    badlyIndented: true",
        "",
      ].join("\n"),
    );

    const report = await reconcileEaProject({
      projectRoot: dir,
      skipGenerate: true,
      skipDrift: true,
    });

    expect(report.passed).toBe(false);
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]?.step).toBe("validate");
    expect(report.steps[0]?.errors).toBeGreaterThan(0);
    expect(
      report.validationResult?.errors.some(
        (error) => error.rule === "ea:backstage:parse-error",
      ),
    ).toBe(true);
  });
});
