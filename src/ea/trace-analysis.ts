/**
 * EA Trace Analysis
 *
 * Core trace-link analysis shared between the `trace` CLI command and
 * the reconcile pipeline.  Extracted so `reconcile.ts` can run a trace
 * integrity check without importing the CLI layer.
 */

import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { BackstageEntity } from "./backstage/types.js";
import { getEntityId, getEntityTraceRefs } from "./backstage/accessors.js";
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
  entityRef: string;
  docPath: string;
  role?: string;
  entityToDoc: boolean;
  docToEntity: boolean;
  fileExists: boolean;
  isUrl: boolean;
}

export interface TraceCheckReport {
  brokenTraceRefs: { entityRef: string; path: string; reason: string }[];
  oneWayEntityToDoc: {
    entityRef: string;
    path: string;
    severity: "warning" | "info";
    reason: string;
  }[];
  oneWayDocToEntity: { docPath: string; entityRef: string }[];
  bidirectionalCount: number;
}

// ─── Core analysis ────────────────────────────────────────────────────

/**
 * Build the full set of {@link TraceLink}s from artifacts and scanned docs.
 */
export function buildTraceLinks(
  entities: BackstageEntity[],
  docs: ScannedDoc[],
  cwd: string,
): TraceLink[] {
  const linkKey = (aid: string, dpath: string) => `${aid}::${dpath}`;
  const seen = new Map<string, TraceLink>();

  // entity → doc (traceRefs)
  for (const entity of entities) {
    const entityId = getEntityId(entity);
    for (const ref of getEntityTraceRefs(entity)) {
      const url = isUrl(ref.path);
      const key = linkKey(entityId, ref.path);
      const existing = seen.get(key);
      if (existing) {
        existing.entityToDoc = true;
        existing.isUrl = url;
      } else {
        seen.set(key, {
          entityRef: entityId,
          docPath: ref.path,
          role: ref.role,
          entityToDoc: true,
          docToEntity: false,
          fileExists: url ? false : existsSync(resolve(cwd, ref.path)),
          isUrl: url,
        });
      }
    }
  }

  // doc → entity (frontmatter ea-entities)
  for (const doc of docs) {
    for (const aid of doc.entityRefs) {
      const key = linkKey(aid, doc.relativePath);
      const existing = seen.get(key);
      if (existing) {
        existing.docToEntity = true;
      } else {
        seen.set(key, {
          entityRef: aid,
          docPath: doc.relativePath,
          role: undefined,
          entityToDoc: false,
          docToEntity: true,
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
  const oneWayA2D: TraceCheckReport["oneWayEntityToDoc"] = [];
  const oneWayD2A: TraceCheckReport["oneWayDocToEntity"] = [];
  let bidir = 0;

  for (const l of links) {
    if (l.entityToDoc && l.isUrl) {
      broken.push({ entityRef: l.entityRef, path: l.docPath, reason: "URL, skipped" });
      continue;
    }
    if (l.entityToDoc && !l.fileExists) {
      broken.push({ entityRef: l.entityRef, path: l.docPath, reason: "file not found" });
      continue;
    }
    if (l.entityToDoc && l.docToEntity) {
      bidir++;
    } else if (l.entityToDoc && !l.docToEntity) {
      if (isMarkdownFile(l.docPath)) {
        oneWayA2D.push({
          entityRef: l.entityRef,
          path: l.docPath,
          severity: "warning",
          reason: "missing frontmatter",
        });
      } else {
        oneWayA2D.push({
          entityRef: l.entityRef,
          path: l.docPath,
          severity: "info",
          reason: "non-markdown file",
        });
      }
    } else if (!l.entityToDoc && l.docToEntity) {
      oneWayD2A.push({ docPath: l.docPath, entityRef: l.entityRef });
    }
  }

  return {
    brokenTraceRefs: broken,
    oneWayEntityToDoc: oneWayA2D,
    oneWayDocToEntity: oneWayD2A,
    bidirectionalCount: bidir,
  };
}
