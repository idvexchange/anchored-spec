/**
 * @module facts/annotator
 *
 * Scans markdown documents for classifiable blocks that lack @anchored-spec:*
 * annotations and produces suggestions for adding them.
 */

import type { FactBlock, FactManifest, FactKind } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface AnnotationSuggestion {
  /** Relative file path */
  file: string;
  /** Line number BEFORE which to insert the annotation (1-based) */
  line: number;
  /** The annotation comment to insert */
  annotation: string;
  /** Line number AFTER which to insert @anchored-spec:end (1-based) */
  endLine: number;
  /** The end annotation comment */
  endAnnotation: string;
  /** Classified fact kind */
  kind: FactKind;
  /** Classification confidence */
  confidence: "high" | "medium";
  /** Reason for the suggestion */
  reason: string;
}

// ─── Kind → Annotation Name ─────────────────────────────────────────

const KIND_TO_ANNOTATION: Partial<Record<FactKind, string>> = {
  "event-table": "events",
  "status-enum": "states",
  "endpoint-table": "endpoints",
  "entity-fields": "entities",
  "type-enum": "enums",
  "payload-schema": "schema",
  "state-transition": "transitions",
  "assurance-level": "events",
  "provider-table": "events",
};

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Analyze manifests and suggest annotations for unannotated blocks.
 */
export function suggestAnnotations(
  manifests: FactManifest[],
): AnnotationSuggestion[] {
  const suggestions: AnnotationSuggestion[] = [];

  for (const manifest of manifests) {
    for (const block of manifest.blocks) {
      // Skip blocks that already have annotations
      if (block.annotation) continue;

      // Skip blocks with no facts (nothing to annotate)
      if (block.facts.length === 0) continue;

      // Skip kinds we don't have annotation names for
      const annotationName = KIND_TO_ANNOTATION[block.kind];
      if (!annotationName) continue;

      const suggestion = buildSuggestion(block, manifest.source, annotationName);
      if (suggestion) suggestions.push(suggestion);
    }
  }

  return suggestions;
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildSuggestion(
  block: FactBlock,
  file: string,
  annotationName: string,
): AnnotationSuggestion | null {
  const startLine = block.source.line;
  const endLine = block.source.endLine ?? lastFactLine(block);

  if (!startLine || startLine < 1) return null;

  // Generate a stable block ID from the first fact key
  const firstKey = block.facts[0]?.key;
  const blockId = firstKey
    ? slugifyBlockId(firstKey)
    : undefined;

  const annotation = blockId
    ? `<!-- @anchored-spec:${annotationName} ${blockId} -->`
    : `<!-- @anchored-spec:${annotationName} -->`;

  // Determine confidence based on number of matching facts
  const confidence: "high" | "medium" = block.facts.length >= 3 ? "high" : "medium";

  // Build reason from fact keys
  const keyPreview = block.facts
    .slice(0, 3)
    .map((f) => f.key)
    .join(", ");
  const suffix = block.facts.length > 3 ? `, +${block.facts.length - 3} more` : "";

  return {
    file,
    line: startLine,
    endLine,
    annotation,
    endAnnotation: "<!-- @anchored-spec:end -->",
    kind: block.kind,
    confidence,
    reason: `${block.kind} block with ${block.facts.length} fact(s): ${keyPreview}${suffix}`,
  };
}

function lastFactLine(block: FactBlock): number {
  let max = block.source.line;
  for (const fact of block.facts) {
    const end = fact.source.endLine ?? fact.source.line;
    if (end > max) max = end;
  }
  return max;
}

function slugifyBlockId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
