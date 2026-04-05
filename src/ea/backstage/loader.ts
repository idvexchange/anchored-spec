/**
 * Backstage-Aware Entity Loader
 *
 * Loads Backstage-format entities from supported storage modes
 * (manifest, catalog directory, inline frontmatter).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { parseAllDocuments } from "yaml";

import type { EaDomain } from "../types.js";
import type { EaValidationError } from "../validate.js";
import type { AnchoredSpecConfigV1 } from "../config.js";
import type { BackstageEntity, DescriptorSubstitution } from "./types.js";
import { parseBackstageYaml, parseFrontmatterEntity } from "./parser.js";
import { getEntityDomain } from "./accessors.js";
import { validateBackstageEntity } from "./validate.js";

// Re-use the loader types from the main loader
export interface BackstageEntityLoadDetail {
  /** Resolved runtime Backstage entity (undefined if parse failed). */
  entity?: BackstageEntity;
  /** Raw authored Backstage entity before local substitution resolution. */
  authoredEntity?: BackstageEntity;
  /** Absolute file path. */
  filePath: string;
  /** Path relative to project root. */
  relativePath: string;
  /** Inferred domain from kind mapping. */
  domain: EaDomain;
  /** Errors encountered during loading/parsing/conversion. */
  errors: EaValidationError[];
}

export interface BackstageEntityLoadResult {
  /** Successfully loaded entities. */
  entities: BackstageEntity[];
  /** All load results with per-entity details. */
  details: BackstageEntityLoadDetail[];
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
): Promise<BackstageEntityLoadResult> {
  const relativePath = relative(projectRoot, manifestPath);
  const details: BackstageEntityLoadDetail[] = [];

  if (!existsSync(manifestPath)) {
    return {
      entities: [],
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
    const detail = await convertEntity(entity, manifestPath, relativePath);
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
): Promise<BackstageEntityLoadResult> {
  if (!existsSync(catalogDir)) {
    return { entities: [], details: [], errors: [] };
  }

  const files = await collectYamlFiles(catalogDir);
  const details: BackstageEntityLoadDetail[] = [];

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
      const detail = await convertEntity(entity, filePath, relativePath);
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
): Promise<BackstageEntityLoadResult> {
  const details: BackstageEntityLoadDetail[] = [];

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
        const detail = await convertEntity(entity, filePath, relativePath);
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
): Promise<BackstageEntityLoadResult> {
  const mode = config.entityMode ?? "manifest";

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
      const docDirs = config.inlineDocDirs ?? [config.rootDir];
      return loadInlineEntities(docDirs, projectRoot);
    }

    default:
      throw new Error(`Unsupported entity mode: ${mode}`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

class DescriptorSubstitutionError extends Error {
  constructor(
    readonly fieldPath: string,
    message: string,
  ) {
    super(message);
    this.name = "DescriptorSubstitutionError";
  }
}

function isDescriptorSubstitution(
  value: unknown,
  fieldPath: string,
): DescriptorSubstitution | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry);
  const substitutionKeys = keys.filter((key) =>
    key === "$text" || key === "$json" || key === "$yaml",
  );

  if (substitutionKeys.length === 0) {
    return undefined;
  }

  if (substitutionKeys.length !== 1 || keys.length !== 1) {
    throw new DescriptorSubstitutionError(
      fieldPath,
      "Malformed substitution object; expected exactly one of $text, $json, or $yaml",
    );
  }

  const key = substitutionKeys[0]!;
  if (typeof entry[key] !== "string" || !entry[key]) {
    throw new DescriptorSubstitutionError(
      fieldPath,
      `Substitution ${key} must point to a non-empty string path`,
    );
  }

  return entry as unknown as DescriptorSubstitution;
}

function isRemoteSubstitutionTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(target) || target.startsWith("file:");
}

function resolveSubstitutionPath(
  sourceFilePath: string,
  target: string,
): string {
  return isAbsolute(target) ? target : resolve(dirname(sourceFilePath), target);
}

async function loadYamlSubstitution(
  absolutePath: string,
  fieldPath: string,
): Promise<unknown> {
  const content = await readFile(absolutePath, "utf-8");
  const docs = parseAllDocuments(content);

  if (docs.length === 0) {
    return null;
  }

  for (const doc of docs) {
    if (doc.errors.length > 0) {
      throw new DescriptorSubstitutionError(
        fieldPath,
        `Invalid YAML substitution: ${doc.errors[0]!.message}`,
      );
    }
  }

  const values = docs
    .map((doc) => doc.toJSON())
    .filter((value) => value !== null);

  if (values.length > 1) {
    throw new DescriptorSubstitutionError(
      fieldPath,
      "YAML substitution must contain exactly one non-empty document",
    );
  }

  return values[0] ?? null;
}

async function resolveSubstitution(
  substitution: DescriptorSubstitution,
  sourceFilePath: string,
  fieldPath: string,
): Promise<unknown> {
  const [kind, target] = Object.entries(substitution)[0] as [string, string];

  if (isRemoteSubstitutionTarget(target)) {
    throw new DescriptorSubstitutionError(
      fieldPath,
      `Remote substitutions are not supported by default: ${target}`,
    );
  }

  const absolutePath = resolveSubstitutionPath(sourceFilePath, target);

  try {
    switch (kind) {
      case "$text":
        return await readFile(absolutePath, "utf-8");
      case "$json":
        return JSON.parse(await readFile(absolutePath, "utf-8")) as unknown;
      case "$yaml":
        return loadYamlSubstitution(absolutePath, fieldPath);
      default:
        throw new DescriptorSubstitutionError(
          fieldPath,
          `Unsupported substitution kind: ${kind}`,
        );
    }
  } catch (err) {
    if (err instanceof DescriptorSubstitutionError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new DescriptorSubstitutionError(
      fieldPath,
      `Failed to resolve ${kind} substitution from ${target}: ${message}`,
    );
  }
}

async function resolveDescriptorValue(
  value: unknown,
  sourceFilePath: string,
  fieldPath: string = "/",
): Promise<unknown> {
  if (Array.isArray(value)) {
    const entries = await Promise.all(
      value.map((entry, index) =>
        resolveDescriptorValue(entry, sourceFilePath, `${fieldPath}/${index}`),
      ),
    );
    return entries;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const substitution = isDescriptorSubstitution(value, fieldPath);
  if (substitution) {
    return resolveSubstitution(substitution, sourceFilePath, fieldPath);
  }

  const resolvedEntries = await Promise.all(
    Object.entries(value as Record<string, unknown>).map(async ([key, entry]) => [
      key,
      await resolveDescriptorValue(
        entry,
        sourceFilePath,
        fieldPath === "/" ? `/${key}` : `${fieldPath}/${key}`,
      ),
    ]),
  );

  return Object.fromEntries(resolvedEntries);
}

async function resolveEntitySubstitutions(
  entity: BackstageEntity,
  sourceFilePath: string,
): Promise<BackstageEntity> {
  return await resolveDescriptorValue(
    entity,
    sourceFilePath,
  ) as BackstageEntity;
}

/** Convert a parsed BackstageEntity to an entity load detail record. */
async function convertEntity(
  entity: BackstageEntity,
  filePath: string,
  relativePath: string,
): Promise<BackstageEntityLoadDetail> {
  const errors: EaValidationError[] = [];
  const authoredEntity = entity;

  let resolvedEntity: BackstageEntity;
  try {
    resolvedEntity = await resolveEntitySubstitutions(authoredEntity, filePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const fieldPath = err instanceof DescriptorSubstitutionError
      ? err.fieldPath
      : "/";
    errors.push({
      path: relativePath,
      message: `${relativePath}${fieldPath}: ${message}`,
      severity: "error",
      rule: "ea:backstage:substitution-error",
    });

    return {
      authoredEntity,
      entity: authoredEntity,
      filePath,
      relativePath,
      domain: "systems",
      errors,
    };
  }

  // Validate entity against Backstage schema before any downstream processing
  const schemaResult = await validateBackstageEntity(resolvedEntity);
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

  return {
    entity: resolvedEntity,
    authoredEntity,
    filePath,
    relativePath,
    domain: (getEntityDomain(resolvedEntity) as EaDomain | undefined) ?? "systems",
    errors,
  };
}

/** Build an entity load result from detail entries. */
function buildResult(details: BackstageEntityLoadDetail[]): BackstageEntityLoadResult {
  const entities = details
    .filter((detail): detail is BackstageEntityLoadDetail & { entity: BackstageEntity } => detail.entity !== undefined)
    .map((detail) => detail.entity);
  const errors = details.flatMap((d) => d.errors);
  return { entities, details, errors };
}

/** Merge two load results. */
function mergeResults(
  a: BackstageEntityLoadResult,
  b: BackstageEntityLoadResult,
): BackstageEntityLoadResult {
  return {
    entities: [...a.entities, ...b.entities],
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
