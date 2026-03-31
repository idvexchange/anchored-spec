/** Anchored Spec — Table Fact Extractor
 *
 * Walks mdast trees for GFM table nodes and extracts structured facts.
 * Tables inside `@ea:*` annotated regions use the annotation's kind;
 * otherwise a heuristic based on column names classifies the table.
 */

import type { Table, TableRow } from "mdast";
import { toString } from "mdast-util-to-string";
import { visit } from "unist-util-visit";
import { createHash } from "node:crypto";
import type {
  FactExtractor,
  FactBlock,
  ExtractedFact,
  FactSource,
  FactKind,
  MarkdownDocument,
  AnnotatedRegion,
} from "../types.js";
import { TABLE_HEURISTIC_COLUMNS, ANNOTATION_KIND_MAP, MAPPING_TABLE_COLUMN_PAIRS } from "../types.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function findAnnotation(
  line: number,
  annotations: AnnotatedRegion[],
): AnnotatedRegion | undefined {
  return annotations.find((a) => line >= a.startOffset && line <= a.endOffset);
}

function stripBackticks(value: string): string {
  return value.replace(/^`+|`+$/g, "").trim();
}

function hashFact(key: string, fields: Record<string, string>): string {
  return createHash("sha256")
    .update(key + JSON.stringify(fields))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Detect if a table is a mapping/translation table based on column patterns.
 * Returns the indices of the "from" and "to" columns if detected.
 */
function detectMappingTable(columns: string[]): { fromCol: number; toCol: number } | undefined {
  const lower = columns.map((c) => c.toLowerCase().trim());

  for (const [fromPatterns, toPatterns] of MAPPING_TABLE_COLUMN_PAIRS) {
    const fromIdx = lower.findIndex((c) => fromPatterns.some((p) => c.includes(p)));
    const toIdx = lower.findIndex((c) => toPatterns.some((p) => c.includes(p)));
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      return { fromCol: fromIdx, toCol: toIdx };
    }
  }

  return undefined;
}

function classifyByColumns(columns: string[]): FactKind | undefined {
  const lower = columns.map((c) => c.toLowerCase().trim());

  // entity-fields requires both a field-like column AND a "type" column
  const fieldTokens = ["field", "property", "attribute", "column"];
  if (
    lower.some((c) => fieldTokens.some((t) => c.includes(t))) &&
    lower.some((c) => c.includes("type"))
  ) {
    return "entity-fields";
  }

  // Score each kind by number of matching columns
  let bestKind: FactKind | undefined;
  let bestScore = 0;
  let bestSpecificity = Infinity;

  for (const [kind, tokens] of Object.entries(TABLE_HEURISTIC_COLUMNS)) {
    if (kind === "entity-fields") continue;

    const score = lower.filter((c) => tokens.some((t) => c.includes(t))).length;
    if (score === 0) continue;

    // Prefer higher score; on tie prefer more specific kind (fewer tokens = more specific)
    if (
      score > bestScore ||
      (score === bestScore && tokens.length < bestSpecificity)
    ) {
      bestKind = kind as FactKind;
      bestScore = score;
      bestSpecificity = tokens.length;
    }
  }

  return bestKind;
}

function extractCellText(row: TableRow, index: number): string {
  const cell = row.children[index];
  if (!cell) return "";
  return stripBackticks(toString(cell));
}

// ─── Extractor ────────────────────────────────────────────────────────

function extractFromTable(
  table: Table,
  kind: FactKind,
  source: FactSource,
): FactBlock | undefined {
  const [headerRow, ...dataRows] = table.children;
  if (!headerRow || dataRows.length === 0) return undefined;

  const columns = headerRow.children.map((cell) =>
    toString(cell).toLowerCase().trim(),
  );

  const facts: ExtractedFact[] = [];

  for (const row of dataRows) {
    const key = extractCellText(row, 0);
    if (!key) continue;

    const fields: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (col != null) fields[col] = extractCellText(row, i);
    }

    facts.push({
      key,
      kind,
      fields,
      hash: hashFact(key, fields),
      source,
    });
  }

  if (facts.length === 0) return undefined;

  return { kind, facts, source };
}

// ─── Public API ───────────────────────────────────────────────────────

export const tableExtractor: FactExtractor = {
  name: "table",

  extract(doc: MarkdownDocument): FactBlock[] {
    const blocks: FactBlock[] = [];

    visit(doc.tree, "table", (node: Table) => {
      const line = node.position?.start.line;
      if (line == null) return;

      // Determine kind: annotation takes priority, then heuristic
      const annotation = findAnnotation(line, doc.annotations);
      let kind: FactKind | undefined;

      if (annotation) {
        kind = ANNOTATION_KIND_MAP[annotation.annotation.kind];
      } else {
        const headerRow = node.children[0];
        if (!headerRow) return;
        const columns = headerRow.children.map((cell) => toString(cell));

        // Check for mapping table first
        const mapping = detectMappingTable(columns);
        if (mapping) {
          kind = "mapping-table";
        } else {
          kind = classifyByColumns(columns);
        }
      }

      if (!kind) return;

      const source: FactSource = {
        file: doc.filePath,
        line,
        blockId: annotation?.annotation.id,
        annotationKind: annotation?.annotation.kind,
      };

      const block = extractFromTable(node, kind, source);
      if (block) {
        if (annotation) block.annotation = annotation.annotation;
        blocks.push(block);
      }
    });

    return blocks;
  },
};
