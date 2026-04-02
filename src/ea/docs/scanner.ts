/** Anchored Spec — Document Scanner
 *
 * Finds markdown files with EA-relevant frontmatter in a project.
 * Walks specified directories recursively, parsing frontmatter from
 * each `.md` file and returning documents that reference EA entities.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";
import { parseFrontmatter, extractArtifactIds } from "./frontmatter.js";
import type { DocFrontmatter } from "./frontmatter.js";
import type { BackstageEntity } from "../backstage/types.js";
import { parseEntityRef } from "../backstage/types.js";
import { getEntityId } from "../backstage/accessors.js";
import { normalizeKnownEntityRef } from "../backstage/ref-utils.js";
import type { EaArtifactDraft } from "../discovery.js";
import { createDraft } from "../discovery.js";
import type { DraftEntityDescriptor } from "../discovery.js";
import { ENTITY_DESCRIPTOR_REGISTRY } from "../backstage/kind-mapping.js";

// ─── Constants ────────────────────────────────────────────────────────

/** Default directories to scan for markdown documents. */
export const DEFAULT_DOC_DIRS = ["docs", "specs", ".", "doc", "documentation"];

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

// ─── Types ────────────────────────────────────────────────────────────

/** A scanned markdown document with parsed frontmatter. */
export interface ScannedDoc {
  /** Absolute path to the document. */
  path: string;
  /** Path relative to the project root. */
  relativePath: string;
  /** Parsed frontmatter. */
  frontmatter: DocFrontmatter;
  /** EA entity refs referenced in frontmatter (convenience). */
  artifactIds: string[];
}

/** Summary of a scan operation. */
export interface ScanResult {
  /** All documents with EA-relevant frontmatter. */
  docs: ScannedDoc[];
  /** Total markdown files scanned. */
  totalScanned: number;
  /** Files that had frontmatter but no EA entity refs. */
  withFrontmatterNoArtifacts: number;
}

/** Options for the scanner. */
export interface ScanOptions {
  /** Directories to scan (relative to projectRoot). Defaults to common doc dirs. */
  dirs?: string[];
  /** Whether to include docs that have frontmatter but no ea-artifacts. Default: false. */
  includeAll?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Recursively walk a directory collecting `.md` file paths.
 * Skips directories in the {@link SKIP_DIRS} set and silently handles
 * permission errors.
 */
function walkDir(dir: string, skipDirs: Set<string>): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (skipDirs.has(entry)) continue;

    const fullPath = join(dir, entry);

    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, skipDirs));
    } else if (stat.isFile() && extname(entry) === ".md") {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Scan a project for markdown documents with EA-relevant frontmatter.
 *
 * Walks the specified directories recursively, parsing frontmatter from
 * each `.md` file. Returns only documents that have `ea-artifacts` (or
 * `anchored-spec`) frontmatter references by default.
 *
 * @param projectRoot - Absolute path to the project root.
 * @param options - Scan options.
 */
export function scanDocs(projectRoot: string, options?: ScanOptions): ScanResult {
  const root = resolve(projectRoot);
  const dirs = options?.dirs ?? DEFAULT_DOC_DIRS;
  const includeAll = options?.includeAll ?? false;

  // Collect unique markdown file paths across all requested directories
  const seen = new Set<string>();
  const mdFiles: string[] = [];

  for (const dir of dirs) {
    const absDir = resolve(root, dir);

    let stat;
    try {
      stat = statSync(absDir);
    } catch {
      continue; // non-existent dir — skip silently
    }

    if (!stat.isDirectory()) continue;

    for (const filePath of walkDir(absDir, SKIP_DIRS)) {
      if (!seen.has(filePath)) {
        seen.add(filePath);
        mdFiles.push(filePath);
      }
    }
  }

  // Parse each file and filter
  const docs: ScannedDoc[] = [];
  let withFrontmatterNoArtifacts = 0;

  for (const filePath of mdFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed.hasFrontmatter) continue;

    const artifactIds = extractArtifactIds(parsed.frontmatter);

    if (artifactIds.length === 0) {
      withFrontmatterNoArtifacts++;
      if (!includeAll) continue;
    }

    docs.push({
      path: filePath,
      relativePath: relative(root, filePath),
      frontmatter: parsed.frontmatter,
      artifactIds,
    });
  }

  return {
    docs,
    totalScanned: mdFiles.length,
    withFrontmatterNoArtifacts,
  };
}

/**
 * Build an inverted index: entity ref → documents that reference it.
 * Useful for finding which docs describe a given entity.
 */
export function buildDocIndex(docs: ScannedDoc[]): Map<string, ScannedDoc[]> {
  const index = new Map<string, ScannedDoc[]>();

  for (const doc of docs) {
    for (const id of doc.artifactIds) {
      const existing = index.get(id);
      if (existing) {
        existing.push(doc);
      } else {
        index.set(id, [doc]);
      }
    }
  }

  return index;
}

const DEFAULT_DISCOVERY_SCHEMA_NAME_BY_ENTITY_KIND: Record<string, string> = {
  api: "api-contract",
  component: "service",
  resource: "data-store",
  requirement: "requirement",
  canonicalentity: "canonical-entity",
  exchange: "information-exchange",
  decision: "decision",
  valuestream: "value-stream",
  mission: "mission",
  transitionplan: "transition-plan",
};

/**
 * Convert an entity-ref slug to a human-readable title.
 * Example: `"auth-core"` → `"Auth Core"`
 */
function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Document-Driven Discovery ────────────────────────────────────

/** Result of document-driven discovery. */
export interface DocDiscoveryResult {
  /** Draft entities scaffolded from doc frontmatter references. */
  drafts: EaArtifactDraft[];
  /** Entity refs that were already modeled (skipped). */
  alreadyExists: string[];
  /** Entity refs that were not valid Backstage entity refs. */
  invalidRefs: string[];
}

/**
 * Discover draft entities from document frontmatter.
 *
 * Scans docs for `ea-artifacts` references, identifies IDs that don't
 * match any existing entity, and scaffolds draft entities from the
 * authored entity descriptor and the doc context.
 *
 * This enables the **prose-first workflow**: write docs first, then
 * run `discover --from-docs` to scaffold the entities they reference.
 *
 * @param docs - Scanned documents with frontmatter.
 * @param existingEntities - Already-loaded entities to skip.
 * @returns Drafts for missing entities plus diagnostic arrays.
 */
export function discoverFromDocs(
  docs: ScannedDoc[],
  existingEntities: BackstageEntity[],
): DocDiscoveryResult {
  const existingIds = new Set(existingEntities.map((entity) => getEntityId(entity)));
  const alreadyExists: string[] = [];
  const invalidRefs: string[] = [];
  const drafts: EaArtifactDraft[] = [];
  const seen = new Set<string>();

  for (const doc of docs) {
    for (const id of doc.artifactIds) {
      const normalizedId = normalizeKnownEntityRef(id, {
        defaultNamespace: "default",
      });
      const dedupeId = normalizedId ?? id;

      // Skip duplicates across docs
      if (seen.has(dedupeId)) continue;
      seen.add(dedupeId);

      // Skip existing entities
      if (normalizedId && existingIds.has(normalizedId)) {
        alreadyExists.push(id);
        continue;
      }

      // Resolve the authored entity ref to an anchored-spec draft kind
      const resolved = resolveDraftKind(id);
      if (!resolved) {
        invalidRefs.push(id);
        continue;
      }

      // Build a context-aware summary from the doc
      const docType = doc.frontmatter.type ?? "document";
      const docDomain = doc.frontmatter.domain?.join(", ") ?? "";
      const domainHint = docDomain ? ` (${docDomain})` : "";
      const summary =
        `Referenced in ${docType}${domainHint}: ${doc.relativePath}`;

      const draft = createDraft(resolved.descriptor, slugToTitle(resolved.slug), "doc-frontmatter", {
        confidence: "inferred",
        summary,
        anchors: { docs: [doc.relativePath] },
      });

      // Override the auto-generated ID with the one from frontmatter
      // (the user chose this ID intentionally)
      draft.suggestedId = id;

      drafts.push(draft);
    }
  }

  return { drafts, alreadyExists, invalidRefs };
}

function resolveDraftKind(id: string): { descriptor: DraftEntityDescriptor; slug: string } | null {
  try {
    const parsed = parseEntityRef(id);
    if (parsed.kind) {
      const matches = ENTITY_DESCRIPTOR_REGISTRY.filter(
        (entry) => entry.kind.toLowerCase() === parsed.kind,
      );
      if (matches.length === 1) {
        const match = matches[0]!;
        return {
          descriptor: {
            apiVersion: match.apiVersion,
            kind: match.kind,
            type: match.specType,
            schema: match.schema,
          },
          slug: parsed.name,
        };
      }
      const defaultSchemaName = DEFAULT_DISCOVERY_SCHEMA_NAME_BY_ENTITY_KIND[parsed.kind];
      if (defaultSchemaName) {
        const match = ENTITY_DESCRIPTOR_REGISTRY.find((entry) => entry.schema === defaultSchemaName);
        if (match) {
          return {
            descriptor: {
              apiVersion: match.apiVersion,
              kind: match.kind,
              type: match.specType,
              schema: match.schema,
            },
            slug: parsed.name,
          };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}
