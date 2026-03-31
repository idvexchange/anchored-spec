/**
 * Backstage-Aware Entity Loader
 *
 * Loads Backstage-format entities from all three storage modes
 * (manifest, catalog directory, inline frontmatter) and converts
 * them to `EaArtifactBase[]` via the bridge, so all downstream
 * modules work unchanged.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

import type { EaArtifactBase, EaDomain } from "../types.js";
import { getDomainForKind } from "../types.js";
import type { EaValidationError } from "../validate.js";
import type { AnchoredSpecConfigV1 } from "../config.js";
import type { BackstageEntity } from "./types.js";
import { parseBackstageYaml, parseFrontmatterEntity } from "./parser.js";
import { backstageToArtifact } from "./bridge.js";
import { validateBackstageEntity } from "./validate.js";

// Re-use the loader types from the main loader
export interface BackstageLoadedEntity {
  /** The converted artifact (undefined if conversion failed). */
  artifact?: EaArtifactBase;
  /** Original Backstage entity (undefined if parse failed). */
  entity?: BackstageEntity;
  /** Absolute file path. */
  filePath: string;
  /** Path relative to project root. */
  relativePath: string;
  /** Inferred domain from kind mapping. */
  domain: EaDomain;
  /** Errors encountered during loading/parsing/conversion. */
  errors: EaValidationError[];
}

export interface BackstageLoadResult {
  /** Successfully converted artifacts. */
  artifacts: EaArtifactBase[];
  /** All load results with per-entity details. */
  details: BackstageLoadedEntity[];
  /** Flat list of all errors. */
  errors: EaValidationError[];
}

// ─── Manifest Mode ──────────────────────────────────────────────────────────────

/**
 * Load entities from a single manifest YAML file (multi-document).
 */
export async function loadManifestFile(
  manifestPath: string,
  projectRoot: string,
): Promise<BackstageLoadResult> {
  const relativePath = relative(projectRoot, manifestPath);
  const details: BackstageLoadedEntity[] = [];

  if (!existsSync(manifestPath)) {
    return {
      artifacts: [],
      details: [],
      errors: [
        {
          path: relativePath,
          message: `Manifest file not found: ${relativePath}`,
          severity: "error",
          rule: "ea:backstage:manifest-not-found",
        },
      ],
    };
  }

  const content = await readFile(manifestPath, "utf-8");
  const parseResult = parseBackstageYaml(content, manifestPath);

  // Report parse errors
  for (const err of parseResult.errors) {
    details.push({
      filePath: manifestPath,
      relativePath,
      domain: "systems",
      errors: [
        {
          path: relativePath,
          message: `${relativePath}[doc ${err.documentIndex}]: ${err.message}`,
          severity: "error",
          rule: "ea:backstage:parse-error",
        },
      ],
    });
  }

  // Convert each parsed entity
  for (const { entity } of parseResult.entities) {
    const detail = convertEntity(entity, manifestPath, relativePath);
    details.push(detail);
  }

  return buildResult(details);
}

// ─── Catalog Directory Mode ─────────────────────────────────────────────────────

/**
 * Load entities from a directory of Backstage YAML files.
 */
export async function loadCatalogDirectory(
  catalogDir: string,
  projectRoot: string,
): Promise<BackstageLoadResult> {
  if (!existsSync(catalogDir)) {
    return { artifacts: [], details: [], errors: [] };
  }

  const files = await collectYamlFiles(catalogDir);
  const details: BackstageLoadedEntity[] = [];

  for (const filePath of files) {
    const relativePath = relative(projectRoot, filePath);
    const content = await readFile(filePath, "utf-8");
    const parseResult = parseBackstageYaml(content, filePath);

    for (const err of parseResult.errors) {
      details.push({
        filePath,
        relativePath,
        domain: "systems",
        errors: [
          {
            path: relativePath,
            message: `${relativePath}[doc ${err.documentIndex}]: ${err.message}`,
            severity: "error",
            rule: "ea:backstage:parse-error",
          },
        ],
      });
    }

    for (const { entity } of parseResult.entities) {
      const detail = convertEntity(entity, filePath, relativePath);
      details.push(detail);
    }
  }

  return buildResult(details);
}

// ─── Inline Frontmatter Mode ────────────────────────────────────────────────────

/**
 * Load entities from markdown files with Backstage YAML frontmatter.
 */
export async function loadInlineEntities(
  docDirs: string[],
  projectRoot: string,
): Promise<BackstageLoadResult> {
  const details: BackstageLoadedEntity[] = [];

  for (const dir of docDirs) {
    const absDir = join(projectRoot, dir);
    if (!existsSync(absDir)) continue;

    const files = await collectMarkdownFiles(absDir);

    for (const filePath of files) {
      const relativePath = relative(projectRoot, filePath);
      const content = await readFile(filePath, "utf-8");

      // Only process files that have YAML frontmatter starting with apiVersion
      if (!hasFrontmatter(content)) continue;

      const parseResult = parseFrontmatterEntity(content, filePath);

      for (const err of parseResult.errors) {
        details.push({
          filePath,
          relativePath,
          domain: "systems",
          errors: [
            {
              path: relativePath,
              message: `${relativePath}: ${err.message}`,
              severity: "error",
              rule: "ea:backstage:frontmatter-error",
            },
          ],
        });
      }

      for (const { entity } of parseResult.entities) {
        const detail = convertEntity(entity, filePath, relativePath);
        details.push(detail);
      }
    }
  }

  return buildResult(details);
}

// ─── Unified Loader ─────────────────────────────────────────────────────────────

/**
 * Load all Backstage entities based on config mode.
 *
 * This is the main entry point for Backstage-mode loading. It
 * dispatches to the appropriate loader(s) based on `entityMode`.
 */
export async function loadBackstageEntities(
  config: AnchoredSpecConfigV1,
  projectRoot: string,
): Promise<BackstageLoadResult> {
  const mode = config.entityMode ?? "artifacts";

  switch (mode) {
    case "manifest": {
      const manifestPath = join(
        projectRoot,
        config.manifestPath ?? "catalog-info.yaml",
      );
      const catalogDir = config.catalogDir
        ? join(projectRoot, config.catalogDir)
        : undefined;

      // Load from manifest file
      const manifestResult = await loadManifestFile(manifestPath, projectRoot);

      // Also load from catalog directory if configured
      if (catalogDir) {
        const catalogResult = await loadCatalogDirectory(
          catalogDir,
          projectRoot,
        );
        return mergeResults(manifestResult, catalogResult);
      }

      return manifestResult;
    }

    case "inline": {
      const docDirs = config.inlineDocDirs ?? ["docs"];
      return loadInlineEntities(docDirs, projectRoot);
    }

    default:
      // "artifacts" mode is handled by the existing loader
      return { artifacts: [], details: [], errors: [] };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Convert a parsed BackstageEntity to a BackstageLoadedEntity. */
function convertEntity(
  entity: BackstageEntity,
  filePath: string,
  relativePath: string,
): BackstageLoadedEntity {
  const errors: EaValidationError[] = [];

  // Validate entity against Backstage schema before bridge conversion
  const schemaResult = validateBackstageEntity(entity);
  if (!schemaResult.valid) {
    for (const err of schemaResult.errors) {
      errors.push({
        path: relativePath,
        message: `${relativePath}: ${err.message}`,
        severity: err.severity,
        rule: err.rule,
      });
    }
  }
  // Include warnings from schema validation
  for (const warn of schemaResult.warnings) {
    errors.push({
      path: relativePath,
      message: `${relativePath}: ${warn.message}`,
      severity: "warning",
      rule: warn.rule,
    });
  }

  try {
    const artifact = backstageToArtifact(entity);
    const domain = getDomainForKind(artifact.kind) ?? "systems";

    return {
      artifact,
      entity,
      filePath,
      relativePath,
      domain,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push({
      path: relativePath,
      message: `${relativePath}: Bridge conversion error — ${message}`,
      severity: "error",
      rule: "ea:backstage:bridge-error",
    });

    return {
      entity,
      filePath,
      relativePath,
      domain: "systems",
      errors,
    };
  }
}

/** Build a BackstageLoadResult from detail entries. */
function buildResult(details: BackstageLoadedEntity[]): BackstageLoadResult {
  const artifacts = details
    .filter((d) => d.artifact !== undefined)
    .map((d) => d.artifact!);
  const errors = details.flatMap((d) => d.errors);
  return { artifacts, details, errors };
}

/** Merge two load results. */
function mergeResults(
  a: BackstageLoadResult,
  b: BackstageLoadResult,
): BackstageLoadResult {
  return {
    artifacts: [...a.artifacts, ...b.artifacts],
    details: [...a.details, ...b.details],
    errors: [...a.errors, ...b.errors],
  };
}

/** Check if content appears to have Backstage frontmatter. */
function hasFrontmatter(content: string): boolean {
  const text = content.replace(/^\ufeff/, "");
  if (!text.startsWith("---")) return false;
  // Quick check: does the frontmatter contain apiVersion?
  const endIdx = text.indexOf("\n---", 3);
  if (endIdx === -1) return false;
  const fm = text.slice(0, endIdx);
  return fm.includes("apiVersion:");
}

/** Recursively collect YAML files from a directory. */
async function collectYamlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      files.push(...(await collectYamlFiles(full)));
    } else {
      const ext = extname(entry).toLowerCase();
      if (ext === ".yaml" || ext === ".yml") {
        files.push(full);
      }
    }
  }

  return files.sort();
}

/** Recursively collect markdown files from a directory. */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      files.push(...(await collectMarkdownFiles(full)));
    } else {
      const ext = extname(entry).toLowerCase();
      if (ext === ".md" || ext === ".mdx") {
        files.push(full);
      }
    }
  }

  return files.sort();
}
