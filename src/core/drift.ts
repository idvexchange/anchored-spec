/**
 * Anchored Spec — Semantic Drift Detection
 *
 * Scans source files to verify that semanticRefs (interfaces, routes,
 * error codes, symbols) still exist in the codebase. Supports pluggable
 * resolvers with fallback to the built-in regex scanner.
 */

import { readFileSync } from "node:fs";
import { relative, extname } from "node:path";
import type {
  Requirement,
  DriftFinding,
  DriftReport,
  DriftResolver,
  DriftResolveContext,
  SemanticRefKind,
} from "./types.js";
import { discoverSourceFiles } from "./files.js";

// ─── Default configuration ─────────────────────────────────────────────────────

const DEFAULT_SOURCE_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"];
const DRIFT_IGNORE = [
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

// ─── Symbol scanning patterns ───────────────────────────────────────────────────

const TS_EXPORT_PATTERNS = [
  /export\s+(?:declare\s+)?(?:interface|class|abstract\s+class|function|const|let|var|type|enum)\s+(\w+)/g,
  /export\s+default\s+(?:class|function)\s+(\w+)/g,
  /export\s*\{([^}]+)\}/g,
];

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

function fileContainsString(content: string, needle: string): boolean {
  return content.includes(needle);
}

// ─── Lazy file index ────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  relativePath: string;
  _content?: string;
  _exports?: Set<string>;
}

function buildFileIndex(files: string[], projectRoot: string): FileEntry[] {
  return files.map((f) => ({
    path: f,
    relativePath: relative(projectRoot, f),
  }));
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

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function getExports(entry: FileEntry): Set<string> {
  if (entry._exports === undefined) {
    const ext = extname(entry.path);
    entry._exports = TS_EXTENSIONS.has(ext)
      ? extractExportedSymbols(getContent(entry))
      : new Set<string>();
  }
  return entry._exports;
}

// ─── Built-in Resolver ──────────────────────────────────────────────────────────

function builtinResolve(
  index: FileEntry[],
  kind: SemanticRefKind,
  ref: string,
): string[] {
  const foundIn: string[] = [];

  switch (kind) {
    case "interface":
    case "symbol": {
      for (const entry of index) {
        if (getExports(entry).has(ref)) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    case "route": {
      const routePath = ref.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, "");
      for (const entry of index) {
        if (fileContainsString(getContent(entry), routePath)) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    case "errorCode": {
      for (const entry of index) {
        const content = getContent(entry);
        if (
          fileContainsString(content, `"${ref}"`) ||
          fileContainsString(content, `'${ref}'`) ||
          fileContainsString(content, `\`${ref}\``)
        ) {
          foundIn.push(entry.relativePath);
        }
      }
      break;
    }
    case "schema": {
      for (const entry of index) {
        if (fileContainsString(getContent(entry), ref)) {
          foundIn.push(entry.relativePath);
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
  /** Custom resolvers — tried in order before the built-in scanner. */
  resolvers?: DriftResolver[];
}

export function detectDrift(
  requirements: Requirement[],
  options: DriftOptions,
): DriftReport {
  const roots = options.sourceRoots ?? ["src"];
  const globs = options.sourceGlobs ?? DEFAULT_SOURCE_GLOBS;
  const resolvers = options.resolvers ?? [];

  const files = discoverSourceFiles(roots, globs, options.projectRoot, {
    ignore: DRIFT_IGNORE,
  });
  const index = buildFileIndex(files, options.projectRoot);

  const ctx: DriftResolveContext = {
    projectRoot: options.projectRoot,
    fileIndex: index.map((e) => ({ path: e.path, relativePath: e.relativePath })),
  };

  const findings: DriftFinding[] = [];

  for (const req of requirements) {
    if (!req.semanticRefs) continue;
    if (req.status !== "active" && req.status !== "shipped") continue;

    const refEntries: Array<{ kind: SemanticRefKind; refs: string[] }> = [
      { kind: "interface", refs: req.semanticRefs.interfaces ?? [] },
      { kind: "route", refs: req.semanticRefs.routes ?? [] },
      { kind: "errorCode", refs: req.semanticRefs.errorCodes ?? [] },
      { kind: "symbol", refs: req.semanticRefs.symbols ?? [] },
      { kind: "schema", refs: req.semanticRefs.schemas ?? [] },
    ];

    // Include custom ref kinds from `other` map
    if (req.semanticRefs.other) {
      for (const [customKind, refs] of Object.entries(req.semanticRefs.other)) {
        refEntries.push({ kind: customKind, refs });
      }
    }

    for (const { kind, refs } of refEntries) {
      for (const ref of refs) {
        let foundIn: string[] | null = null;

        // Try custom resolvers first
        for (const resolver of resolvers) {
          if (resolver.kinds && !resolver.kinds.includes(kind)) continue;
          const result = resolver.resolve(kind, ref, ctx);
          if (result !== null) {
            foundIn = result;
            break;
          }
        }

        // Fallback to built-in scanner (only for standard kinds)
        const standardKinds = ["interface", "route", "errorCode", "symbol", "schema"];
        if (foundIn === null && standardKinds.includes(kind)) {
          foundIn = builtinResolve(index, kind, ref);
        }

        // Custom kinds with no resolver match are reported as missing
        // only if a resolver explicitly returned [] (short-circuit).
        // If no resolver handled it at all, skip the finding.
        if (foundIn === null) continue;

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
