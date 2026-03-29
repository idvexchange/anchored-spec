/**
 * Anchored Spec — EA Anchors Resolver
 *
 * Scans source files for exported symbols, routes, error codes, and other
 * code-level references that correspond to EA artifact `anchors`. This is the
 * EA-native replacement for the core drift scanner (src/core/drift.ts).
 *
 * Used by `ea drift` to detect stale or missing anchors.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { minimatch } from "minimatch";
import type { EaResolver, EaResolverContext, ObservedEaState, ObservedEntity } from "./types.js";

// ─── Source File Scanning ───────────────────────────────────────────────────────

const DEFAULT_SOURCE_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const IGNORE_PATTERNS = [
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

const TS_EXPORT_PATTERNS = [
  /export\s+(?:declare\s+)?(?:interface|class|abstract\s+class|function|const|let|var|type|enum)\s+(\w+)/g,
  /export\s+default\s+(?:class|function)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
];

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Extract exported symbol names from TypeScript/JavaScript source. */
function extractExportedSymbols(content: string): Set<string> {
  const symbols = new Set<string>();

  for (const pattern of TS_EXPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const captured = match[1]!;
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

/** Recursively discover source files matching glob patterns. */
function discoverFiles(
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
    walk(join(projectRoot, root));
  }
  return files;
}

// ─── Anchor Matching ────────────────────────────────────────────────────────────

export interface AnchorMatch {
  anchorType: string;
  anchorValue: string;
  foundIn: string[];
}

export interface AnchorScanResult {
  matches: AnchorMatch[];
  missing: AnchorMatch[];
  scannedFiles: number;
}

interface FileEntry {
  path: string;
  relativePath: string;
  _content?: string;
  _exports?: Set<string>;
}

function getContent(entry: FileEntry): string {
  if (entry._content === undefined) {
    try {
      entry._content = readFileSync(entry.path, "utf-8");
    } catch {
      entry._content = "";
    }
  }
  return entry._content;
}

function getExports(entry: FileEntry): Set<string> {
  if (entry._exports === undefined) {
    entry._exports = TS_EXTENSIONS.has(extname(entry.path))
      ? extractExportedSymbols(getContent(entry))
      : new Set<string>();
  }
  return entry._exports;
}

/**
 * Scan source files for anchors from EA artifacts.
 */
export function scanAnchors(
  anchors: Record<string, string[]>,
  projectRoot: string,
  sourceRoots: string[] = ["src"],
  sourceGlobs: string[] = DEFAULT_SOURCE_GLOBS,
): AnchorScanResult {
  const files = discoverFiles(sourceRoots, sourceGlobs, projectRoot);
  const index: FileEntry[] = files.map((f) => ({
    path: f,
    relativePath: relative(projectRoot, f),
  }));

  const matches: AnchorMatch[] = [];
  const missing: AnchorMatch[] = [];

  for (const [anchorType, values] of Object.entries(anchors)) {
    for (const value of values) {
      const foundIn = resolveAnchor(index, anchorType, value);
      const match: AnchorMatch = { anchorType, anchorValue: value, foundIn };
      if (foundIn.length > 0) {
        matches.push(match);
      } else {
        missing.push(match);
      }
    }
  }

  return { matches, missing, scannedFiles: files.length };
}

function resolveAnchor(index: FileEntry[], anchorType: string, value: string): string[] {
  const foundIn: string[] = [];

  switch (anchorType) {
    case "symbols": {
      for (const entry of index) {
        if (getExports(entry).has(value)) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    case "apis": {
      const routePath = value.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, "");
      for (const entry of index) {
        if (getContent(entry).includes(routePath)) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    case "events": {
      for (const entry of index) {
        if (getContent(entry).includes(value)) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    case "schemas": {
      for (const entry of index) {
        if (getContent(entry).includes(value)) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    default: {
      // Generic string search for infra, catalogRefs, iam, network, other
      for (const entry of index) {
        const content = getContent(entry);
        if (
          content.includes(value) ||
          content.includes(`"${value}"`) ||
          content.includes(`'${value}'`)
        ) {
          foundIn.push(entry.relativePath);
        }
      }
    }
  }

  return foundIn;
}

// ─── EA Resolver Interface ──────────────────────────────────────────────────────

/**
 * EA Anchors Resolver — resolves EA artifact anchors against source code.
 *
 * For each artifact with `anchors`, scans source files for matching symbols,
 * routes, events, schemas, etc. Reports findings as ObservedEntity entries.
 */
export class AnchorsResolver implements EaResolver {
  readonly name = "anchors";
  readonly description = "Resolves EA artifact anchors against source code";

  private sourceRoots: string[];
  private sourceGlobs: string[];

  constructor(options?: { sourceRoots?: string[]; sourceGlobs?: string[] }) {
    this.sourceRoots = options?.sourceRoots ?? ["src"];
    this.sourceGlobs = options?.sourceGlobs ?? DEFAULT_SOURCE_GLOBS;
  }

  async resolve(ctx: EaResolverContext): Promise<ObservedEaState> {
    const entities: ObservedEntity[] = [];
    const artifacts = ctx.artifacts ?? [];

    for (const artifact of artifacts) {
      if (!artifact.anchors) continue;

      const anchorsMap: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(artifact.anchors)) {
        if (Array.isArray(value) && value.length > 0) {
          anchorsMap[key] = value as string[];
        }
      }

      if (Object.keys(anchorsMap).length === 0) continue;

      const result = scanAnchors(
        anchorsMap,
        ctx.projectRoot,
        this.sourceRoots,
        this.sourceGlobs,
      );

      // Report each anchor as an observed entity
      for (const match of result.matches) {
        entities.push({
          externalId: `${artifact.id}:anchor:${match.anchorType}:${match.anchorValue}`,
          inferredKind: artifact.kind,
          matchedArtifactId: artifact.id,
          metadata: {
            name: `${match.anchorType}/${match.anchorValue}`,
            anchorType: match.anchorType,
            anchorValue: match.anchorValue,
            status: "found",
            foundIn: match.foundIn,
          },
        });
      }

      for (const miss of result.missing) {
        entities.push({
          externalId: `${artifact.id}:anchor:${miss.anchorType}:${miss.anchorValue}`,
          inferredKind: artifact.kind,
          matchedArtifactId: artifact.id,
          metadata: {
            name: `${miss.anchorType}/${miss.anchorValue}`,
            anchorType: miss.anchorType,
            anchorValue: miss.anchorValue,
            status: "missing",
            foundIn: [],
          },
        });
      }
    }

    return {
      source: this.name,
      collectedAt: new Date().toISOString(),
      entities,
      relationships: [],
    };
  }
}
