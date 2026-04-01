/**
 * Backstage Entity Writer Service
 *
 * CRUD operations for Backstage entities in supported storage modes.
 * This service handles the filesystem I/O for creating, updating, and
 * deleting entities regardless of storage mode.
 */

import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import type { BackstageEntity } from "./types.js";
import type { AnchoredSpecConfigV1 } from "../config.js";
import {
  writeBackstageYaml,
  writeBackstageManifest,
  writeBackstageFrontmatter,
} from "./writer.js";
import {
  parseBackstageYaml,
  extractMarkdownBody,
} from "./parser.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface EntityWriteResult {
  /** File path that was written. */
  filePath: string;
  /** Whether a new file was created (vs updating existing). */
  created: boolean;
  /** Number of entities in the file after the write. */
  entityCount: number;
}

export interface EntityDeleteResult {
  /** File path that was modified or deleted. */
  filePath: string;
  /** Whether the entire file was deleted (vs entity removed from manifest). */
  fileDeleted: boolean;
}

// ─── Manifest Mode ──────────────────────────────────────────────────────────────

/**
 * Add or update an entity in a multi-document manifest file.
 *
 * If an entity with the same kind+name already exists, it is replaced.
 * Otherwise, the new entity is appended.
 */
export async function writeToManifest(
  entity: BackstageEntity,
  manifestPath: string,
): Promise<EntityWriteResult> {
  const dir = dirname(manifestPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let entities: BackstageEntity[] = [];
  let created = true;

  if (existsSync(manifestPath)) {
    const content = await readFile(manifestPath, "utf-8");
    const result = parseBackstageYaml(content, manifestPath);
    entities = result.entities.map((e) => e.entity);
    created = false;
  }

  // Find existing entity by kind+name (+ namespace)
  const idx = entities.findIndex(
    (e) =>
      e.kind === entity.kind &&
      e.metadata.name === entity.metadata.name &&
      (e.metadata.namespace ?? "default") ===
        (entity.metadata.namespace ?? "default"),
  );

  if (idx >= 0) {
    entities[idx] = entity;
    created = false;
  } else {
    entities.push(entity);
  }

  const yaml = writeBackstageManifest(entities);
  await writeFile(manifestPath, yaml, "utf-8");

  return { filePath: manifestPath, created, entityCount: entities.length };
}

/**
 * Remove an entity from a multi-document manifest file.
 *
 * If the entity is the last one in the file, the file is deleted.
 */
export async function removeFromManifest(
  kind: string,
  name: string,
  manifestPath: string,
  namespace: string = "default",
): Promise<EntityDeleteResult> {
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const content = await readFile(manifestPath, "utf-8");
  const result = parseBackstageYaml(content, manifestPath);
  const entities = result.entities.map((e) => e.entity);

  const remaining = entities.filter(
    (e) =>
      !(
        e.kind === kind &&
        e.metadata.name === name &&
        (e.metadata.namespace ?? "default") === namespace
      ),
  );

  if (remaining.length === entities.length) {
    throw new Error(
      `Entity not found: ${kind}:${namespace}/${name} in ${manifestPath}`,
    );
  }

  if (remaining.length === 0) {
    await unlink(manifestPath);
    return { filePath: manifestPath, fileDeleted: true };
  }

  const yaml = writeBackstageManifest(remaining);
  await writeFile(manifestPath, yaml, "utf-8");
  return { filePath: manifestPath, fileDeleted: false };
}

// ─── Catalog Directory Mode ─────────────────────────────────────────────────────

/**
 * Write a single entity to its own YAML file in a catalog directory.
 */
export async function writeToCatalogDir(
  entity: BackstageEntity,
  catalogDir: string,
): Promise<EntityWriteResult> {
  if (!existsSync(catalogDir)) mkdirSync(catalogDir, { recursive: true });

  const fileName = `${entity.metadata.name}.yaml`;
  const filePath = join(catalogDir, fileName);
  const created = !existsSync(filePath);

  const yaml = writeBackstageYaml(entity);
  await writeFile(filePath, yaml, "utf-8");

  return { filePath, created, entityCount: 1 };
}

/**
 * Remove an entity's YAML file from a catalog directory.
 */
export async function removeFromCatalogDir(
  name: string,
  catalogDir: string,
): Promise<EntityDeleteResult> {
  const filePath = join(catalogDir, `${name}.yaml`);

  if (!existsSync(filePath)) {
    throw new Error(`Entity file not found: ${filePath}`);
  }

  await unlink(filePath);
  return { filePath, fileDeleted: true };
}

// ─── Inline Frontmatter Mode ────────────────────────────────────────────────────

/**
 * Write an entity as YAML frontmatter in a markdown file.
 *
 * If the file already exists, the frontmatter is replaced but the
 * markdown body is preserved.
 */
export async function writeToFrontmatter(
  entity: BackstageEntity,
  markdownPath: string,
  defaultBody: string = "",
): Promise<EntityWriteResult> {
  const dir = dirname(markdownPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let body = defaultBody;
  let created = true;

  if (existsSync(markdownPath)) {
    const content = await readFile(markdownPath, "utf-8");
    body = extractMarkdownBody(content);
    created = false;
  }

  const output = writeBackstageFrontmatter(entity, body);
  await writeFile(markdownPath, output, "utf-8");

  return { filePath: markdownPath, created, entityCount: 1 };
}

// ─── Unified Write ──────────────────────────────────────────────────────────────

/**
 * Write an entity using the appropriate mode based on config.
 */
export async function writeEntity(
  entity: BackstageEntity,
  config: AnchoredSpecConfigV1,
  projectRoot: string,
): Promise<EntityWriteResult> {
  const mode = config.entityMode ?? "manifest";

  switch (mode) {
    case "manifest": {
      const manifestPath = join(
        projectRoot,
        config.manifestPath ?? "catalog-info.yaml",
      );
      return writeToManifest(entity, manifestPath);
    }

    case "inline": {
      const docDirs = config.inlineDocDirs ?? ["docs"];
      const docDir = join(projectRoot, docDirs[0] ?? "docs");
      const filePath = join(docDir, `${entity.metadata.name}.md`);
      const defaultBody = `\n# ${entity.metadata.title ?? entity.metadata.name}\n\nTODO: Add documentation.\n`;
      return writeToFrontmatter(entity, filePath, defaultBody);
    }

    default:
      throw new Error(`Unsupported entity mode: ${mode}`);
  }
}

/**
 * Delete an entity using the appropriate mode based on config.
 */
export async function deleteEntity(
  kind: string,
  name: string,
  config: AnchoredSpecConfigV1,
  projectRoot: string,
  namespace: string = "default",
): Promise<EntityDeleteResult> {
  const mode = config.entityMode ?? "manifest";

  switch (mode) {
    case "manifest": {
      const manifestPath = join(
        projectRoot,
        config.manifestPath ?? "catalog-info.yaml",
      );
      return removeFromManifest(kind, name, manifestPath, namespace);
    }

    case "inline": {
      // In inline mode, each entity is a separate file
      const docDirs = config.inlineDocDirs ?? ["docs"];
      const filePath = join(projectRoot, docDirs[0] ?? "docs", `${name}.md`);
      if (!existsSync(filePath)) {
        throw new Error(`Entity file not found: ${filePath}`);
      }
      await unlink(filePath);
      return { filePath, fileDeleted: true };
    }

    default:
      throw new Error(`Unsupported entity mode: ${mode}`);
  }
}
