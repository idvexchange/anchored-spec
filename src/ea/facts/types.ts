/**
 * @module facts/types
 *
 * TypeScript types for the fact extraction system.
 * Defines the shapes of extracted facts, annotations, blocks,
 * and manifests produced by markdown prose resolvers.
 */

import type { Root } from "mdast";

// ─── Fact Classification ────────────────────────────────────────────

/**
 * Kinds of facts extractable from markdown documents.
 */
export type FactKind =
  | "event-table"
  | "status-enum"
  | "endpoint-table"
  | "entity-fields"
  | "state-transition"
  | "type-enum"
  | "payload-schema"
  | "assurance-level"
  | "provider-table"
  | "mapping-table"
  | "generic";

// ─── Source Location ────────────────────────────────────────────────

/**
 * Source location of an extracted fact or block.
 */
export interface FactSource {
  /** Relative file path */
  file: string;
  /** Start line number (1-based) */
  line: number;
  /** End line number (1-based) */
  endLine?: number;
  /** Stable block ID from @ea annotation */
  blockId?: string;
  /** Annotation kind (@anchored-spec:events, @anchored-spec:states, etc.) */
  annotationKind?: string;
}

// ─── Extracted Fact ─────────────────────────────────────────────────

/**
 * A single extracted fact — one row, one enum value, one transition, etc.
 */
export interface ExtractedFact {
  /** Semantic key: event name, endpoint path, status value, etc. */
  key: string;
  /** Fact classification */
  kind: FactKind;
  /** Column/property values from the source */
  fields: Record<string, string>;
  /** Content hash for quick change detection (SHA-256 hex prefix) */
  hash: string;
  /** Source location */
  source: FactSource;
}

// ─── Annotations ────────────────────────────────────────────────────

/**
 * Parsed @anchored-spec:* annotation metadata.
 */
export interface FactAnnotation {
  /** Annotation kind: events, states, endpoints, entities, enums, schema, transitions */
  kind: string;
  /** Optional stable block identifier */
  id?: string;
  /** Raw annotation text */
  raw: string;
  /** Start line of the annotation comment (1-based) */
  line: number;
  /** End line of the @anchored-spec:end comment (1-based), if present */
  endLine?: number;
}

/**
 * Parsed @anchored-spec:suppress annotation.
 */
export interface SuppressionAnnotation {
  /** Rule ID or glob pattern to suppress */
  ruleId: string;
  /** Human-readable reason for suppression */
  reason: string;
  /** Raw annotation text */
  raw: string;
  /** Start line (1-based) */
  line: number;
  /** End line (1-based) */
  endLine?: number;
}

/**
 * Document-level marker indicating canonical/derived status.
 */
export interface DocumentMarker {
  /** Marker type */
  type: "canonical" | "derived";
  /** For derived docs: the source document path */
  derivedFrom?: string;
  /** Raw annotation text */
  raw: string;
  /** Line number (1-based) */
  line: number;
}

// ─── Fact Blocks & Manifests ────────────────────────────────────────

/**
 * A block of related facts extracted from a single markdown container.
 * E.g., one table = one FactBlock containing N facts (one per row).
 */
export interface FactBlock {
  /** Block identifier — from @ea annotation ID or auto-generated */
  id?: string;
  /** Fact classification for this block */
  kind: FactKind;
  /** Source location of the container */
  source: FactSource;
  /** Extracted facts */
  facts: ExtractedFact[];
  /** Parsed annotation metadata, if annotated */
  annotation?: FactAnnotation;
  /** Suppression annotation, if present */
  suppression?: SuppressionAnnotation;
}

/**
 * Complete fact manifest for a single document.
 */
export interface FactManifest {
  /** Relative file path */
  source: string;
  /** ISO 8601 extraction timestamp */
  extractedAt: string;
  /** Extracted fact blocks */
  blocks: FactBlock[];
  /** Total number of individual facts across all blocks */
  totalFacts: number;
  /** Suppression annotations found in the document (carried through for downstream use) */
  suppressions?: SuppressionAnnotation[];
  /** Canonical/derived markers for consistency prioritization */
  markers?: DocumentMarker[];
}

// ─── Annotation → FactKind Mapping ─────────────────────────────────

/**
 * Mapping from annotation kind string to FactKind.
 */
export const ANNOTATION_KIND_MAP: Record<string, FactKind> = {
  events: "event-table",
  states: "status-enum",
  endpoints: "endpoint-table",
  entities: "entity-fields",
  enums: "type-enum",
  schema: "payload-schema",
  transitions: "state-transition",
  mapping: "mapping-table",
};

// ─── Heuristic Classification ───────────────────────────────────────

/**
 * Column name patterns used for heuristic table classification.
 * Keys are FactKind values, values are arrays of column name patterns (lowercase).
 */
export const TABLE_HEURISTIC_COLUMNS: Record<string, string[]> = {
  "event-table": ["event", "trigger", "webhook", "topic"],
  "status-enum": ["status", "state", "value", "code"],
  "endpoint-table": ["endpoint", "method", "path", "route", "url"],
  "entity-fields": ["field", "property", "attribute", "column", "type"],
  "assurance-level": ["assurance", "loa", "eidas", "level", "provider"],
  "provider-table": ["provider", "integration", "vendor", "service"],
};

/**
 * Column name patterns used to detect mapping/translation tables.
 * Each pair of column name patterns indicates a mapping table.
 */
export const MAPPING_TABLE_COLUMN_PAIRS: [string[], string[]][] = [
  [["internal", "source", "old", "from", "original"], ["external", "target", "new", "to", "mapped"]],
];

// ─── Extractor Interface ────────────────────────────────────────────

/**
 * Interface for a fact extractor that processes specific markdown AST node types.
 */
export interface FactExtractor {
  /** Extractor name for logging/debugging */
  name: string;
  /** Extract facts from a parsed markdown document */
  extract(doc: MarkdownDocument): FactBlock[];
}

// ─── Markdown Document ──────────────────────────────────────────────

/**
 * Represents a parsed markdown document ready for fact extraction.
 */
export interface MarkdownDocument {
  /** mdast root node */
  tree: Root;
  /** Relative file path */
  filePath: string;
  /** Parsed annotations found in the document */
  annotations: AnnotatedRegion[];
  /** Parsed suppression annotations */
  suppressions: SuppressionAnnotation[];
  /** Canonical/derived markers found in the document */
  markers: DocumentMarker[];
}

/**
 * A region of the document annotated with @anchored-spec:{kind}.
 * Contains the AST nodes between @anchored-spec:{kind} and @anchored-spec:end.
 */
export interface AnnotatedRegion {
  /** Annotation metadata */
  annotation: FactAnnotation;
  /** Start position (mdast position) */
  startOffset: number;
  /** End position (mdast position) */
  endOffset: number;
}
