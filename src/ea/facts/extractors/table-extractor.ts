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
import { TABLE_HEURISTIC_COLUMNS, ANNOTATION_KIND_MAP } from "../types.js";

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

  for (const [kind, tokens] of Object.entries(TABLE_HEURISTIC_COLUMNS)) {
    if (kind === "entity-fields") continue; // already handled above
    if (lower.some((c) => tokens.some((t) => c.includes(t)))) {
      return kind as FactKind;
    }
  }

  return undefined;
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

      const source: FactSource = { file: doc.filePath, line };

      // Determine kind: annotation takes priority, then heuristic
      const annotation = findAnnotation(line, doc.annotations);
      let kind: FactKind | undefined;

      if (annotation) {
        kind = ANNOTATION_KIND_MAP[annotation.annotation.kind];
      } else {
        const headerRow = node.children[0];
        if (!headerRow) return;
        const columns = headerRow.children.map((cell) => toString(cell));
        kind = classifyByColumns(columns);
      }

      if (!kind) return;

      const block = extractFromTable(node, kind, source);
      if (block) blocks.push(block);
    });

    return blocks;
  },
};
