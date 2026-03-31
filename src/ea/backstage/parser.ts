/**
 * Backstage YAML Parser
 *
 * Parses single-document, multi-document, and frontmatter YAML
 * into BackstageEntity objects with source metadata.
 */

import { parseAllDocuments } from "yaml";
import type { BackstageEntity } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Source location metadata for a parsed entity. */
export interface EntitySourceInfo {
  /** Origin file path (if known). */
  filePath?: string;
  /** Zero-based index within a multi-document YAML file. */
  documentIndex: number;
}

/** A successfully parsed entity paired with its source info. */
export interface ParsedBackstageEntity {
  entity: BackstageEntity;
  source: EntitySourceInfo;
}

/** A parse-level error with optional location info. */
export interface BackstageParseError {
  message: string;
  documentIndex: number;
  line?: number;
  column?: number;
}

/** Result of parsing Backstage YAML content. */
export interface BackstageParseResult {
  entities: ParsedBackstageEntity[];
  errors: BackstageParseError[];
}

// ─── Core Parser ────────────────────────────────────────────────────────────────

/**
 * Parse Backstage YAML content — handles both single-document and
 * multi-document (`---`-separated) YAML.
 *
 * Each YAML document is validated for the minimal Backstage entity
 * envelope (`apiVersion`, `kind`, `metadata.name`). Documents that
 * fail validation are reported as errors; valid documents are returned
 * as entities.
 */
export function parseBackstageYaml(
  content: string,
  filePath?: string,
): BackstageParseResult {
  const entities: ParsedBackstageEntity[] = [];
  const errors: BackstageParseError[] = [];

  // Strip BOM
  const text = content.replace(/^\ufeff/, "");

  let docs;
  try {
    docs = parseAllDocuments(text);
  } catch (err) {
    errors.push({
      message: `YAML parse failure: ${(err as Error).message}`,
      documentIndex: 0,
    });
    return { entities, errors };
  }

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;

    // Collect YAML-level syntax errors
    if (doc.errors.length > 0) {
      for (const err of doc.errors) {
        const linePos = err.linePos;
        errors.push({
          message: err.message,
          documentIndex: i,
          line: linePos?.[0]?.line,
          column: linePos?.[0]?.col,
        });
      }
      continue;
    }

    const value = doc.toJSON();

    // Skip empty / null documents (trailing `---`)
    if (value == null) continue;

    if (typeof value !== "object" || Array.isArray(value)) {
      errors.push({
        message: "Document must be a YAML mapping (object)",
        documentIndex: i,
      });
      continue;
    }

    // Validate minimal Backstage entity envelope
    const missing = collectMissingFields(value as Record<string, unknown>);
    if (missing.length > 0) {
      errors.push({
        message: `Missing required fields: ${missing.join(", ")}`,
        documentIndex: i,
      });
      continue;
    }

    entities.push({
      entity: value as BackstageEntity,
      source: { filePath, documentIndex: i },
    });
  }

  return { entities, errors };
}

// ─── Frontmatter ────────────────────────────────────────────────────────────────

/**
 * Extract and parse YAML frontmatter from markdown content.
 *
 * Expects the file to begin with `---` (optionally preceded by BOM),
 * followed by YAML content, closed by a line containing only `---`.
 */
export function parseFrontmatterEntity(
  content: string,
  filePath?: string,
): BackstageParseResult {
  const text = content.replace(/^\ufeff/, "");

  if (!text.startsWith("---")) {
    return {
      entities: [],
      errors: [
        {
          message: "No YAML frontmatter found (file must start with ---)",
          documentIndex: 0,
        },
      ],
    };
  }

  const closingIndex = findFrontmatterClose(text);
  if (closingIndex === -1) {
    return {
      entities: [],
      errors: [
        {
          message: "Unclosed YAML frontmatter (missing closing ---)",
          documentIndex: 0,
        },
      ],
    };
  }

  // Extract YAML between opening --- and closing ---
  const yamlContent = text.slice(text.indexOf("\n") + 1, closingIndex);
  return parseBackstageYaml(yamlContent, filePath);
}

/**
 * Extract the markdown body (everything after frontmatter) from content.
 * Returns the full content if no frontmatter is detected.
 */
export function extractMarkdownBody(content: string): string {
  const text = content.replace(/^\ufeff/, "");
  if (!text.startsWith("---")) return text;

  const closingIndex = findFrontmatterClose(text);
  if (closingIndex === -1) return "";

  // Find the end of the closing --- line
  const afterClose = text.indexOf("\n", closingIndex);
  if (afterClose === -1) return "";
  return text.slice(afterClose + 1);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Find the character offset of the closing `---` line in frontmatter. */
function findFrontmatterClose(text: string): number {
  const lines = text.split("\n");
  // Start at line 1 — line 0 is the opening ---
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === "---" || trimmed === "...") {
      // Calculate the character offset of this line
      let offset = 0;
      for (let j = 0; j < i; j++) {
        offset += lines[j]!.length + 1; // +1 for the \n
      }
      return offset;
    }
  }
  return -1;
}

/** Return a list of field paths missing from the entity envelope. */
function collectMissingFields(value: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (typeof value.apiVersion !== "string" || !value.apiVersion) {
    missing.push("apiVersion");
  }
  if (typeof value.kind !== "string" || !value.kind) {
    missing.push("kind");
  }
  if (
    !value.metadata ||
    typeof value.metadata !== "object" ||
    typeof (value.metadata as Record<string, unknown>).name !== "string" ||
    !(value.metadata as Record<string, unknown>).name
  ) {
    missing.push("metadata.name");
  }
  return missing;
}
