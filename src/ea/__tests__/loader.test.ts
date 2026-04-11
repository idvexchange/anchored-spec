import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { EaRoot } from "../loader.js";
import { resolveConfigV1 } from "../config.js";

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `anchored-spec-loader-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("EaRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("detects manifest-mode initialization", () => {
    writeFileSync(join(tempDir, "catalog-info.yaml"), "# catalog\n");

    const root = new EaRoot(tempDir, resolveConfigV1());
    expect(root.isInitialized()).toBe(true);
  });

  it("detects inline-mode initialization", () => {
    mkdirSync(join(tempDir, "docs"), { recursive: true });

    const root = new EaRoot(
      tempDir,
      resolveConfigV1({ entityMode: "inline", inlineDocDirs: ["docs"] }),
    );

    expect(root.isInitialized()).toBe(true);
  });

  it("loads manifest entities and preserves inferred domains", async () => {
    writeFileSync(
      join(tempDir, "catalog-info.yaml"),
      `---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: orders\nspec:\n  type: service\n  lifecycle: production\n  owner: team-a\n---\napiVersion: anchored-spec.dev/v1alpha1\nkind: Requirement\nmetadata:\n  name: audit-trail\nspec:\n  owner: team-a\n`,
    );

    const root = new EaRoot(tempDir, resolveConfigV1());
    const result = await root.loadEntities();
    const business = await root.loadEntityDomain("business");

    expect(result.entities).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(business.entities).toHaveLength(1);
    expect(business.entities[0]?.kind).toBe("Requirement");
  });

  it("loads inline entities from markdown frontmatter", async () => {
    mkdirSync(join(tempDir, "docs"), { recursive: true });
    writeFileSync(
      join(tempDir, "docs", "service.md"),
      `---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: payments\nspec:\n  type: service\n  lifecycle: experimental\n  owner: team-payments\n---\n\n# Payments\n`,
    );

    const root = new EaRoot(
      tempDir,
      resolveConfigV1({ entityMode: "inline", inlineDocDirs: ["docs"] }),
    );
    const result = await root.loadEntities();

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.metadata.name).toBe("payments");
    expect(result.errors).toHaveLength(0);
  });

  it("computes summaries from loaded entities", async () => {
    writeFileSync(
      join(tempDir, "catalog-info.yaml"),
      `---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: orders\nspec:\n  type: service\n  lifecycle: production\n  owner: team-a\n  dependsOn:\n    - resource:default/orders-db\n---\napiVersion: backstage.io/v1alpha1\nkind: Resource\nmetadata:\n  name: orders-db\nspec:\n  type: database\n  owner: team-a\n`,
    );

    const root = new EaRoot(tempDir, resolveConfigV1());
    await root.loadEntities();

    expect(root.getSummary().totalEntities).toBe(2);
    expect(root.getQuickSummary().totalFiles).toBe(1);
  });

  it("loads workflow policy and transition verifications from configured directories", () => {
    mkdirSync(join(tempDir, "docs", "transitions", "change-1"), { recursive: true });
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(
      join(tempDir, ".anchored-spec", "policy.json"),
      JSON.stringify({ workflowVariants: [{ id: "default" }] }, null, 2),
    );
    writeFileSync(
      join(tempDir, "docs", "transitions", "change-1", "verification.yaml"),
      "checks:\n  - id: smoke\n",
    );

    const root = new EaRoot(tempDir, resolveConfigV1());

    expect(root.loadPolicy()).toEqual({ workflowVariants: [{ id: "default" }] });
    expect(root.loadVerifications()).toEqual([{ checks: [{ id: "smoke" }] }]);
  });
});
