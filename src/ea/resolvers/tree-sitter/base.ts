/**
 * Anchored Spec — Tree-sitter Discovery Resolver
 *
 * Language-agnostic code analysis resolver using web-tree-sitter (WASM).
 * Parses source files and runs declarative query packs to discover
 * EA entities from code patterns (routes, DB access, events, etc.).
 *
 * web-tree-sitter is an optional peer dependency. If not installed,
 * this resolver throws a helpful error on first use.
 */

import { join, relative } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import type { EaResolverContext } from "../types.js";
import type { EntityDraft } from "../../discovery.js";
import type { QueryPack, QueryMatch } from "./types.js";
import { aggregateMatches } from "./aggregator.js";

// Lazy-loaded web-tree-sitter types
type TreeSitterParser = {
  setLanguage(lang: unknown): void;
  parse(input: string): { rootNode: TreeSitterNode };
};

type TreeSitterNode = {
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
};

type TreeSitterLanguage = {
  query(source: string): TreeSitterQuery;
};

type TreeSitterQuery = {
  matches(node: TreeSitterNode): TreeSitterQueryMatch[];
};

type TreeSitterQueryMatch = {
  captures: Array<{
    name: string;
    node: TreeSitterNode & { text: string };
  }>;
};

type TreeSitterModule = {
  default?: { init(): Promise<void> };
  init?(): Promise<void>;
  Parser: new () => TreeSitterParser;
  Language: { load(path: string): Promise<TreeSitterLanguage> };
};

// ─── Module state ────────────────────────────────────────────────────────────────

let treeSitterModule: TreeSitterModule | null = null;
let initialized = false;
const languageCache = new Map<string, TreeSitterLanguage>();

function loadTreeSitter(): TreeSitterModule {
  if (treeSitterModule) return treeSitterModule;
  try {
    const esmRequire = createRequire(import.meta.url);
    treeSitterModule = esmRequire("web-tree-sitter") as TreeSitterModule;
    return treeSitterModule;
  } catch {
    throw new Error(
      "web-tree-sitter is required for the Tree-sitter discovery resolver. " +
        "Install it: npm install -D web-tree-sitter",
    );
  }
}

async function ensureInit(): Promise<void> {
  if (initialized) return;
  const mod = loadTreeSitter();
  const initFn = mod.default?.init ?? mod.init;
  if (initFn) {
    await initFn();
  }
  initialized = true;
}

async function getLanguage(langName: string): Promise<TreeSitterLanguage> {
  const cached = languageCache.get(langName);
  if (cached) return cached;

  const mod = loadTreeSitter();

  // Try common WASM file locations
  const wasmPaths = [
    `tree-sitter-${langName}.wasm`,
    `tree-sitter-${langName}/tree-sitter-${langName}.wasm`,
    `node_modules/tree-sitter-${langName}/tree-sitter-${langName}.wasm`,
  ];

  // Try to locate via require.resolve
  const esmRequire = createRequire(import.meta.url);
  for (const wasmPath of wasmPaths) {
    try {
      const resolved = esmRequire.resolve(wasmPath);
      const lang = await mod.Language.load(resolved);
      languageCache.set(langName, lang);
      return lang;
    } catch {
      // Try next path
    }
  }

  throw new Error(
    `Tree-sitter grammar for "${langName}" not found. ` +
      `Install it: npm install -D tree-sitter-${langName}`,
  );
}

// ─── File matching ──────────────────────────────────────────────────────────────

/** Simple glob matching (supports *, **, and file extensions). */
function matchesGlob(filePath: string, glob: string): boolean {
  const pattern = glob
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${pattern}$`).test(filePath);
}

function fileMatchesPack(filePath: string, pack: QueryPack): boolean {
  return pack.fileGlobs.some((glob) => matchesGlob(filePath, glob));
}

// ─── Query execution ────────────────────────────────────────────────────────────

async function runQueriesOnFile(
  filePath: string,
  relPath: string,
  language: TreeSitterLanguage,
  pack: QueryPack,
): Promise<QueryMatch[]> {
  const mod = loadTreeSitter();
  const parser = new mod.Parser();
  parser.setLanguage(language);

  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const tree = parser.parse(source);
  const matches: QueryMatch[] = [];

  for (const pattern of pack.patterns) {
    try {
      const query = language.query(pattern.query);
      const queryMatches = query.matches(tree.rootNode);

      for (const match of queryMatches) {
        const captures: Record<string, string> = {};
        let startLine = Infinity;
        let endLine = 0;

        for (const capture of match.captures) {
          captures[`@${capture.name}`] = capture.node.text;
          startLine = Math.min(startLine, capture.node.startPosition.row);
          endLine = Math.max(endLine, capture.node.endPosition.row);
        }

        matches.push({
          pattern,
          file: relPath,
          captures,
          startLine: startLine === Infinity ? 0 : startLine,
          endLine,
        });
      }
    } catch {
      // Skip patterns that fail to compile or execute
    }
  }

  return matches;
}

// ─── Source file enumeration ────────────────────────────────────────────────────

function enumerateSourceFiles(
  ctx: EaResolverContext,
  packs: QueryPack[],
): Array<{ absPath: string; relPath: string }> {
  // Collect all file globs from all packs
  const allGlobs = new Set<string>();
  for (const pack of packs) {
    for (const glob of pack.fileGlobs) {
      allGlobs.add(glob);
    }
  }

  // Use a simple fs walk (similar to existing resolvers)
  const files: Array<{ absPath: string; relPath: string }> = [];
  const excludeDirs = new Set(["node_modules", ".git", "dist", ".next", "__pycache__", "vendor", "target", "build"]);

  function walk(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".") continue;
        if (excludeDirs.has(entry.name)) continue;

        const absPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absPath);
        } else if (entry.isFile()) {
          const relPath = relative(ctx.projectRoot, absPath);
          // Check if any pack cares about this file
          for (const pack of packs) {
            if (fileMatchesPack(relPath, pack)) {
              files.push({ absPath, relPath });
              break;
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  const scanRoot = ctx.source ? join(ctx.projectRoot, ctx.source) : ctx.projectRoot;
  try {
    const stat = statSync(scanRoot);
    if (stat.isDirectory()) {
      walk(scanRoot);
    }
  } catch {
    // Source directory doesn't exist
  }

  return files;
}

// ─── Resolver ───────────────────────────────────────────────────────────────────

/**
 * Tree-sitter discovery resolver.
 *
 * Uses web-tree-sitter (WASM) to parse source files and run declarative
 * query packs that detect code patterns (routes, DB access, events, etc.),
 * producing draft EA entities.
 */
export class TreeSitterDiscoveryResolver {
  name = "tree-sitter";

  constructor(private queryPacks: QueryPack[]) {}

  async discoverEntities(ctx: EaResolverContext): Promise<EntityDraft[] | null> {
    if (this.queryPacks.length === 0) {
      ctx.logger.warn("No query packs configured for tree-sitter resolver");
      return null;
    }

    await ensureInit();

    // Group packs by language
    const packsByLang = new Map<string, QueryPack[]>();
    for (const pack of this.queryPacks) {
      const existing = packsByLang.get(pack.language) ?? [];
      existing.push(pack);
      packsByLang.set(pack.language, existing);
    }

    // Enumerate source files
    const files = enumerateSourceFiles(ctx, this.queryPacks);
    ctx.logger.info(`Tree-sitter: scanning ${files.length} source files across ${packsByLang.size} language(s)`);

    // Run queries
    const allMatches: QueryMatch[] = [];

    for (const [langName, packs] of packsByLang) {
      let language: TreeSitterLanguage;
      try {
        language = await getLanguage(langName);
      } catch (err) {
        ctx.logger.warn(`Skipping language "${langName}": ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      for (const file of files) {
        for (const pack of packs) {
          if (!fileMatchesPack(file.relPath, pack)) continue;
          const matches = await runQueriesOnFile(file.absPath, file.relPath, language, pack);
          allMatches.push(...matches);
        }
      }
    }

    ctx.logger.info(`Tree-sitter: found ${allMatches.length} pattern matches`);

    if (allMatches.length === 0) return null;

    // Aggregate matches into artifact drafts
    const drafts = aggregateMatches(allMatches, ctx.entities);
    ctx.logger.info(`Tree-sitter: aggregated into ${drafts.length} draft artifact(s)`);

    return drafts.length > 0 ? drafts : null;
  }
}

/** Reset module state (for testing). */
export function resetTreeSitterCache(): void {
  treeSitterModule = null;
  initialized = false;
  languageCache.clear();
}
