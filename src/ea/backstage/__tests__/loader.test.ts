import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadManifestFile,
  loadCatalogDirectory,
  loadInlineEntities,
  loadBackstageEntities,
} from "../loader.js";
import { writeBackstageManifest, writeBackstageYaml } from "../writer.js";
import type { BackstageEntity } from "../types.js";
import { resolveConfigV1 } from "../../config.js";

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const componentEntity: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "Component",
  metadata: {
    name: "my-service",
    description: "A test service",
    annotations: {
      "anchored-spec.dev/confidence": "0.9",
    },
  },
  spec: {
    type: "service",
    lifecycle: "production",
    owner: "team-platform",
  },
};

const apiEntity: BackstageEntity = {
  apiVersion: "backstage.io/v1alpha1",
  kind: "API",
  metadata: {
    name: "users-api",
    description: "User management API",
  },
  spec: {
    type: "openapi",
    lifecycle: "production",
    owner: "team-platform",
    definition: "openapi: 3.1.0",
  },
};

const requirementEntity: BackstageEntity = {
  apiVersion: "anchored-spec.dev/v1alpha1",
  kind: "Requirement",
  metadata: {
    name: "req-auth-mfa",
    title: "Multi-Factor Authentication",
  },
  spec: {
    status: "approved",
    owner: "security-team",
  },
};

// ─── Test Setup ─────────────────────────────────────────────────────────────────

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `anchored-spec-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

// ─── loadManifestFile ───────────────────────────────────────────────────────────

describe("loadManifestFile", () => {
  it("loads entities from a multi-doc manifest", async () => {
    const manifest = writeBackstageManifest([componentEntity, apiEntity]);
    const manifestPath = join(testDir, "catalog-info.yaml");
    writeFileSync(manifestPath, manifest);

    const result = await loadManifestFile(manifestPath, testDir);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].kind).toBe("Component");
    expect(result.entities[1].kind).toBe("API");
  });

  it("returns error for missing manifest file", async () => {
    const result = await loadManifestFile(
      join(testDir, "nonexistent.yaml"),
      testDir,
    );

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rule).toBe("ea:backstage:manifest-not-found");
  });

  it("includes both valid entities and errors for mixed content", async () => {
    const content = `---\n${writeBackstageYaml(componentEntity)}---\ninvalid: true\nno_kind: yes\n---\n${writeBackstageYaml(apiEntity)}`;
    writeFileSync(join(testDir, "mixed.yaml"), content);

    const result = await loadManifestFile(join(testDir, "mixed.yaml"), testDir);

    expect(result.entities).toHaveLength(2);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("populates detail records with runtime and authored entities", async () => {
    const manifest = writeBackstageManifest([componentEntity]);
    writeFileSync(join(testDir, "catalog.yaml"), manifest);

    const result = await loadManifestFile(join(testDir, "catalog.yaml"), testDir);

    expect(result.details).toHaveLength(1);
    expect(result.details[0].entity).toBeDefined();
    expect(result.details[0].authoredEntity).toBeDefined();
    expect(result.details[0].relativePath).toBe("catalog.yaml");
  });

  it("infers domain from kind", async () => {
    const manifest = writeBackstageManifest([requirementEntity]);
    writeFileSync(join(testDir, "catalog.yaml"), manifest);

    const result = await loadManifestFile(join(testDir, "catalog.yaml"), testDir);

    expect(result.details[0].domain).toBeDefined();
  });

  it("resolves local $text substitutions while preserving authored entity shape", async () => {
    mkdirSync(join(testDir, "specs"));
    writeFileSync(
      join(testDir, "specs", "openapi.yaml"),
      'openapi: "3.1.0"\ninfo:\n  title: Users API\n',
    );

    const manifestPath = join(testDir, "catalog.yaml");
    writeFileSync(
      manifestPath,
      writeBackstageManifest([{
        ...apiEntity,
        spec: {
          ...apiEntity.spec,
          definition: { $text: "./specs/openapi.yaml" },
        },
      }]),
    );

    const result = await loadManifestFile(manifestPath, testDir);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
    expect(result.details[0].authoredEntity?.spec.definition).toEqual({
      $text: "./specs/openapi.yaml",
    });
    expect(result.details[0].entity?.spec.definition).toContain('openapi: "3.1.0"');
  });

  it("resolves local $json and $yaml substitutions", async () => {
    writeFileSync(join(testDir, "tags.json"), '["typescript","platform"]');
    writeFileSync(join(testDir, "deps.yaml"), "- resource:default/users-db\n");

    const manifestPath = join(testDir, "catalog.yaml");
    writeFileSync(
      manifestPath,
      writeBackstageManifest([{
        ...componentEntity,
        metadata: {
          ...componentEntity.metadata,
          tags: { $json: "./tags.json" } as unknown as string[],
        },
        spec: {
          ...componentEntity.spec,
          dependsOn: { $yaml: "./deps.yaml" } as unknown as string[],
        },
      }]),
    );

    const result = await loadManifestFile(manifestPath, testDir);

    expect(result.errors).toHaveLength(0);
    expect(result.details[0].entity?.metadata.tags).toEqual([
      "typescript",
      "platform",
    ]);
    expect(result.details[0].entity?.spec.dependsOn).toEqual([
      "resource:default/users-db",
    ]);
  });

  it("reports remote substitutions as errors", async () => {
    const manifestPath = join(testDir, "catalog.yaml");
    writeFileSync(
      manifestPath,
      writeBackstageManifest([{
        ...apiEntity,
        spec: {
          ...apiEntity.spec,
          definition: { $text: "https://example.com/openapi.yaml" },
        },
      }]),
    );

    const result = await loadManifestFile(manifestPath, testDir);

    expect(result.entities).toHaveLength(1);
    expect(result.errors.some((error) => error.rule === "ea:backstage:substitution-error")).toBe(true);
  });

  it("reports missing substitution files as errors", async () => {
    const manifestPath = join(testDir, "catalog.yaml");
    writeFileSync(
      manifestPath,
      writeBackstageManifest([{
        ...apiEntity,
        spec: {
          ...apiEntity.spec,
          definition: { $text: "./missing-openapi.yaml" },
        },
      }]),
    );

    const result = await loadManifestFile(manifestPath, testDir);

    expect(result.entities).toHaveLength(1);
    expect(result.errors.some((error) => error.rule === "ea:backstage:substitution-error")).toBe(true);
  });
});

// ─── loadCatalogDirectory ───────────────────────────────────────────────────────

describe("loadCatalogDirectory", () => {
  it("loads entities from individual YAML files", async () => {
    const catalogDir = join(testDir, "catalog");
    mkdirSync(catalogDir);

    writeFileSync(
      join(catalogDir, "my-service.yaml"),
      writeBackstageYaml(componentEntity),
    );
    writeFileSync(
      join(catalogDir, "users-api.yaml"),
      writeBackstageYaml(apiEntity),
    );

    const result = await loadCatalogDirectory(catalogDir, testDir);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(2);
  });

  it("recursively loads from subdirectories", async () => {
    const subDir = join(testDir, "catalog", "apis");
    mkdirSync(subDir, { recursive: true });

    writeFileSync(
      join(subDir, "users-api.yaml"),
      writeBackstageYaml(apiEntity),
    );

    const result = await loadCatalogDirectory(join(testDir, "catalog"), testDir);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].kind).toBe("API");
  });

  it("returns empty result for non-existent directory", async () => {
    const result = await loadCatalogDirectory(
      join(testDir, "nonexistent"),
      testDir,
    );

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("ignores non-YAML files", async () => {
    const catalogDir = join(testDir, "catalog");
    mkdirSync(catalogDir);

    writeFileSync(join(catalogDir, "README.md"), "# Catalog");
    writeFileSync(
      join(catalogDir, "my-service.yaml"),
      writeBackstageYaml(componentEntity),
    );

    const result = await loadCatalogDirectory(catalogDir, testDir);

    expect(result.entities).toHaveLength(1);
  });
});

// ─── loadInlineEntities ─────────────────────────────────────────────────────────

describe("loadInlineEntities", () => {
  it("loads entity from markdown frontmatter", async () => {
    const docsDir = join(testDir, "docs");
    mkdirSync(docsDir);

    const md = `---\n${writeBackstageYaml(componentEntity)}---\n\n# My Service\n\nDocumentation.\n`;
    writeFileSync(join(docsDir, "my-service.md"), md);

    const result = await loadInlineEntities(["docs"], testDir);

    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].kind).toBe("Component");
  });

  it("skips markdown files without apiVersion in frontmatter", async () => {
    const docsDir = join(testDir, "docs");
    mkdirSync(docsDir);

    writeFileSync(
      join(docsDir, "readme.md"),
      "---\ntitle: Hello\n---\n\n# Hello\n",
    );

    const result = await loadInlineEntities(["docs"], testDir);

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("loads from multiple doc directories", async () => {
    mkdirSync(join(testDir, "docs"));
    mkdirSync(join(testDir, "specs"));

    const md1 = `---\n${writeBackstageYaml(componentEntity)}---\n\n# Svc\n`;
    const md2 = `---\n${writeBackstageYaml(apiEntity)}---\n\n# API\n`;
    writeFileSync(join(testDir, "docs", "svc.md"), md1);
    writeFileSync(join(testDir, "specs", "api.md"), md2);

    const result = await loadInlineEntities(["docs", "specs"], testDir);

    expect(result.entities).toHaveLength(2);
  });

  it("handles non-existent doc directories gracefully", async () => {
    const result = await loadInlineEntities(["nonexistent"], testDir);

    expect(result.entities).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── loadBackstageEntities ──────────────────────────────────────────────────────

describe("loadBackstageEntities", () => {
  it("rejects unsupported entity modes", async () => {
    const config = {
      ...resolveConfigV1({}),
      entityMode: "invalid-mode",
    } as unknown as Parameters<typeof loadBackstageEntities>[0];

    await expect(loadBackstageEntities(config, testDir)).rejects.toThrow(
      "Unsupported entity mode: invalid-mode",
    );
  });

  it("loads from manifest mode", async () => {
    const manifest = writeBackstageManifest([componentEntity]);
    writeFileSync(join(testDir, "catalog-info.yaml"), manifest);

    const config = resolveConfigV1({ entityMode: "manifest" });

    const result = await loadBackstageEntities(config, testDir);
    expect(result.entities).toHaveLength(1);
  });

  it("loads from inline mode", async () => {
    mkdirSync(join(testDir, "docs"));
    const md = `---\n${writeBackstageYaml(componentEntity)}---\n\n# Docs\n`;
    writeFileSync(join(testDir, "docs", "svc.md"), md);

    const config = resolveConfigV1({
      entityMode: "inline",
      inlineDocDirs: ["docs"],
    });

    const result = await loadBackstageEntities(config, testDir);
    expect(result.entities).toHaveLength(1);
  });

  it("loads manifest + catalog directory together", async () => {
    // Create manifest with one entity
    const manifest = writeBackstageManifest([componentEntity]);
    writeFileSync(join(testDir, "catalog-info.yaml"), manifest);

    // Create catalog dir with another entity
    const catalogDir = join(testDir, "catalog");
    mkdirSync(catalogDir);
    writeFileSync(
      join(catalogDir, "api.yaml"),
      writeBackstageYaml(apiEntity),
    );

    const config = resolveConfigV1({
      entityMode: "manifest",
      catalogDir: "catalog",
    });

    const result = await loadBackstageEntities(config, testDir);
    expect(result.entities).toHaveLength(2);
  });
});
