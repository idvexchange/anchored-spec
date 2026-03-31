/**
 * @module facts
 *
 * Fact extraction system for anchored-spec markdown prose resolution.
 * Re-exports all public types, constants, and interfaces.
 */

export type {
  FactKind,
  FactSource,
  ExtractedFact,
  FactAnnotation,
  SuppressionAnnotation,
  DocumentMarker,
  FactBlock,
  FactManifest,
  FactExtractor,
  MarkdownDocument,
  AnnotatedRegion,
} from "./types.js";

export { ANNOTATION_KIND_MAP, TABLE_HEURISTIC_COLUMNS } from "./types.js";

// Extractors
export { extractFacts, buildFactManifest } from "./extractors/index.js";
export {
  tableExtractor,
  codeBlockExtractor,
  mermaidExtractor,
  headingListExtractor,
  frontmatterExtractor,
} from "./extractors/index.js";

// Markdown parser
export { parseMarkdown, parseMarkdownFile } from "./markdown-parser.js";

// Writer
export { writeFactManifests } from "./writer.js";

export type {
  ConsistencyFinding,
  ConsistencyReport,
  FactLocation,
} from "./consistency.js";
export { checkConsistency, groupFactsByKey } from "./consistency.js";

export { applySuppressions, collectSuppressions } from "./suppression.js";

// Annotator
export type { AnnotationSuggestion } from "./annotator.js";
export { suggestAnnotations } from "./annotator.js";

export type { ReconciliationReport } from "./reconciler.js";
export { reconcileFactsWithArtifacts } from "./reconciler.js";
