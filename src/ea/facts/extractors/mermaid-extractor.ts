/**
 * @module facts/extractors/mermaid-extractor
 *
 * Extracts state transition facts from mermaid stateDiagram fenced code
 * blocks in markdown documents. Produces `state-transition` facts for
 * each transition line and a summary `status-enum` block listing all
 * unique states discovered in the diagram.
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

function normalizeState(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "[*]") return "[start]";
  return trimmed;
}

function normalizeStateForEnum(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "[*]") return undefined;
  return trimmed;
}

function resolveKind(
  fallback: FactKind,
  annotation?: AnnotatedRegion,
): FactKind {
  if (!annotation) return fallback;
  return ANNOTATION_KIND_MAP[annotation.annotation.kind] ?? fallback;
}

// ─── Mermaid Parsing ────────────────────────────────────────────────

interface ParsedTransition {
  from: string;
  to: string;
  trigger: string;
}

function isStateDiagram(value: string): boolean {
  const first = value.trimStart().split("\n")[0]?.trim() ?? "";
  return first.startsWith("stateDiagram-v2") || first.startsWith("stateDiagram");
}

function parseMermaidStateDiagram(value: string): {
  transitions: ParsedTransition[];
  states: Set<string>;
} {
  const transitions: ParsedTransition[] = [];
  const states = new Set<string>();
  const lines = value.split("\n");

  // Regex: captures a transition line like `stateA --> stateB : label`
  // Supports both --> and ->
  const transitionRe = /^(.+?)\s*-{1,2}>\s*(.+?)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, comments, directives, and keywords
    if (!trimmed || trimmed.startsWith("%%") || trimmed.startsWith("--")) continue;
    if (
      trimmed.startsWith("stateDiagram") ||
      trimmed.startsWith("direction ") ||
      trimmed.startsWith("note ") ||
      trimmed === "}"
    ) {
      continue;
    }

    // State block declaration: `state X { ... }`
    if (trimmed.startsWith("state ") && !transitionRe.test(trimmed)) {
      const stateMatch = trimmed.match(/^state\s+([\w-]+)/);
      if (stateMatch) {
        states.add(stateMatch[1]!);
      }
      continue;
    }

    // Transition line
    const m = transitionRe.exec(trimmed);
    if (!m) continue;

    const rawLeft = m[1]!.trim();
    const rawRight = m[2]!;

    // Right side may contain `: label`
    let to: string;
    let trigger = "";
    const colonIdx = rawRight.indexOf(":");
    if (colonIdx !== -1) {
      to = rawRight.slice(0, colonIdx).trim();
      trigger = rawRight.slice(colonIdx + 1).trim();
    } else {
      to = rawRight.trim();
    }

    const from = normalizeState(rawLeft);
    const toNorm = normalizeState(to);

    // Detect [*] on right side as [end] when it's the terminal
    const toFinal =
      to.trim() === "[*]" && from !== "[start]" ? "[end]" : toNorm;

    transitions.push({ from, to: toFinal, trigger });

    // Collect unique non-special states
    const fromEnum = normalizeStateForEnum(rawLeft);
    const toEnum = normalizeStateForEnum(to);
    if (fromEnum) states.add(fromEnum);
    if (toEnum) states.add(toEnum);
  }

  return { transitions, states };
}

// ─── Main Extractor ─────────────────────────────────────────────────

export const mermaidExtractor: FactExtractor = {
  name: "mermaid",

  extract(doc: MarkdownDocument): FactBlock[] {
    const blocks: FactBlock[] = [];

    visit(doc.tree, "code", (node: Code) => {
      if (node.lang?.toLowerCase() !== "mermaid") return;
      if (!isStateDiagram(node.value)) return;

      const startLine = node.position?.start.line ?? 0;
      const endLine = node.position?.end.line ?? startLine;
      const annotation = findAnnotation(startLine, doc.annotations);

      const source = {
        file: doc.filePath,
        line: startLine,
        endLine,
      };

      const { transitions, states } = parseMermaidStateDiagram(node.value);

      // Transition facts
      if (transitions.length > 0) {
        const facts: ExtractedFact[] = transitions.map((t) => {
          const key = `${t.from}→${t.to}`;
          const fields: Record<string, string> = {
            from: t.from,
            to: t.to,
            trigger: t.trigger,
          };
          return {
            key,
            kind: resolveKind("state-transition", annotation),
            fields,
            hash: hashFact(key, fields),
            source: {
              ...source,
              blockId: annotation?.annotation.id,
              annotationKind: annotation?.annotation.kind,
            },
          };
        });

        blocks.push({
          kind: resolveKind("state-transition", annotation),
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
      }

      // Status-enum summary block listing all unique states
      if (states.size > 0) {
        const sortedStates = Array.from(states).sort();
        const key = "states";
        const fields: Record<string, string> = {
          values: sortedStates.join(", "),
        };
        const enumFact: ExtractedFact = {
          key,
          kind: resolveKind("status-enum", annotation),
          fields,
          hash: hashFact(key, fields),
          source: {
            ...source,
            blockId: annotation?.annotation.id,
            annotationKind: annotation?.annotation.kind,
          },
        };

        blocks.push({
          kind: resolveKind("status-enum", annotation),
          source: {
            file: doc.filePath,
            line: startLine,
            endLine,
            blockId: annotation?.annotation.id,
            annotationKind: annotation?.annotation.kind,
          },
          facts: [enumFact],
          annotation: annotation?.annotation,
        });
      }
    });

    return blocks;
  },
};
