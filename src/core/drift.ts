/**
 * Anchored Spec — Semantic Drift Detection
 *
 * Scans source files to verify that semanticRefs (interfaces, routes,
 * error codes, symbols) still exist in the codebase. Uses basic regex
 * scanning — no AST parser dependency required for v0.1.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { minimatch } from "minimatch";
import type {
  Requirement,
  DriftFinding,
  DriftReport,
  SemanticRefKind,
} from "./types.js";

// ─── Default configuration ─────────────────────────────────────────────────────

const DEFAULT_SOURCE_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.git/**",
  "**/coverage/**",
  "**/*.d.ts",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
];

// ─── File discovery ─────────────────────────────────────────────────────────────

function walkDir(dir: string, baseDir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    const relPath = relative(baseDir, fullPath);

    if (DEFAULT_IGNORE.some((ig) => minimatch(relPath, ig))) continue;

    if (stat.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir));
    } else if (stat.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

function discoverSourceFiles(
  roots: string[],
  globs: string[],
  projectRoot: string,
): string[] {
  const allFiles: string[] = [];

  for (const root of roots) {
    const absRoot = join(projectRoot, root);
    const files = walkDir(absRoot, projectRoot);
    for (const f of files) {
      const rel = relative(projectRoot, f);
      if (globs.some((g) => minimatch(rel, g))) {
        allFiles.push(f);
      }
    }
  }

  return [...new Set(allFiles)];
}

// ─── Symbol scanning patterns ───────────────────────────────────────────────────

const TS_EXPORT_PATTERNS = [
  /export\s+(?:declare\s+)?(?:interface|class|abstract\s+class|function|const|let|var|type|enum)\s+(\w+)/g,
  /export\s+default\s+(?:class|function)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
];

function extractExportedSymbols(content: string): Set<string> {
  const symbols = new Set<string>();

  for (const pattern of TS_EXPORT_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const captured = match[1]!;
      // For `export { A, B, C }`, split by comma
      if (captured.includes(",")) {
        for (const sym of captured.split(",")) {
          const clean = sym.trim().split(/\s+as\s+/).pop()?.trim();
          if (clean) symbols.add(clean);
        }
      } else {
        symbols.add(captured.trim());
      }
    }
  }

  return symbols;
}

function fileContainsString(content: string, needle: string): boolean {
  return content.includes(needle);
}

// ─── Drift detection ────────────────────────────────────────────────────────────

interface FileCache {
  path: string;
  relativePath: string;
  content: string;
  exports: Set<string>;
}

function buildFileCache(files: string[], projectRoot: string): FileCache[] {
  const cache: FileCache[] = [];
  const tsExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

  for (const f of files) {
    try {
      const content = readFileSync(f, "utf-8");
      const ext = extname(f);
      const exports = tsExtensions.has(ext) ? extractExportedSymbols(content) : new Set<string>();
      cache.push({
        path: f,
        relativePath: relative(projectRoot, f),
        content,
        exports,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  return cache;
}

function findRef(
  cache: FileCache[],
  kind: SemanticRefKind,
  ref: string,
): string[] {
  const foundIn: string[] = [];

  switch (kind) {
    case "interface":
    case "symbol": {
      // Look for the symbol as an export
      for (const file of cache) {
        if (file.exports.has(ref)) {
          foundIn.push(file.relativePath);
        }
      }
      break;
    }
    case "route": {
      // Extract the path part of a route ref (e.g., "GET /api/v1/users" → "/api/v1/users")
      const routePath = ref.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, "");
      for (const file of cache) {
        if (fileContainsString(file.content, routePath)) {
          foundIn.push(file.relativePath);
        }
      }
      break;
    }
    case "errorCode": {
      // Look for the error code as a string literal
      for (const file of cache) {
        if (
          fileContainsString(file.content, `"${ref}"`) ||
          fileContainsString(file.content, `'${ref}'`) ||
          fileContainsString(file.content, `\`${ref}\``)
        ) {
          foundIn.push(file.relativePath);
        }
      }
      break;
    }
    case "schema": {
      // Look for table/schema name references
      for (const file of cache) {
        if (fileContainsString(file.content, ref)) {
          foundIn.push(file.relativePath);
        }
      }
      break;
    }
  }

  return foundIn;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export interface DriftOptions {
  sourceRoots?: string[];
  sourceGlobs?: string[];
  projectRoot: string;
}

export function detectDrift(
  requirements: Requirement[],
  options: DriftOptions,
): DriftReport {
  const roots = options.sourceRoots ?? ["src"];
  const globs = options.sourceGlobs ?? DEFAULT_SOURCE_GLOBS;

  const files = discoverSourceFiles(roots, globs, options.projectRoot);
  const cache = buildFileCache(files, options.projectRoot);

  const findings: DriftFinding[] = [];

  for (const req of requirements) {
    if (!req.semanticRefs) continue;
    // Only check active and shipped requirements
    if (req.status !== "active" && req.status !== "shipped") continue;

    const refEntries: Array<{ kind: SemanticRefKind; refs: string[] }> = [
      { kind: "interface", refs: req.semanticRefs.interfaces ?? [] },
      { kind: "route", refs: req.semanticRefs.routes ?? [] },
      { kind: "errorCode", refs: req.semanticRefs.errorCodes ?? [] },
      { kind: "symbol", refs: req.semanticRefs.symbols ?? [] },
      { kind: "schema", refs: req.semanticRefs.schemas ?? [] },
    ];

    for (const { kind, refs } of refEntries) {
      for (const ref of refs) {
        const foundIn = findRef(cache, kind, ref);
        findings.push({
          reqId: req.id,
          kind,
          ref,
          status: foundIn.length > 0 ? "found" : "missing",
          foundIn: foundIn.length > 0 ? foundIn : undefined,
        });
      }
    }
  }

  const found = findings.filter((f) => f.status === "found").length;
  const missing = findings.filter((f) => f.status === "missing").length;

  return {
    findings,
    summary: {
      totalRefs: findings.length,
      found,
      missing,
    },
  };
}
