import { readFile } from "node:fs/promises";

import type { Html, Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  AnnotatedRegion,
  FactAnnotation,
  MarkdownDocument,
  SuppressionAnnotation,
} from "./types.js";

// ─── Processor (singleton) ──────────────────────────────────────────

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"]);

// ─── Annotation Patterns ────────────────────────────────────────────

const ANNOTATION_RE = /^<!--\s*@ea:(\S+)(?:\s+(\S+))?\s*-->$/;
const END_RE = /^<!--\s*@ea:end\s*-->$/;
const SUPPRESS_RE =
  /^<!--\s*@ea:suppress\s+(\S+)\s+reason="([^"]*)"\s*-->$/;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Parse markdown content into a typed mdast AST and extract `@ea:*` annotations.
 */
export function parseMarkdown(
  content: string,
  filePath: string,
): MarkdownDocument {
  const tree = processor.parse(content) as Root;
  const { annotations, suppressions } = extractAnnotations(tree);
  return { tree, filePath, annotations, suppressions };
}

/**
 * Read a file from disk and parse it.
 */
export async function parseMarkdownFile(
  absolutePath: string,
  relativePath: string,
): Promise<MarkdownDocument> {
  const content = await readFile(absolutePath, "utf-8");
  return parseMarkdown(content, relativePath);
}

// ─── Annotation Extraction ──────────────────────────────────────────

interface OpenRegion {
  annotation: FactAnnotation;
  startLine: number;
}

interface OpenSuppression {
  suppression: SuppressionAnnotation;
  startLine: number;
}

function extractAnnotations(tree: Root): {
  annotations: AnnotatedRegion[];
  suppressions: SuppressionAnnotation[];
} {
  const annotations: AnnotatedRegion[] = [];
  const suppressions: SuppressionAnnotation[] = [];
  const openRegions: OpenRegion[] = [];
  const openSuppressions: OpenSuppression[] = [];

  for (const node of tree.children) {
    if (node.type !== "html") continue;

    const html = node as Html;
    const raw = html.value.trim();
    const line = html.position?.start.line ?? 0;

    // Check for @ea:end — closes the most recent open region OR suppression
    if (END_RE.test(raw)) {
      const endLine = html.position?.end.line ?? line;

      if (openSuppressions.length > 0) {
        const open = openSuppressions.pop()!;
        open.suppression.endLine = endLine;
        suppressions.push(open.suppression);
      } else if (openRegions.length > 0) {
        const open = openRegions.pop()!;
        open.annotation.endLine = endLine;
        annotations.push({
          annotation: open.annotation,
          startOffset: open.startLine,
          endOffset: endLine,
        });
      }
      continue;
    }

    // Check for @ea:suppress
    const suppressMatch = SUPPRESS_RE.exec(raw);
    if (suppressMatch) {
      openSuppressions.push({
        suppression: {
          ruleId: suppressMatch[1]!,
          reason: suppressMatch[2]!,
          raw,
          line,
        },
        startLine: line,
      });
      continue;
    }

    // Check for @ea:{kind}
    const annotationMatch = ANNOTATION_RE.exec(raw);
    if (annotationMatch) {
      const kind = annotationMatch[1]!;
      // Skip known non-region keywords
      if (kind === "end" || kind === "suppress") continue;
      openRegions.push({
        annotation: {
          kind,
          id: annotationMatch[2],
          raw,
          line,
        },
        startLine: line,
      });
      continue;
    }
  }

  // Close any remaining open regions (unclosed annotations extend to EOF)
  const lastLine = lastTreeLine(tree);
  for (const open of openRegions) {
    annotations.push({
      annotation: open.annotation,
      startOffset: open.startLine,
      endOffset: lastLine,
    });
  }
  for (const open of openSuppressions) {
    open.suppression.endLine = lastLine;
    suppressions.push(open.suppression);
  }

  return { annotations, suppressions };
}

function lastTreeLine(tree: Root): number {
  const last = tree.children[tree.children.length - 1];
  return last?.position?.end.line ?? 1;
}
