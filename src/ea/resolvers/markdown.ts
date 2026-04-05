/**
 * Anchored Spec — Markdown Prose Resolver
 *
 * Discovers EA entities by extracting structured facts from markdown
 * documentation. Parses tables, code blocks, Mermaid diagrams, and
 * annotated regions to produce event, endpoint, and entity drafts.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative, resolve } from "node:path";
import { getSchemaDescriptor } from "../backstage/kind-mapping.js";
import type { EntityDraft } from "../discovery.js";
import type { EaResolver, EaResolverContext, ResolverLogger } from "./types.js";
import { silentLogger } from "./types.js";
import type { FactManifest, ExtractedFact } from "../facts/types.js";
import { parseMarkdown, parseMarkdownFile } from "../facts/markdown-parser.js";
import { buildFactManifest } from "../facts/extractors/index.js";

// ─── Constants ────────────────────────────────────────────────────────

/** Default directories to scan for markdown documents. */
const DEFAULT_DOC_DIRS = ["docs", "specs", ".", "doc", "documentation"];

/** Directory names to skip during recursive walks. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  "build",
  ".next",
  ".turbo",
]);

const CACHE_KEY_PREFIX = "markdown:manifests";

// ─── Directory Walker ─────────────────────────────────────────────────

/**
 * Recursively walk a directory collecting `.md` file paths.
 * Skips directories in the {@link SKIP_DIRS} set.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (stat.isFile() && extname(entry) === ".md") {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Find all markdown files under the given directories.
 * Deduplicates paths across overlapping directories.
 */
function findMarkdownFiles(
  projectRoot: string,
  source?: string,
  sourcePaths?: string[],
): string[] {
  const root = resolve(projectRoot);
  const seen = new Set<string>();
  const mdFiles: string[] = [];

  if (source) {
    // Scan a specific source directory
    const absDir = resolve(root, source);
    let stat;
    try {
      stat = statSync(absDir);
    } catch {
      return [];
    }
    if (!stat.isDirectory()) return [];
    for (const filePath of walkDir(absDir)) {
      if (!seen.has(filePath)) {
        seen.add(filePath);
        mdFiles.push(filePath);
      }
    }
  } else {
    const dirs = sourcePaths && sourcePaths.length > 0 ? sourcePaths : DEFAULT_DOC_DIRS;
    for (const dir of dirs) {
      const absDir = resolve(root, dir);
      let stat;
      try {
        stat = statSync(absDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      for (const filePath of walkDir(absDir)) {
        if (!seen.has(filePath)) {
          seen.add(filePath);
          mdFiles.push(filePath);
        }
      }
    }
  }

  return mdFiles;
}

// ─── Fact → Entity Draft Conversion ─────────────────────────────────

/** Slugify a string for use as an entity ID segment. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Convert extracted facts from manifests into EA entity drafts.
 * Maps event, endpoint, and entity facts to their corresponding schema profiles.
 */
function factsToEntityDrafts(manifests: FactManifest[]): EntityDraft[] {
  const drafts: EntityDraft[] = [];
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      for (const fact of block.facts) {
        const draft = factToDraft(fact, manifest.source, now);
        if (draft && !seen.has(draft.suggestedId)) {
          seen.add(draft.suggestedId);
          drafts.push(draft);
        }
      }
    }
  }

  return drafts;
}

function factToDraft(
  fact: ExtractedFact,
  source: string,
  now: string,
): EntityDraft | null {
  const slug = slugify(fact.key);
  const eventContract = getSchemaDescriptor("event-contract")!;
  const apiContract = getSchemaDescriptor("api-contract")!;
  const canonicalEntity = getSchemaDescriptor("canonical-entity")!;

  switch (fact.kind) {
    case "event-table":
      return {
        suggestedId: `api:${slug}`,
        apiVersion: eventContract.apiVersion,
        kind: eventContract.kind,
        type: eventContract.specType,
        schema: eventContract.schema,
        title: fact.key,
        summary: `Event discovered from ${source}`,
        status: "draft",
        confidence: "observed",
        anchors: { events: [fact.key] },
        discoveredBy: "markdown",
        discoveredAt: now,
      };

    case "endpoint-table":
      return {
        suggestedId: `api:${slug}`,
        apiVersion: apiContract.apiVersion,
        kind: apiContract.kind,
        type: apiContract.specType,
        schema: apiContract.schema,
        title: fact.key,
        summary: `API endpoint discovered from ${source}`,
        status: "draft",
        confidence: "observed",
        anchors: { apis: [fact.key] },
        discoveredBy: "markdown",
        discoveredAt: now,
      };

    case "entity-fields":
      {
        const attributes = toCanonicalEntityAttributes(fact);
        if (attributes.length === 0) return null;

      return {
        suggestedId: `canonicalentity:${slug}`,
        apiVersion: canonicalEntity.apiVersion,
        kind: canonicalEntity.kind,
        type: canonicalEntity.specType,
        schema: canonicalEntity.schema,
        title: fact.key,
        summary: `Entity discovered from ${source}`,
        status: "draft",
        confidence: "observed",
        anchors: {
          files: [source],
        },
        discoveredBy: "markdown",
        discoveredAt: now,
        schemaFields: {
          attributes,
        },
      };
      }

    default:
      // Other fact kinds are not directly mappable to entities
      return null;
  }
}

function toCanonicalEntityAttributes(
  fact: ExtractedFact,
): Array<{ name: string; type: string }> {
  const attributes: Array<{ name: string; type: string }> = [];

  for (const [rawKey, rawValue] of Object.entries(fact.fields)) {
    const key = rawKey.trim();
    const value = rawValue.trim();
    if (!value) continue;

    if (/^item_\d+$/.test(key)) {
      const parsed = parseInlineAttribute(value);
      if (parsed) attributes.push(parsed);
      continue;
    }

    if (!isLikelyAttributeName(key) || !isLikelyTypeExpression(value)) {
      continue;
    }

    attributes.push({
      name: key,
      type: value,
    });
  }

  return attributes;
}

function parseInlineAttribute(
  value: string,
): { name: string; type: string } | null {
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
  if (!match) return null;

  const name = match[1]!.trim();
  const type = match[2]!.trim();
  if (!isLikelyAttributeName(name) || !isLikelyTypeExpression(type)) {
    return null;
  }

  return { name, type };
}

function isLikelyAttributeName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isLikelyTypeExpression(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (
    /^(string|number|boolean|Date|unknown|any|object|Record<.*>|Array<.*>|.+\[\]|.+\|.+|.+<.+>)$/.test(trimmed)
  ) {
    return true;
  }

  if (/^[A-Z][A-Za-z0-9_]*(?:<.+>)?(?:\[\])?$/.test(trimmed)) {
    return true;
  }

  if (/^[a-z][A-Za-z0-9_]*(?:\[\])?$/.test(trimmed)) {
    return ["string", "number", "boolean", "unknown", "any", "object"].includes(trimmed);
  }

  return false;
}

// ─── Standalone Extraction Function ───────────────────────────────────

/**
 * Extract fact manifests from markdown documentation.
 * Used directly by the consistency engine without going through the discover pipeline.
 */
export async function extractFactsFromDocs(
  projectRoot: string,
  source?: string | string[],
  logger: ResolverLogger = silentLogger,
): Promise<FactManifest[]> {
  const sourceDir = typeof source === "string" ? source : undefined;
  const sourcePaths = Array.isArray(source) ? source : undefined;
  const mdFiles = findMarkdownFiles(projectRoot, sourceDir, sourcePaths);
  logger.info(`Found ${mdFiles.length} markdown file(s) to scan`, { projectRoot, source });

  const manifests: FactManifest[] = [];
  const root = resolve(projectRoot);

  for (const absPath of mdFiles) {
    const relPath = relative(root, absPath);
    try {
      const doc = await parseMarkdownFile(absPath, relPath);
      const manifest = buildFactManifest(doc);
      manifests.push(manifest);
      if (manifest.totalFacts > 0) {
        logger.debug(`Extracted ${manifest.totalFacts} fact(s) from ${relPath}`);
      }
    } catch (err) {
      logger.warn(`Failed to parse ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(
    `Extracted facts from ${manifests.length} document(s), ` +
    `${manifests.reduce((s, m) => s + m.totalFacts, 0)} total fact(s)`,
  );

  return manifests;
}

// ─── Markdown Resolver ────────────────────────────────────────────────

/**
 * Markdown Prose Resolver — discovers EA entities by extracting
 * structured facts from project markdown documentation.
 */
export class MarkdownResolver implements EaResolver {
  readonly name = "markdown";
  readonly domains: EaResolver["domains"] = ["systems", "information"];
  readonly schemas = ["event-contract", "api-contract", "canonical-entity"];

  /** Manifests from the last `discoverEntities` call (reusable for --write-facts). */
  lastManifests: FactManifest[] = [];

  /**
   * Discover entities by parsing markdown files and extracting facts.
   *
   * Scans `ctx.source` (or default doc directories) for `.md` files,
   * parses each, extracts facts, and converts relevant facts to entity drafts.
   */
  discoverEntities(ctx: EaResolverContext): EntityDraft[] | null {
    const sourceIdentity = ctx.source ?? (ctx.sourcePaths && ctx.sourcePaths.length > 0
      ? ctx.sourcePaths.join("|")
      : "default");
    const cacheKey = `${CACHE_KEY_PREFIX}:${sourceIdentity}`;
    const cached = ctx.cache.get<FactManifest[]>(cacheKey);

    let manifests: FactManifest[];

    if (cached) {
      ctx.logger.debug("Using cached markdown fact manifests", { count: cached.length });
      manifests = cached;
    } else {
      const mdFiles = findMarkdownFiles(ctx.projectRoot, ctx.source, ctx.sourcePaths);
      ctx.logger.info(`Found ${mdFiles.length} markdown file(s) to scan`);

      manifests = [];
      const root = resolve(ctx.projectRoot);

      for (const absPath of mdFiles) {
        const relPath = relative(root, absPath);
        try {
          const content = readFileSync(absPath, "utf-8");
          const doc = parseMarkdown(content, relPath);
          const manifest = buildFactManifest(doc);
          manifests.push(manifest);
          if (manifest.totalFacts > 0) {
            ctx.logger.debug(`Extracted ${manifest.totalFacts} fact(s) from ${relPath}`);
          }
        } catch (err) {
          ctx.logger.warn(
            `Failed to parse ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (manifests.length > 0) {
        ctx.cache.set(cacheKey, manifests);
      }
    }

    const totalFacts = manifests.reduce((s, m) => s + m.totalFacts, 0);
    ctx.logger.info(
      `Extracted facts from ${manifests.length} document(s), ${totalFacts} total fact(s)`,
    );

    this.lastManifests = manifests;

    if (totalFacts === 0) return null;

    return factsToEntityDrafts(manifests);
  }
}
