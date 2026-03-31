/**
 * @module facts/extractors/code-block-extractor
 *
 * Extracts structured facts from fenced code blocks (TypeScript and JSON)
 * in markdown documents. Handles type enums, interfaces, JSON event/status/
 * endpoint patterns, and annotated regions.
 */

import { createHash } from "node:crypto";
import type { Code } from "mdast";
import { visit } from "unist-util-visit";
import type {
  FactExtractor,
  FactBlock,
  ExtractedFact,
  FactKind,
  MarkdownDocument,
  AnnotatedRegion,
} from "../types.js";
import { ANNOTATION_KIND_MAP } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────

function hashFact(key: string, fields: Record<string, string>): string {
  return createHash("sha256")
    .update(key + JSON.stringify(fields))
    .digest("hex")
    .slice(0, 12);
}

function findAnnotation(
  line: number,
  annotations: AnnotatedRegion[],
): AnnotatedRegion | undefined {
  return annotations.find(
    (a) => line >= a.startOffset && line <= a.endOffset,
  );
}

function stripJsonComments(text: string): string {
  return text
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

// ─── TypeScript Extraction ──────────────────────────────────────────

function resolveKind(
  fallback: FactKind,
  annotation?: AnnotatedRegion,
): FactKind {
  if (!annotation) return fallback;
  return ANNOTATION_KIND_MAP[annotation.annotation.kind] ?? fallback;
}

function extractTypeEnums(
  value: string,
  source: { file: string; line: number; endLine?: number },
  annotation?: AnnotatedRegion,
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  // type X = 'a' | 'b' | 'c'
  const typeUnionRe = /type\s+(\w+)\s*=\s*((?:["'][^"']*["']\s*\|?\s*)+)/g;
  let match: RegExpExecArray | null;
  while ((match = typeUnionRe.exec(value)) !== null) {
    const name = match[1]!;
    const valuesRaw = match[2]!;
    const values: string[] = [];
    const litRe = /["']([^"']*?)["']/g;
    let lm: RegExpExecArray | null;
    while ((lm = litRe.exec(valuesRaw)) !== null) values.push(lm[1]!);
    if (values.length === 0) continue;
    const fields = { values: values.join(", ") };
    facts.push({
      key: name,
      kind: resolveKind("type-enum", annotation),
      fields,
      hash: hashFact(name, fields),
      source: {
        ...source,
        blockId: annotation?.annotation.id,
        annotationKind: annotation?.annotation.kind,
      },
    });
  }

  // enum X { A = 'a', B = 'b' }
  const enumRe = /enum\s+(\w+)\s*\{([^}]*)\}/g;
  while ((match = enumRe.exec(value)) !== null) {
    const name = match[1]!;
    const body = match[2]!;
    const members: string[] = [];
    const memRe = /(\w+)\s*(?:=\s*[^,}]*)?/g;
    let mm: RegExpExecArray | null;
    while ((mm = memRe.exec(body)) !== null) {
      const m = mm[1]!.trim();
      if (m) members.push(m);
    }
    if (members.length === 0) continue;
    const fields = { values: members.join(", ") };
    facts.push({
      key: name,
      kind: resolveKind("type-enum", annotation),
      fields,
      hash: hashFact(name, fields),
      source: {
        ...source,
        blockId: annotation?.annotation.id,
        annotationKind: annotation?.annotation.kind,
      },
    });
  }

  return facts;
}

function extractInterfaces(
  value: string,
  source: { file: string; line: number; endLine?: number },
  annotation?: AnnotatedRegion,
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const interfaceRe = /interface\s+(\w+)\s*(?:extends\s+[^{]*)?\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = interfaceRe.exec(value)) !== null) {
    const name = match[1]!;
    const body = match[2]!;
    const fields: Record<string, string> = {};
    const fieldRe = /(\w+)\s*[?]?\s*:\s*([^;]+)/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields[fm[1]!.trim()] = fm[2]!.trim();
    }
    if (Object.keys(fields).length === 0) continue;
    facts.push({
      key: name,
      kind: resolveKind("entity-fields", annotation),
      fields,
      hash: hashFact(name, fields),
      source: {
        ...source,
        blockId: annotation?.annotation.id,
        annotationKind: annotation?.annotation.kind,
      },
    });
  }
  return facts;
}

function extractTypescriptFacts(
  value: string,
  source: { file: string; line: number; endLine?: number },
  annotation?: AnnotatedRegion,
): ExtractedFact[] {
  return [
    ...extractTypeEnums(value, source, annotation),
    ...extractInterfaces(value, source, annotation),
  ];
}

// ─── JSON Extraction ────────────────────────────────────────────────

function classifyJsonFact(
  obj: Record<string, unknown>,
  annotation?: AnnotatedRegion,
): { kind: FactKind; key: string } {
  if (annotation) {
    const mapped = ANNOTATION_KIND_MAP[annotation.annotation.kind];
    if (mapped) {
      const key =
        (typeof obj.event === "string" && obj.event) ||
        (typeof obj.name === "string" && obj.name) ||
        (typeof obj.status === "string" && obj.status) ||
        (typeof obj.state === "string" && obj.state) ||
        (typeof obj.method === "string" && typeof obj.path === "string"
          ? `${obj.method} ${obj.path}`
          : undefined) ||
        firstStringValue(obj) ||
        "anonymous";
      return { kind: mapped, key };
    }
  }

  if (typeof obj.event === "string") {
    return { kind: "event-table", key: obj.event };
  }
  if (typeof obj.status === "string") {
    return { kind: "status-enum", key: obj.status };
  }
  if (typeof obj.state === "string") {
    return { kind: "status-enum", key: obj.state };
  }
  if (typeof obj.method === "string" && typeof obj.path === "string") {
    return { kind: "endpoint-table", key: `${obj.method} ${obj.path}` };
  }

  const key = firstStringValue(obj) || "anonymous";
  return { kind: "generic", key };
}

function firstStringValue(obj: Record<string, unknown>): string | undefined {
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractJsonFacts(
  value: string,
  lang: string,
  source: { file: string; line: number; endLine?: number },
  annotation?: AnnotatedRegion,
): ExtractedFact[] {
  const raw = lang === "jsonc" ? stripJsonComments(value) : value;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (parsed === null || typeof parsed !== "object") return [];

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const facts: ExtractedFact[] = [];

  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const obj = item as Record<string, unknown>;
    const { kind, key } = classifyJsonFact(obj, annotation);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = typeof v === "string" ? v : JSON.stringify(v);
    }
    facts.push({
      key,
      kind,
      fields,
      hash: hashFact(key, fields),
      source: {
        ...source,
        blockId: annotation?.annotation.id,
        annotationKind: annotation?.annotation.kind,
      },
    });
  }

  return facts;
}

// ─── Main Extractor ─────────────────────────────────────────────────

const TS_LANGS = new Set(["typescript", "ts"]);
const JSON_LANGS = new Set(["json", "jsonc"]);

export const codeBlockExtractor: FactExtractor = {
  name: "code-block",

  extract(doc: MarkdownDocument): FactBlock[] {
    const blocks: FactBlock[] = [];

    visit(doc.tree, "code", (node: Code) => {
      const lang = node.lang?.toLowerCase() ?? null;
      if (!lang) return;
      if (!TS_LANGS.has(lang) && !JSON_LANGS.has(lang)) return;

      const startLine = node.position?.start.line ?? 0;
      const endLine = node.position?.end.line ?? startLine;
      const annotation = findAnnotation(startLine, doc.annotations);

      const source = {
        file: doc.filePath,
        line: startLine,
        endLine,
      };

      let facts: ExtractedFact[];
      if (TS_LANGS.has(lang)) {
        facts = extractTypescriptFacts(node.value, source, annotation);
      } else {
        facts = extractJsonFacts(node.value, lang, source, annotation);
      }

      if (facts.length === 0) return;

      const firstFact = facts[0]!;
      blocks.push({
        kind: firstFact.kind,
        source: {
          file: doc.filePath,
          line: startLine,
          endLine,
          blockId: annotation?.annotation.id,
          annotationKind: annotation?.annotation.kind,
        },
        facts,
        annotation: annotation?.annotation,
      });
    });

    return blocks;
  },
};
