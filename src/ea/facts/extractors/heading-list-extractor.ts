import { createHash } from "node:crypto";
import type { Heading, List, ListItem } from "mdast";
import { toString } from "mdast-util-to-string";
import type {
  FactExtractor,
  FactBlock,
  ExtractedFact,
  FactKind,
  MarkdownDocument,
  AnnotatedRegion,
} from "../types.js";
import { ANNOTATION_KIND_MAP } from "../types.js";

// ─── Patterns ───────────────────────────────────────────────────────

const HTTP_METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i;
const EVENT_PREFIX_RE = /^Event:\s*(.+)/i;
const DOTTED_NAME_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_]*)+$/;
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]+(?:\s*\((?:entity|model)\))?$/;

const BOLD_COLON_RE = /^\*\*(.+?)\*\*\s*:\s*(.*)/;
const PLAIN_COLON_RE = /^([^:]+):\s+(.*)/;

// ─── Helpers ────────────────────────────────────────────────────────

function findAnnotation(
  line: number,
  annotations: AnnotatedRegion[],
): AnnotatedRegion | undefined {
  return annotations.find(
    (a) => line >= a.startOffset && line <= a.endOffset,
  );
}

function hashFact(key: string, fields: Record<string, string>): string {
  return createHash("sha256")
    .update(key + JSON.stringify(fields))
    .digest("hex")
    .slice(0, 12);
}

// ─── Heading classification ─────────────────────────────────────────

interface HeadingClassification {
  kind: FactKind;
  key: string;
}

function classifyHeading(text: string): HeadingClassification | undefined {
  const httpMatch = text.match(HTTP_METHOD_RE);
  if (httpMatch) {
    return {
      kind: "endpoint-table",
      key: `${httpMatch[1]!.toUpperCase()} ${httpMatch[2]!}`,
    };
  }

  const eventMatch = text.match(EVENT_PREFIX_RE);
  if (eventMatch) {
    return { kind: "event-table", key: eventMatch[1]!.trim() };
  }

  if (DOTTED_NAME_RE.test(text.trim())) {
    return { kind: "event-table", key: text.trim() };
  }

  if (PASCAL_CASE_RE.test(text.trim())) {
    const key = text.trim().replace(/\s*\((?:entity|model)\)/, "");
    return { kind: "entity-fields", key };
  }

  return undefined;
}

// ─── Bullet list field extraction ───────────────────────────────────

function extractBulletText(item: ListItem): string {
  return toString(item).trim();
}

function extractBulletFieldRaw(
  text: string,
): { key: string; value: string } | undefined {
  const boldMatch = text.match(BOLD_COLON_RE);
  if (boldMatch) {
    return { key: boldMatch[1]!.trim().toLowerCase(), value: boldMatch[2]!.trim() };
  }
  const plainMatch = text.match(PLAIN_COLON_RE);
  if (plainMatch) {
    return { key: plainMatch[1]!.trim().toLowerCase(), value: plainMatch[2]!.trim() };
  }
  return undefined;
}

function extractFieldsFromList(list: List): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let i = 0; i < list.children.length; i++) {
    const item = list.children[i]!;
    const text = extractBulletText(item);
    const parsed = extractBulletFieldRaw(text);
    if (parsed) {
      fields[parsed.key] = parsed.value;
    } else {
      fields[`item_${i}`] = text;
    }
  }
  return fields;
}

// ─── Inline markdown stripping for pattern matching ─────────────────

function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
}

// ─── Extractor ──────────────────────────────────────────────────────

export const headingListExtractor: FactExtractor = {
  name: "heading-list",

  extract(doc: MarkdownDocument): FactBlock[] {
    const blocks: FactBlock[] = [];
    const children = doc.tree.children;

    for (let i = 0; i < children.length - 1; i++) {
      const node = children[i]!;
      const next = children[i + 1]!;

      if (node.type !== "heading" || (node as Heading).depth < 3) continue;
      if (next.type !== "list") continue;

      const heading = node as Heading;
      const list = next as List;

      const headingLine = heading.position?.start.line ?? 0;
      const rawText = toString(heading);
      const plainText = stripInlineMarkdown(rawText);

      const annotation = findAnnotation(headingLine, doc.annotations);

      let kind: FactKind;
      let key: string;

      if (annotation) {
        kind = ANNOTATION_KIND_MAP[annotation.annotation.kind] ?? "generic";
        key = rawText.trim();
      } else {
        const classification = classifyHeading(plainText);
        if (!classification) continue;
        kind = classification.kind;
        key = classification.key;
      }

      const fields = extractFieldsFromList(list);
      const hash = hashFact(key, fields);

      const listEndLine = list.position?.end.line ?? headingLine;

      const fact: ExtractedFact = {
        key,
        kind,
        fields,
        hash,
        source: {
          file: doc.filePath,
          line: headingLine,
          endLine: listEndLine,
          blockId: annotation?.annotation.id,
          annotationKind: annotation?.annotation.kind,
        },
      };

      blocks.push({
        id: annotation?.annotation.id,
        kind,
        source: {
          file: doc.filePath,
          line: headingLine,
          endLine: listEndLine,
          blockId: annotation?.annotation.id,
          annotationKind: annotation?.annotation.kind,
        },
        facts: [fact],
        annotation: annotation?.annotation,
      });
    }

    return blocks;
  },
};
