/**
 * Anchored Spec — Fact Extractor Orchestrator
 *
 * Runs all registered extractors against a parsed markdown document
 * and builds complete fact manifests.
 */

import type { FactBlock, FactExtractor, FactManifest, MarkdownDocument } from "../types.js";
import { tableExtractor } from "./table-extractor.js";
import { codeBlockExtractor } from "./code-block-extractor.js";
import { mermaidExtractor } from "./mermaid-extractor.js";
import { headingListExtractor } from "./heading-list-extractor.js";
import { frontmatterExtractor } from "./frontmatter-extractor.js";

const DEFAULT_EXTRACTORS: FactExtractor[] = [
  tableExtractor,
  codeBlockExtractor,
  mermaidExtractor,
  headingListExtractor,
  frontmatterExtractor,
];

/**
 * Run all registered extractors against a parsed markdown document.
 */
export function extractFacts(
  doc: MarkdownDocument,
  extractors: FactExtractor[] = DEFAULT_EXTRACTORS,
): FactBlock[] {
  const blocks: FactBlock[] = [];
  for (const extractor of extractors) {
    blocks.push(...extractor.extract(doc));
  }
  return blocks;
}

/**
 * Build a complete fact manifest for a document.
 */
export function buildFactManifest(
  doc: MarkdownDocument,
  extractors?: FactExtractor[],
): FactManifest {
  const blocks = extractFacts(doc, extractors);
  const totalFacts = blocks.reduce((sum, b) => sum + b.facts.length, 0);
  return {
    source: doc.filePath,
    extractedAt: new Date().toISOString(),
    blocks,
    totalFacts,
    suppressions: doc.suppressions.length > 0 ? doc.suppressions : undefined,
    markers: doc.markers.length > 0 ? doc.markers : undefined,
  };
}

// Re-export individual extractors for external use
export { tableExtractor } from "./table-extractor.js";
export { codeBlockExtractor } from "./code-block-extractor.js";
export { mermaidExtractor } from "./mermaid-extractor.js";
export { headingListExtractor } from "./heading-list-extractor.js";
export { frontmatterExtractor } from "./frontmatter-extractor.js";
