/**
 * Anchored Spec — Markdown Prose Resolver
 *
 * Discovers EA artifacts by extracting structured facts from markdown
 * documentation. Parses tables, code blocks, Mermaid diagrams, and
 * annotated regions to produce event, endpoint, and entity drafts.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative, resolve } from "node:path";
import type { EaArtifactDraft } from "../discovery.js";
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
function findMarkdownFiles(projectRoot: string, source?: string): string[] {
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
    // Scan default doc directories
    for (const dir of DEFAULT_DOC_DIRS) {
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

// ─── Fact → Artifact Draft Conversion ─────────────────────────────────

/** Slugify a string for use as an artifact ID segment. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Convert extracted facts from manifests into EA artifact drafts.
 * Maps event, endpoint, and entity facts to their corresponding artifact kinds.
 */
function factsToArtifactDrafts(manifests: FactManifest[]): EaArtifactDraft[] {
  const drafts: EaArtifactDraft[] = [];
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
): EaArtifactDraft | null {
  const slug = slugify(fact.key);

  switch (fact.kind) {
    case "event-table":
      return {
        suggestedId: `systems/EVT-${slug}`,
        kind: "event-contract",
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
        suggestedId: `systems/API-${slug}`,
        kind: "api-contract",
        title: fact.key,
        summary: `API endpoint discovered from ${source}`,
        status: "draft",
        confidence: "observed",
        anchors: { apis: [fact.key] },
        discoveredBy: "markdown",
        discoveredAt: now,
      };

    case "entity-fields":
      return {
        suggestedId: `information/CE-${slug}`,
        kind: "canonical-entity",
        title: fact.key,
        summary: `Entity discovered from ${source}`,
        status: "draft",
        confidence: "observed",
        discoveredBy: "markdown",
        discoveredAt: now,
      };

    default:
      // Other fact kinds are not directly mappable to artifacts
      return null;
  }
}

// ─── Standalone Extraction Function ───────────────────────────────────

/**
 * Extract fact manifests from markdown documentation.
 * Used directly by the consistency engine without going through the discover pipeline.
 */
export async function extractFactsFromDocs(
  projectRoot: string,
  source?: string,
  logger: ResolverLogger = silentLogger,
): Promise<FactManifest[]> {
  const mdFiles = findMarkdownFiles(projectRoot, source);
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
 * Markdown Prose Resolver — discovers EA artifacts by extracting
 * structured facts from project markdown documentation.
 */
export class MarkdownResolver implements EaResolver {
  readonly name = "markdown";
  readonly domains: EaResolver["domains"] = ["systems", "information"];
  readonly kinds = ["event-contract", "api-contract", "canonical-entity"];

  /**
   * Discover artifacts by parsing markdown files and extracting facts.
   *
   * Scans `ctx.source` (or default doc directories) for `.md` files,
   * parses each, extracts facts, and converts relevant facts to artifact drafts.
   */
  discoverArtifacts(ctx: EaResolverContext): EaArtifactDraft[] | null {
    const cacheKey = `${CACHE_KEY_PREFIX}:${ctx.source ?? "default"}`;
    const cached = ctx.cache.get<FactManifest[]>(cacheKey);

    let manifests: FactManifest[];

    if (cached) {
      ctx.logger.debug("Using cached markdown fact manifests", { count: cached.length });
      manifests = cached;
    } else {
      const mdFiles = findMarkdownFiles(ctx.projectRoot, ctx.source);
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

    if (totalFacts === 0) return null;

    return factsToArtifactDrafts(manifests);
  }
}
