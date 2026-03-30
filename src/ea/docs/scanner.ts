/** Anchored Spec — Document Scanner
 *
 * Finds markdown files with EA-relevant frontmatter in a project.
 * Walks specified directories recursively, parsing frontmatter from
 * each `.md` file and returning documents that reference EA artifacts.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";
import { parseFrontmatter, extractArtifactIds } from "./frontmatter.js";
import type { DocFrontmatter } from "./frontmatter.js";

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
  /** EA artifact IDs referenced in frontmatter (convenience). */
  artifactIds: string[];
}

/** Summary of a scan operation. */
export interface ScanResult {
  /** All documents with EA-relevant frontmatter. */
  docs: ScannedDoc[];
  /** Total markdown files scanned. */
  totalScanned: number;
  /** Files that had frontmatter but no EA artifact references. */
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
 * Build an inverted index: artifact ID → documents that reference it.
 * Useful for finding which docs describe a given artifact.
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
