/**
 * Anchored Spec — Impact Analysis
 *
 * Maps file paths to affected requirements by matching against
 * change scopes, semantic refs, and test refs.
 */

import { readFileSync } from "node:fs";
import { relative, extname } from "node:path";
import { minimatch } from "minimatch";
import type { Requirement, Change, DriftResolver, SemanticRefKind } from "./types.js";
import { discoverSourceFiles } from "./files.js";

export interface ImpactMatch {
  reqId: string;
  matchReason: "scope" | "semanticRef" | "testRef";
  details: string;
}

export interface ImpactResult {
  path: string;
  matchedRequirements: ImpactMatch[];
}

export interface ImpactMap {
  generatedAt: string;
  entries: ImpactResult[];
}

/**
 * Analyze which requirements are affected by given file paths.
 */
export function analyzeImpact(
  paths: string[],
  requirements: Requirement[],
  changes: Change[],
  options?: { resolvers?: DriftResolver[] },
): ImpactResult[] {
  const results: ImpactResult[] = [];

  // Build change→requirement map
  const changeReqMap = new Map<string, string[]>();
  for (const chg of changes) {
    if (chg.status === "complete" || chg.status === "cancelled") continue;
    changeReqMap.set(chg.id, chg.requirements ?? []);
  }

  for (const filePath of paths) {
    const matches: ImpactMatch[] = [];

    // 1. Check change scopes
    for (const chg of changes) {
      if (chg.status === "complete" || chg.status === "cancelled") continue;
      const includePatterns = chg.scope?.include ?? [];
      const excludePatterns = chg.scope?.exclude ?? [];

      const included = includePatterns.some((p: string) => minimatch(filePath, p));
      const excluded = excludePatterns.some((p: string) => minimatch(filePath, p));

      if (included && !excluded) {
        for (const reqId of chg.requirements ?? []) {
          matches.push({
            reqId,
            matchReason: "scope",
            details: `File matches scope of ${chg.id}`,
          });
        }
      }
    }

    // 2. Check semantic refs (file content matching)
    for (const req of requirements) {
      if (req.status !== "active" && req.status !== "shipped") continue;

      if (req.semanticRefs) {
        const allRefs: Array<{ kind: SemanticRefKind; ref: string }> = [
          ...(req.semanticRefs.interfaces ?? []).map((r) => ({ kind: "interface" as const, ref: r })),
          ...(req.semanticRefs.symbols ?? []).map((r) => ({ kind: "symbol" as const, ref: r })),
          ...(req.semanticRefs.routes ?? []).map((r) => ({ kind: "route" as const, ref: r })),
          ...(req.semanticRefs.errorCodes ?? []).map((r) => ({ kind: "errorCode" as const, ref: r })),
        ];

        const ext = extname(filePath);
        if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext) && allRefs.length > 0) {
          try {
            const content = readFileSync(filePath, "utf-8");
            for (const { kind, ref } of allRefs) {
              if (content.includes(ref)) {
                matches.push({
                  reqId: req.id,
                  matchReason: "semanticRef",
                  details: `File contains ${kind} "${ref}"`,
                });
              }
            }
          } catch {
            // File not readable
          }
        }
      }

      // 3. Check test refs
      for (const testRef of req.verification?.testRefs ?? []) {
        if (testRef.path === filePath || filePath.endsWith(testRef.path)) {
          matches.push({
            reqId: req.id,
            matchReason: "testRef",
            details: `File is a testRef for ${req.id}`,
          });
        }
      }
      for (const testFile of req.verification?.testFiles ?? []) {
        if (testFile === filePath || filePath.endsWith(testFile)) {
          matches.push({
            reqId: req.id,
            matchReason: "testRef",
            details: `File is in testFiles for ${req.id}`,
          });
        }
      }
    }

    // Deduplicate
    const unique = new Map<string, ImpactMatch>();
    for (const m of matches) {
      const key = `${m.reqId}:${m.matchReason}`;
      if (!unique.has(key)) unique.set(key, m);
    }

    results.push({
      path: filePath,
      matchedRequirements: [...unique.values()],
    });
  }

  return results;
}

/**
 * Generate a full impact map for all governed paths.
 */
export function generateImpactMap(
  requirements: Requirement[],
  changes: Change[],
  projectRoot: string,
  sourceRoots?: string[],
): ImpactMap {
  const roots = sourceRoots ?? ["src"];
  const files = discoverSourceFiles(roots, ["**/*"], projectRoot);

  const entries = analyzeImpact(
    files.map((f) => relative(projectRoot, f)),
    requirements,
    changes,
  ).filter((e) => e.matchedRequirements.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    entries,
  };
}
