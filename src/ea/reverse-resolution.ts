/**
 * Anchored Spec — Reverse Resolution
 *
 * Maps file paths, symbols, and git diffs back to entity refs.
 * Four resolution strategies ordered by confidence:
 *   1. Doc frontmatter ea-artifacts → entity refs (high)
 *   2. Source @anchored-spec annotations → entity refs (high)
 *   3. Entity spec.anchors reverse matching → entity refs (medium)
 *   4. Heuristic path prefix / naming convention → entity refs (low)
 *
 * Design reference: Intelligence Layer Plan §Phase I1
 */

import { execSync } from "node:child_process";
import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityId,
  getEntityTraceRefs,
  getEntityAnchors,
} from "./backstage/accessors.js";
import type { ScannedDoc } from "./docs/scanner.js";
import type { ResolverCache } from "./cache.js";

// ─── Types ────────────────────────────────────────────────────────────

export type ResolutionConfidence = "high" | "medium" | "low";

export type ResolutionStrategy =
  | "doc-frontmatter"
  | "source-annotation"
  | "anchor-match"
  | "heuristic";

export interface ResolutionResult {
  inputKind: "file" | "symbol" | "diff";
  inputValue: string;
  resolvedEntityRef: string;
  confidence: ResolutionConfidence;
  evidence: string;
  strategy: ResolutionStrategy;
}

interface IndexEntry {
  entityRef: string;
  confidence: ResolutionConfidence;
  evidence: string;
  strategy: ResolutionStrategy;
}

export interface ReverseIndex {
  /** file path → entity refs (from traceRefs, role=implementation or any) */
  fileToEntities: Map<string, IndexEntry[]>;
  /** symbol name → entity refs (from spec.anchors.symbols, .apis, .events) */
  symbolToEntities: Map<string, IndexEntry[]>;
}

export interface DiffInput {
  /** Git ref range like "HEAD~1..HEAD" or "main..feature" */
  refRange?: string;
  /** Use staged changes */
  staged?: boolean;
  /** Read diff from string (e.g., stdin) */
  raw?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function confidenceOrder(c: ResolutionConfidence): number {
  switch (c) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
  }
}

// ─── Build Index ──────────────────────────────────────────────────────

export function buildReverseIndex(
  entities: BackstageEntity[],
  docs?: ScannedDoc[],
  _cwd?: string,
): ReverseIndex {
  const fileToEntities = new Map<string, IndexEntry[]>();
  const symbolToEntities = new Map<string, IndexEntry[]>();

  const addFile = (path: string, entry: IndexEntry) => {
    const normalized = path.replace(/^\.\//, "");
    const existing = fileToEntities.get(normalized) ?? [];
    if (
      !existing.some(
        (e) =>
          e.entityRef === entry.entityRef && e.strategy === entry.strategy,
      )
    ) {
      existing.push(entry);
      fileToEntities.set(normalized, existing);
    }
  };

  const addSymbol = (symbol: string, entry: IndexEntry) => {
    const existing = symbolToEntities.get(symbol) ?? [];
    if (
      !existing.some(
        (e) =>
          e.entityRef === entry.entityRef && e.strategy === entry.strategy,
      )
    ) {
      existing.push(entry);
      symbolToEntities.set(symbol, existing);
    }
  };

  // Strategy 1: Doc frontmatter (high confidence)
  if (docs) {
    for (const doc of docs) {
      for (const artifactId of doc.artifactIds) {
        addFile(doc.relativePath, {
          entityRef: artifactId,
          confidence: "high",
          evidence: `doc frontmatter ea-artifacts includes "${artifactId}"`,
          strategy: "doc-frontmatter",
        });
      }
    }
  }

  // Strategy 2: Entity traceRefs (high confidence)
  for (const entity of entities) {
    const entityRef = getEntityId(entity);
    for (const ref of getEntityTraceRefs(entity)) {
      if (ref.path.startsWith("http://") || ref.path.startsWith("https://"))
        continue;
      addFile(ref.path, {
        entityRef,
        confidence: "high",
        evidence: `traceRef[role=${ref.role ?? "unspecified"}]`,
        strategy: "source-annotation",
      });
    }
  }

  // Strategy 3: Entity anchors (medium confidence)
  for (const entity of entities) {
    const entityRef = getEntityId(entity);
    const anchors = getEntityAnchors(entity);
    if (!anchors) continue;

    const symbolFields = ["symbols", "apis", "events", "schemas"] as const;
    for (const field of symbolFields) {
      const values = (anchors as Record<string, unknown>)[field];
      if (Array.isArray(values)) {
        for (const value of values) {
          if (typeof value === "string") {
            addSymbol(value, {
              entityRef,
              confidence: "medium",
              evidence: `anchor:${field}`,
              strategy: "anchor-match",
            });
            // If the anchor value looks like a file path, also add to file index
            if (value.includes("/") || value.includes(".")) {
              addFile(value, {
                entityRef,
                confidence: "medium",
                evidence: `anchor:${field}`,
                strategy: "anchor-match",
              });
            }
          }
        }
      }
    }

    // Infra anchors → might be file paths
    const infraValues = (anchors as Record<string, unknown>).infra;
    if (Array.isArray(infraValues)) {
      for (const value of infraValues) {
        if (typeof value === "string") {
          addSymbol(value, {
            entityRef,
            confidence: "medium",
            evidence: "anchor:infra",
            strategy: "anchor-match",
          });
        }
      }
    }
  }

  return { fileToEntities, symbolToEntities };
}

// ─── Resolve from files ───────────────────────────────────────────────

export function resolveFromFiles(
  files: string[],
  entities: BackstageEntity[],
  docs?: ScannedDoc[],
  cwd?: string,
): ResolutionResult[] {
  const index = buildReverseIndex(entities, docs, cwd);
  const results: ResolutionResult[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const normalized = file.replace(/^\.\//, "");
    const matches = index.fileToEntities.get(normalized);

    if (matches) {
      for (const match of matches) {
        const key = `${normalized}::${match.entityRef}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          inputKind: "file",
          inputValue: normalized,
          resolvedEntityRef: match.entityRef,
          confidence: match.confidence,
          evidence: match.evidence,
          strategy: match.strategy,
        });
      }
    } else {
      // Heuristic fallback: check if file path overlaps with any traceRef
      for (const entity of entities) {
        const entityRef = getEntityId(entity);
        for (const ref of getEntityTraceRefs(entity)) {
          if (
            ref.path.includes(normalized) ||
            normalized.includes(ref.path.replace(/^\.\//, ""))
          ) {
            const key = `${normalized}::${entityRef}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push({
              inputKind: "file",
              inputValue: normalized,
              resolvedEntityRef: entityRef,
              confidence: "low",
              evidence: `heuristic: path overlap with traceRef "${ref.path}"`,
              strategy: "heuristic",
            });
          }
        }
      }
    }
  }

  return results.sort(
    (a, b) => confidenceOrder(a.confidence) - confidenceOrder(b.confidence),
  );
}

// ─── Resolve from symbols ─────────────────────────────────────────────

export function resolveFromSymbols(
  symbols: string[],
  entities: BackstageEntity[],
  docs?: ScannedDoc[],
): ResolutionResult[] {
  const index = buildReverseIndex(entities, docs);
  const results: ResolutionResult[] = [];
  const seen = new Set<string>();

  for (const symbol of symbols) {
    const matches = index.symbolToEntities.get(symbol);
    if (matches) {
      for (const match of matches) {
        const key = `${symbol}::${match.entityRef}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          inputKind: "symbol",
          inputValue: symbol,
          resolvedEntityRef: match.entityRef,
          confidence: match.confidence,
          evidence: match.evidence,
          strategy: match.strategy,
        });
      }
    }
    // No heuristic fallback for symbols — too noisy
  }

  return results.sort(
    (a, b) => confidenceOrder(a.confidence) - confidenceOrder(b.confidence),
  );
}

// ─── Resolve from diff ────────────────────────────────────────────────

export function resolveFromDiff(
  input: DiffInput,
  entities: BackstageEntity[],
  docs?: ScannedDoc[],
  cwd?: string,
): ResolutionResult[] {
  const changedFiles = extractChangedFiles(input, cwd);
  if (changedFiles.length === 0) return [];

  const results = resolveFromFiles(changedFiles, entities, docs, cwd);

  // Re-tag inputKind as "diff"
  return results.map((r) => ({ ...r, inputKind: "diff" as const }));
}

/** Extract changed file paths from a git diff. */
export function extractChangedFiles(
  input: DiffInput,
  cwd?: string,
): string[] {
  const execOpts = { cwd: cwd ?? process.cwd(), encoding: "utf-8" as const };

  if (input.raw != null) {
    return parseDiffForFiles(input.raw);
  }

  if (input.staged) {
    const output = execSync("git diff --cached --name-only", execOpts);
    return output.trim().split("\n").filter(Boolean);
  }

  if (input.refRange) {
    const output = execSync(
      `git diff --name-only ${input.refRange}`,
      execOpts,
    );
    return output.trim().split("\n").filter(Boolean);
  }

  // Default: unstaged changes
  const output = execSync("git diff --name-only", execOpts);
  return output.trim().split("\n").filter(Boolean);
}

/** Parse a unified diff to extract changed file paths. */
function parseDiffForFiles(diffText: string): string[] {
  const files = new Set<string>();
  for (const line of diffText.split("\n")) {
    const gitDiffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitDiffMatch) {
      files.add(gitDiffMatch[2]!);
      continue;
    }
    const plusMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusMatch) {
      files.add(plusMatch[1]!);
    }
  }
  return [...files];
}

// ─── Cached resolution ───────────────────────────────────────────────

const CACHE_KEY = "reverse-resolution-index";

export interface CachedReverseIndex {
  fileToEntities: Record<string, IndexEntry[]>;
  symbolToEntities: Record<string, IndexEntry[]>;
}

/**
 * Build a reverse index with optional caching.
 * If a cache is provided and has a valid entry, returns that.
 * Otherwise builds a fresh index and caches it.
 */
export function buildReverseIndexCached(
  entities: BackstageEntity[],
  docs?: ScannedDoc[],
  cwd?: string,
  cache?: ResolverCache,
): ReverseIndex {
  if (cache) {
    const cached = cache.get<CachedReverseIndex>(CACHE_KEY);
    if (cached) {
      return {
        fileToEntities: new Map(Object.entries(cached.fileToEntities)),
        symbolToEntities: new Map(Object.entries(cached.symbolToEntities)),
      };
    }
  }

  const index = buildReverseIndex(entities, docs, cwd);

  if (cache) {
    const serializable: CachedReverseIndex = {
      fileToEntities: Object.fromEntries(index.fileToEntities),
      symbolToEntities: Object.fromEntries(index.symbolToEntities),
    };
    cache.set(CACHE_KEY, serializable);
  }

  return index;
}
