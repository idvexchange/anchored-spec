import { afterEach, describe, expect, it } from "vitest";

import { EaRoot } from "../loader.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  readJsonFile,
  writeInlineProject,
  writeManifestProject,
  writeTextFile,
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

describe("EaRoot v2 loading", () => {
  it("finds project roots via .anchored-spec config", () => {
    const dir = makeWorkspace("loader-find-config");
    writeManifestProject(dir);

    expect(EaRoot.findProjectRoot(dir)).toBe(dir);
  });

  it("finds project roots via catalog-info.yaml or catalog directories", () => {
    const manifestDir = makeWorkspace("loader-find-manifest");
    writeTextFile(manifestDir, "catalog-info.yaml", "# catalog\n");
    expect(EaRoot.findProjectRoot(manifestDir)).toBe(manifestDir);

    const catalogDir = makeWorkspace("loader-find-catalog");
    writeTextFile(
      catalogDir,
      "catalog/entities.yaml",
      "apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: auth\nspec:\n  type: service\n  owner: team\n",
    );
    expect(EaRoot.findProjectRoot(catalogDir)).toBe(catalogDir);
  });

  it("resolves stored project config and supports nested fromDirectory lookups", () => {
    const dir = makeWorkspace("loader-config");
    writeInlineProject(dir, [{ path: "docs/auth.md", body: "# Auth\n" }], {
      inlineDocDirs: ["docs", "architecture"],
    });

    const config = EaRoot.resolveProjectConfig(dir);
    expect(config.entityMode).toBe("inline");
    expect(config.inlineDocDirs).toEqual(["docs", "architecture"]);

    const nested = `${dir}/packages/service`;
    writeTextFile(dir, "packages/service/.keep", "");
    const root = EaRoot.fromDirectory(nested);
    expect(root?.projectRoot).toBe(dir);
  });

  it("loads policy and verification files from current v2 locations", () => {
    const dir = makeWorkspace("loader-policy");
    const config = writeManifestProject(dir, [
      makeArtifact({ id: "SVC-auth", kind: "service" }),
    ]);
    writeTextFile(
      dir,
      "ea/workflow-policy.yaml",
      "workflowVariants:\n  - id: default\n",
    );
    writeTextFile(
      dir,
      "ea/transitions/wave-1/verification.yaml",
      "checks:\n  - id: smoke\n",
    );

    const root = new EaRoot(dir, config);
    expect(root.loadPolicy()).toEqual({
      workflowVariants: [{ id: "default" }],
    });
    expect(root.loadVerifications()).toEqual([{ checks: [{ id: "smoke" }] }]);
  });

  it("computes quick summaries for manifest and inline projects", async () => {
    const manifestDir = makeWorkspace("loader-summary-manifest");
    const manifestConfig = writeManifestProject(manifestDir, [
      makeArtifact({ id: "SVC-auth", kind: "service" }),
    ]);
    const manifestRoot = new EaRoot(manifestDir, manifestConfig);
    await manifestRoot.loadEntities();
    expect(manifestRoot.getQuickSummary()).toMatchObject({
      initialized: true,
      totalFiles: 1,
      hasPolicy: false,
    });

    const inlineDir = makeWorkspace("loader-summary-inline");
    const inlineConfig = writeInlineProject(inlineDir, [
      {
        path: "docs/auth.md",
        entity: makeArtifact({ id: "SVC-auth", kind: "service" }),
        body: "# Auth\n",
      },
      {
        path: "docs/payments.md",
        entity: makeArtifact({ id: "APP-payments", kind: "application" }),
        body: "# Payments\n",
      },
    ]);
    const inlineRoot = new EaRoot(inlineDir, inlineConfig);
    expect(
      readJsonFile<{ entityMode: string }>(
        inlineDir,
        ".anchored-spec/config.json",
      ).entityMode,
    ).toBe("inline");
    expect(inlineRoot.getQuickSummary()).toMatchObject({
      initialized: true,
      totalFiles: 2,
    });
  });
});
