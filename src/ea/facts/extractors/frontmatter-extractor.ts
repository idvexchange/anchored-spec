import { createHash } from "node:crypto";
import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import type { FactExtractor, FactBlock, ExtractedFact, FactKind, MarkdownDocument } from "../types.js";
import type { DocFrontmatter } from "../../docs/frontmatter.js";

function hashFact(key: string, fields: Record<string, string>): string {
  return createHash("sha256").update(key + JSON.stringify(fields)).digest("hex").slice(0, 12);
}

function parseFrontmatterFromTree(doc: MarkdownDocument): DocFrontmatter | null {
  const first = doc.tree.children[0];
  if (!first || first.type !== "yaml") return null;

  try {
    const raw = parseYaml((first as { value: string }).value) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return null;
    return raw as DocFrontmatter;
  } catch {
    return null;
  }
}

function makeSource(doc: MarkdownDocument) {
  return { file: doc.filePath, line: 1 };
}

export const frontmatterExtractor: FactExtractor = {
  name: "frontmatter",

  extract(doc: MarkdownDocument): FactBlock[] {
    const fm = parseFrontmatterFromTree(doc);
    if (!fm) return [];

    const blocks: FactBlock[] = [];
    const source = makeSource(doc);
    const docType = fm.type ?? "unknown";

    // Artifact references
    const artifacts = Array.isArray(fm.eaArtifacts)
      ? fm.eaArtifacts
      : fm["ea-artifacts" as keyof DocFrontmatter];
    const artifactIds = Array.isArray(artifacts)
      ? (artifacts as string[]).filter((s) => typeof s === "string" && s.length > 0)
      : [];

    if (artifactIds.length > 0) {
      const facts: ExtractedFact[] = artifactIds.map((id) => {
        const fields = { role: "trace", documentType: docType };
        return {
          key: id,
          kind: "generic" as FactKind,
          fields,
          hash: hashFact(id, fields),
          source,
        };
      });
      blocks.push({ kind: "generic", source, facts });
    }

    // Domain declarations
    const domains = Array.isArray(fm.domain) ? fm.domain.filter(Boolean) : [];
    if (domains.length > 0) {
      const facts: ExtractedFact[] = domains.map((d) => {
        const fields = { source: "frontmatter" };
        return {
          key: d,
          kind: "generic" as FactKind,
          fields,
          hash: hashFact(d, fields),
          source: makeSource(doc),
        };
      });
      blocks.push({ kind: "generic", source, facts });
    }

    // Document status
    if (fm.status) {
      const key = basename(doc.filePath);
      const fields = { status: fm.status, type: docType };
      const fact: ExtractedFact = {
        key,
        kind: "generic",
        fields,
        hash: hashFact(key, fields),
        source,
      };
      blocks.push({ kind: "generic", source, facts: [fact] });
    }

    return blocks;
  },
};
