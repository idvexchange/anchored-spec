import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  writeToManifest,
  removeFromManifest,
  writeToCatalogDir,
  removeFromCatalogDir,
  writeToFrontmatter,
  writeEntity,
  deleteEntity,
} from "../entity-writer.js";
import { parseBackstageYaml } from "../parser.js";
import type { BackstageEntity } from "../types.js";
import { resolveConfigV1 } from "../../config.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const svcEntity: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: { name: "my-service", description: "A test service" },
  spec: { type: "service", lifecycle: "production", owner: "team-a" },
};

const apiEntity: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "API",
  metadata: { name: "users-api", description: "User API" },
  spec: { type: "openapi", lifecycle: "production", owner: "team-a", definition: "openapi: 3.1.0" },
};

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `as-writer-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
});

// ─── Manifest Mode ──────────────────────────────────────────────────────────────

describe("writeToManifest", () => {
  it("creates a new manifest with one entity", async () => {
    const path = join(testDir, "catalog-info.yaml");
    const result = await writeToManifest(svcEntity, path);

    expect(result.created).toBe(true);
    expect(result.entityCount).toBe(1);
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, "utf-8");
    const parsed = parseBackstageYaml(content);
    expect(parsed.entities).toHaveLength(1);
    expect(parsed.entities[0].entity.metadata.name).toBe("my-service");
  });

  it("appends entity to existing manifest", async () => {
    const path = join(testDir, "catalog-info.yaml");
    await writeToManifest(svcEntity, path);
    const result = await writeToManifest(apiEntity, path);

    expect(result.created).toBe(false);
    expect(result.entityCount).toBe(2);

    const content = readFileSync(path, "utf-8");
    const parsed = parseBackstageYaml(content);
    expect(parsed.entities).toHaveLength(2);
  });

  it("replaces entity with same kind+name", async () => {
    const path = join(testDir, "catalog-info.yaml");
    await writeToManifest(svcEntity, path);

    const updated = {
      ...svcEntity,
      metadata: { ...svcEntity.metadata, description: "Updated" },
    };
    const result = await writeToManifest(updated, path);

    expect(result.entityCount).toBe(1);

    const content = readFileSync(path, "utf-8");
    const parsed = parseBackstageYaml(content);
    expect(parsed.entities[0].entity.metadata.description).toBe("Updated");
  });

  it("creates parent directories", async () => {
    const path = join(testDir, "deep", "nested", "catalog.yaml");
    await writeToManifest(svcEntity, path);
    expect(existsSync(path)).toBe(true);
  });
});

describe("removeFromManifest", () => {
  it("removes an entity from manifest", async () => {
    const path = join(testDir, "catalog-info.yaml");
    await writeToManifest(svcEntity, path);
    await writeToManifest(apiEntity, path);

    const result = await removeFromManifest("Component", "my-service", path);

    expect(result.fileDeleted).toBe(false);

    const content = readFileSync(path, "utf-8");
    const parsed = parseBackstageYaml(content);
    expect(parsed.entities).toHaveLength(1);
    expect(parsed.entities[0].entity.metadata.name).toBe("users-api");
  });

  it("deletes file when last entity removed", async () => {
    const path = join(testDir, "catalog-info.yaml");
    await writeToManifest(svcEntity, path);

    const result = await removeFromManifest("Component", "my-service", path);

    expect(result.fileDeleted).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  it("throws for non-existent entity", async () => {
    const path = join(testDir, "catalog-info.yaml");
    await writeToManifest(svcEntity, path);

    await expect(
      removeFromManifest("Component", "nonexistent", path),
    ).rejects.toThrow("Entity not found");
  });
});

// ─── Catalog Directory Mode ─────────────────────────────────────────────────────

describe("writeToCatalogDir", () => {
  it("writes entity to named file", async () => {
    const result = await writeToCatalogDir(svcEntity, testDir);

    expect(result.created).toBe(true);
    expect(result.filePath).toContain("my-service.yaml");

    const content = readFileSync(result.filePath, "utf-8");
    expect(content).toContain("kind: Component");
  });

  it("overwrites existing file", async () => {
    await writeToCatalogDir(svcEntity, testDir);
    const updated = {
      ...svcEntity,
      metadata: { ...svcEntity.metadata, description: "Updated" },
    };
    const result = await writeToCatalogDir(updated, testDir);

    expect(result.created).toBe(false);
    const content = readFileSync(result.filePath, "utf-8");
    expect(content).toContain("Updated");
  });
});

describe("removeFromCatalogDir", () => {
  it("deletes entity file", async () => {
    await writeToCatalogDir(svcEntity, testDir);
    const result = await removeFromCatalogDir("my-service", testDir);

    expect(result.fileDeleted).toBe(true);
    expect(existsSync(result.filePath)).toBe(false);
  });

  it("throws for non-existent file", async () => {
    await expect(
      removeFromCatalogDir("nonexistent", testDir),
    ).rejects.toThrow("Entity file not found");
  });
});

// ─── Inline Frontmatter Mode ────────────────────────────────────────────────────

describe("writeToFrontmatter", () => {
  it("creates new markdown file with frontmatter", async () => {
    const path = join(testDir, "my-service.md");
    const result = await writeToFrontmatter(
      svcEntity,
      path,
      "\n# My Service\n\nDocs here.\n",
    );

    expect(result.created).toBe(true);

    const content = readFileSync(path, "utf-8");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toContain("kind: Component");
    expect(content).toContain("# My Service");
  });

  it("preserves existing markdown body when updating", async () => {
    const path = join(testDir, "my-service.md");
    writeFileSync(
      path,
      `---\napiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: my-service\nspec:\n  type: service\n---\n\n# Important Docs\n\nDo not lose this.\n`,
    );

    const updated = {
      ...svcEntity,
      metadata: { ...svcEntity.metadata, description: "Updated desc" },
    };
    const result = await writeToFrontmatter(updated, path);

    expect(result.created).toBe(false);

    const content = readFileSync(path, "utf-8");
    expect(content).toContain("Updated desc");
    expect(content).toContain("# Important Docs");
    expect(content).toContain("Do not lose this.");
  });
});

// ─── Unified write/delete ───────────────────────────────────────────────────────

describe("writeEntity", () => {
  const baseConfig = resolveConfigV1({});

  it("writes to manifest in manifest mode", async () => {
    const config = { ...baseConfig, entityMode: "manifest" as const };
    const result = await writeEntity(svcEntity, config, testDir);

    expect(result.filePath).toContain("catalog-info.yaml");
    expect(existsSync(result.filePath)).toBe(true);
  });

  it("writes to docs in inline mode", async () => {
    const config = { ...baseConfig, entityMode: "inline" as const };
    const result = await writeEntity(svcEntity, config, testDir);

    expect(result.filePath).toContain("my-service.md");
    expect(existsSync(result.filePath)).toBe(true);

    const content = readFileSync(result.filePath, "utf-8");
    expect(content).toContain("---");
    expect(content).toContain("kind: Component");
  });

});

describe("deleteEntity", () => {
  const baseConfig = resolveConfigV1({});

  it("removes from manifest in manifest mode", async () => {
    const config = { ...baseConfig, entityMode: "manifest" as const };
    const manifestPath = join(testDir, "catalog-info.yaml");
    await writeToManifest(svcEntity, manifestPath);
    await writeToManifest(apiEntity, manifestPath);

    const result = await deleteEntity("Component", "my-service", config, testDir);

    expect(result.fileDeleted).toBe(false);
  });

  it("deletes md file in inline mode", async () => {
    const config = { ...baseConfig, entityMode: "inline" as const };
    mkdirSync(join(testDir, "docs"));
    writeFileSync(join(testDir, "docs", "my-service.md"), "---\nkind: Component\n---\n");

    const result = await deleteEntity("Component", "my-service", config, testDir);

    expect(result.fileDeleted).toBe(true);
  });
});
