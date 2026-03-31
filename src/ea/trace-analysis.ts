/**
 * EA Trace Analysis
 *
 * Core trace-link analysis shared between the `trace` CLI command and
 * the reconcile pipeline.  Extracted so `reconcile.ts` can run a trace
 * integrity check without importing the CLI layer.
 */

import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { EaArtifactBase } from "./types.js";
import type { ScannedDoc } from "./docs/scanner.js";

// ─── Helpers ──────────────────────────────────────────────────────────

/** Returns `true` when `ref` is an HTTP(S) URL. */
export function isUrl(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://");
}

/** Returns `true` for Markdown file extensions. */
function isMarkdownFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === ".md" || ext === ".markdown";
}

// ─── Types ────────────────────────────────────────────────────────────

export interface TraceLink {
  artifactId: string;
  docPath: string;
  role?: string;
  artifactToDoc: boolean;
  docToArtifact: boolean;
  fileExists: boolean;
  isUrl: boolean;
}

export interface TraceCheckReport {
  brokenTraceRefs: { artifactId: string; path: string; reason: string }[];
  oneWayArtifactToDoc: {
    artifactId: string;
    path: string;
    severity: "warning" | "info";
    reason: string;
  }[];
  oneWayDocToArtifact: { docPath: string; artifactId: string }[];
  bidirectionalCount: number;
}

// ─── Core analysis ────────────────────────────────────────────────────

/**
 * Build the full set of {@link TraceLink}s from artifacts and scanned docs.
 */
export function buildTraceLinks(
  artifacts: EaArtifactBase[],
  docs: ScannedDoc[],
  cwd: string,
): TraceLink[] {
  const linkKey = (aid: string, dpath: string) => `${aid}::${dpath}`;
  const seen = new Map<string, TraceLink>();

  // artifact → doc (traceRefs)
  for (const a of artifacts) {
    for (const ref of a.traceRefs ?? []) {
      const url = isUrl(ref.path);
      const key = linkKey(a.id, ref.path);
      const existing = seen.get(key);
      if (existing) {
        existing.artifactToDoc = true;
        existing.isUrl = url;
      } else {
        seen.set(key, {
          artifactId: a.id,
          docPath: ref.path,
          role: ref.role,
          artifactToDoc: true,
          docToArtifact: false,
          fileExists: url ? false : existsSync(resolve(cwd, ref.path)),
          isUrl: url,
        });
      }
    }
  }

  // doc → artifact (frontmatter ea-artifacts)
  for (const doc of docs) {
    for (const aid of doc.artifactIds) {
      const key = linkKey(aid, doc.relativePath);
      const existing = seen.get(key);
      if (existing) {
        existing.docToArtifact = true;
      } else {
        seen.set(key, {
          artifactId: aid,
          docPath: doc.relativePath,
          role: undefined,
          artifactToDoc: false,
          docToArtifact: true,
          fileExists: true, // doc was scanned, so it exists
          isUrl: false,
        });
      }
    }
  }

  return [...seen.values()];
}

/**
 * Build a {@link TraceCheckReport} from a set of trace links.
 */
export function buildTraceCheckReport(links: TraceLink[]): TraceCheckReport {
  const broken: TraceCheckReport["brokenTraceRefs"] = [];
  const oneWayA2D: TraceCheckReport["oneWayArtifactToDoc"] = [];
  const oneWayD2A: TraceCheckReport["oneWayDocToArtifact"] = [];
  let bidir = 0;

  for (const l of links) {
    if (l.artifactToDoc && l.isUrl) {
      broken.push({ artifactId: l.artifactId, path: l.docPath, reason: "URL, skipped" });
      continue;
    }
    if (l.artifactToDoc && !l.fileExists) {
      broken.push({ artifactId: l.artifactId, path: l.docPath, reason: "file not found" });
      continue;
    }
    if (l.artifactToDoc && l.docToArtifact) {
      bidir++;
    } else if (l.artifactToDoc && !l.docToArtifact) {
      if (isMarkdownFile(l.docPath)) {
        oneWayA2D.push({
          artifactId: l.artifactId,
          path: l.docPath,
          severity: "warning",
          reason: "missing frontmatter",
        });
      } else {
        oneWayA2D.push({
          artifactId: l.artifactId,
          path: l.docPath,
          severity: "info",
          reason: "non-markdown file",
        });
      }
    } else if (!l.artifactToDoc && l.docToArtifact) {
      oneWayD2A.push({ docPath: l.docPath, artifactId: l.artifactId });
    }
  }

  return {
    brokenTraceRefs: broken,
    oneWayArtifactToDoc: oneWayA2D,
    oneWayDocToArtifact: oneWayD2A,
    bidirectionalCount: bidir,
  };
}
