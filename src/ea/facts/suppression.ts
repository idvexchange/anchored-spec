/**
 * @module facts/suppression
 *
 * Inline suppression engine (Phase 4).
 * Matches consistency findings to @ea:suppress annotations
 * and marks matched findings as suppressed.
 */

import type { SuppressionAnnotation } from "./types.js";
import type { ConsistencyFinding } from "./consistency.js";

// ─── Rule Matching ──────────────────────────────────────────────────

/**
 * Check if a finding rule matches a suppression pattern.
 * Supports exact match and glob-style trailing wildcard.
 */
function matchesRule(rule: string, pattern: string): boolean {
  if (rule === pattern) return true;
  if (pattern.endsWith("*")) {
    return rule.startsWith(pattern.slice(0, -1));
  }
  return false;
}

// ─── Suppression Application ────────────────────────────────────────

/**
 * Apply inline suppressions to consistency findings.
 * Modifies findings in-place, setting `suppressed` and `suppressedBy`.
 */
export function applySuppressions(
  findings: ConsistencyFinding[],
  suppressions: Map<string, SuppressionAnnotation[]>,
): void {
  for (const finding of findings) {
    for (const location of finding.locations) {
      const fileSuppressions = suppressions.get(location.file);
      if (!fileSuppressions) continue;

      for (const suppression of fileSuppressions) {
        if (
          matchesRule(finding.rule, suppression.ruleId) &&
          location.line >= suppression.line &&
          location.line <= (suppression.endLine ?? Infinity)
        ) {
          finding.suppressed = true;
          finding.suppressedBy = {
            file: location.file,
            reason: suppression.reason,
          };
          break;
        }
      }
      if (finding.suppressed) break;
    }
  }
}

// ─── Suppression Collection ─────────────────────────────────────────

/**
 * Collect all suppression annotations from a set of parsed documents.
 * Returns a map keyed by file path.
 */
export function collectSuppressions(
  manifests: { source: string; suppressions: SuppressionAnnotation[] }[],
): Map<string, SuppressionAnnotation[]> {
  const map = new Map<string, SuppressionAnnotation[]>();
  for (const m of manifests) {
    if (m.suppressions.length > 0) {
      map.set(m.source, m.suppressions);
    }
  }
  return map;
}
