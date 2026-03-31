/**
 * EA Source Annotation Scanner
 *
 * Scans source files for inline `// @anchored-spec: ARTIFACT-ID` annotations.
 * Returns results compatible with `ScannedDoc` so they integrate directly
 * with the trace-analysis pipeline.
 *
 * Supports single-line comments in all common styles:
 *   // @anchored-spec: SVC-auth-core
 *   # @anchored-spec: SVC-auth-core
 *   -- @anchored-spec: SVC-auth-core
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { minimatch } from "minimatch";
import type { ScannedDoc } from "./docs/scanner.js";

// ─── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_SOURCE_ROOTS = ["src"];
const DEFAULT_SOURCE_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const IGNORE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**",
  "**/*.d.ts",
];

// Pattern: // @anchored-spec: ARTIFACT-ID  (also # and --)
const ANNOTATION_RE = /(?:\/\/|#|--)\s*@anchored-spec:\s+(\S+)/g;

// ─── Config ───────────────────────────────────────────────────────────

export interface SourceAnnotationConfig {
  enabled?: boolean;
  sourceRoots?: string[];
  sourceGlobs?: string[];
  commentPattern?: string; // reserved for future custom pattern
}

export interface SourceScanResult {
  sources: ScannedDoc[];
  totalScanned: number;
}

// ─── File discovery ───────────────────────────────────────────────────

function discoverSourceFiles(
  roots: string[],
  globs: string[],
  projectRoot: string,
  ignore: string[] = IGNORE_PATTERNS,
): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const rel = relative(projectRoot, fullPath);
      if (ignore.some((p) => minimatch(rel, p))) continue;

      const s = statSync(fullPath);
      if (s.isDirectory()) {
        walk(fullPath);
      } else if (s.isFile() && globs.some((g) => minimatch(rel, g))) {
        files.push(fullPath);
      }
    }
  }

  for (const root of roots) {
    const absRoot = join(projectRoot, root);
    walk(absRoot);
  }
  return files;
}

// ─── Annotation extraction ────────────────────────────────────────────

/** Extract unique artifact IDs from @anchored-spec annotations in source content. */
export function extractAnnotations(content: string): string[] {
  const ids = new Set<string>();
  ANNOTATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANNOTATION_RE.exec(content)) !== null) {
    ids.add(match[1]!);
  }
  return [...ids];
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Scan source files for `@anchored-spec` annotations.
 *
 * Returns `ScannedDoc`-compatible results so the trace analysis pipeline
 * can treat source annotations the same as doc frontmatter references.
 */
export function scanSourceAnnotations(
  projectRoot: string,
  config?: SourceAnnotationConfig,
  fallbackRoots?: string[],
  fallbackGlobs?: string[],
): SourceScanResult {
  const roots = config?.sourceRoots ?? fallbackRoots ?? DEFAULT_SOURCE_ROOTS;
  const globs = config?.sourceGlobs ?? fallbackGlobs ?? DEFAULT_SOURCE_GLOBS;

  const files = discoverSourceFiles(roots, globs, projectRoot);
  const sources: ScannedDoc[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, "utf-8");
    const artifactIds = extractAnnotations(content);
    if (artifactIds.length > 0) {
      sources.push({
        path: filePath,
        relativePath: relative(projectRoot, filePath),
        frontmatter: {},
        artifactIds,
      });
    }
  }

  return { sources, totalScanned: files.length };
}
