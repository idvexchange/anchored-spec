/**
 * Anchored Spec — File Discovery Utilities
 *
 * Shared file walking and source discovery used by drift detection,
 * test linking, and impact analysis.
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { minimatch } from "minimatch";

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**",
];

export interface WalkOptions {
  ignore?: string[];
}

/**
 * Recursively walk a directory tree, returning relative paths.
 * Respects ignore patterns (defaults to node_modules, dist, etc.).
 */
export function walkDir(
  dir: string,
  baseDir: string,
  options?: WalkOptions,
): string[] {
  if (!existsSync(dir)) return [];
  const ignorePatterns = options?.ignore ?? DEFAULT_IGNORE;
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    const relPath = relative(baseDir, fullPath);

    if (ignorePatterns.some((ig) => minimatch(relPath, ig))) continue;

    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir, options));
    } else if (stat.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Discover source files under given roots, filtered by glob patterns.
 */
export function discoverSourceFiles(
  roots: string[],
  globs: string[],
  projectRoot: string,
  options?: WalkOptions,
): string[] {
  const allFiles: string[] = [];

  for (const root of roots) {
    const absRoot = join(projectRoot, root);
    const files = walkDir(absRoot, projectRoot, options);
    for (const f of files) {
      const rel = relative(projectRoot, f);
      if (globs.some((g) => minimatch(rel, g))) {
        allFiles.push(f);
      }
    }
  }

  return [...new Set(allFiles)];
}
