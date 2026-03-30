/**
 * Anchored Spec — EA Discovery Pipeline
 *
 * Discovers new EA artifacts by scanning sources (e.g., OpenAPI specs,
 * Kubernetes manifests, Terraform state). Creates draft artifacts with
 * confidence "inferred" or "observed", never overwrites existing artifacts.
 *
 * Design reference: docs/ea-drift-resolvers-generators.md (Discovery workflow)
 * Conflict rule: docs/ea-conflict-resolution.md (Rule 2: drafts never overwrite)
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EaArtifactBase, EaRelation } from "./types.js";
import { getDomainForKind, getKindPrefix } from "./types.js";

// ─── Discovery Types ────────────────────────────────────────────────────────────

/** A draft artifact produced by discovery. */
export interface EaArtifactDraft {
  /** Suggested artifact ID. */
  suggestedId: string;
  /** Inferred kind. */
  kind: string;
  /** Human-readable title. */
  title: string;
  /** Description of what was discovered. */
  summary: string;
  /** Always "draft" for discovered artifacts. */
  status: "draft";
  /** How this was discovered. */
  confidence: "observed" | "inferred";
  /** Anchors linking to the discovery source. */
  anchors?: Record<string, string[]>;
  /** Inferred relations to other artifacts. */
  relations?: EaRelation[];
  /** Which resolver produced this draft. */
  discoveredBy: string;
  /** ISO 8601 timestamp of discovery. */
  discoveredAt: string;
  /** Kind-specific fields. */
  kindSpecificFields?: Record<string, unknown>;
}

/** A match between a discovered draft and an existing artifact. */
export interface DiscoveryMatch {
  /** Existing artifact ID. */
  existingId: string;
  /** How the match was determined. */
  matchedBy: "anchor" | "title";
  /** The draft that matched. */
  draft: EaArtifactDraft;
  /** New anchors that could be added to the existing artifact. */
  suggestedAnchorsToAdd?: Record<string, string[]>;
}

/** A suggestion to update an existing artifact. */
export interface DiscoverySuggestedUpdate {
  /** Existing artifact ID to update. */
  existingId: string;
  /** What the suggestion is. */
  suggestion: string;
  /** Source resolver. */
  source: string;
}

/** Report from a discovery run. */
export interface DiscoveryReport {
  /** ISO 8601 timestamp. */
  discoveredAt: string;
  /** Resolvers that were used. */
  resolversUsed: string[];
  /** Summary counts. */
  summary: {
    newArtifacts: number;
    matchedExisting: number;
    suggestedUpdates: number;
  };
  /** New artifacts that were created. */
  newArtifacts: Array<{
    suggestedId: string;
    kind: string;
    title: string;
    confidence: string;
    discoveredBy: string;
    writtenTo: string | null;
  }>;
  /** Drafts that matched existing artifacts. */
  matchedExisting: DiscoveryMatch[];
  /** Suggestions for existing artifacts. */
  suggestedUpdates: DiscoverySuggestedUpdate[];
}

/** Options for the discovery pipeline. */
export interface DiscoveryOptions {
  /** Existing loaded artifacts to deduplicate against. */
  existingArtifacts: EaArtifactBase[];
  /** Draft artifacts from resolvers. */
  drafts: EaArtifactDraft[];
  /** Resolver names that were used. */
  resolverNames: string[];
  /** Project root directory. */
  projectRoot: string;
  /** Domain directory mapping from EA config. */
  domainDirs: Record<string, string>;
  /** If true, don't write files — just report. */
  dryRun?: boolean;
  /** Resolver cache for caching observed state. */
  cache?: import("./cache.js").ResolverCache;
}

/** Interface for a discovery resolver. */
export interface DiscoveryResolver {
  /** Resolver name. */
  name: string;
  /** Discover artifacts from a source. */
  discover(source: string): EaArtifactDraft[];
}

// ─── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Check if a draft matches an existing artifact.
 *
 * Match criteria:
 * 1. Same kind AND at least one anchor value overlaps
 * 2. Same kind AND normalized title matches
 */
export function matchDraftToExisting(
  draft: EaArtifactDraft,
  existing: EaArtifactBase[],
): { match: EaArtifactBase; matchedBy: "anchor" | "title" } | null {
  const sameKind = existing.filter((a) => a.kind === draft.kind);

  // 1. Anchor matching
  if (draft.anchors) {
    for (const artifact of sameKind) {
      if (!artifact.anchors) continue;
      const existingAnchors = artifact.anchors as Record<string, unknown>;

      for (const [anchorKind, draftValues] of Object.entries(draft.anchors)) {
        const existingValues = existingAnchors[anchorKind];
        if (!Array.isArray(existingValues) || !Array.isArray(draftValues)) continue;

        const overlap = draftValues.some((v) =>
          (existingValues as string[]).includes(v),
        );
        if (overlap) {
          return { match: artifact, matchedBy: "anchor" };
        }
      }
    }
  }

  // 2. Title matching (normalized)
  const normalizedTitle = normalizeTitle(draft.title);
  for (const artifact of sameKind) {
    if (normalizeTitle(artifact.title) === normalizedTitle) {
      return { match: artifact, matchedBy: "title" };
    }
  }

  return null;
}

/** Normalize a title for fuzzy comparison. */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Compute new anchors that a draft has but the existing artifact doesn't.
 */
function computeNewAnchors(
  draft: EaArtifactDraft,
  existing: EaArtifactBase,
): Record<string, string[]> | undefined {
  if (!draft.anchors) return undefined;

  const existingAnchors = (existing.anchors ?? {}) as Record<string, unknown>;
  const newAnchors: Record<string, string[]> = {};

  for (const [kind, draftValues] of Object.entries(draft.anchors)) {
    const existingValues = existingAnchors[kind];
    if (!Array.isArray(existingValues)) {
      newAnchors[kind] = draftValues;
    } else {
      const newValues = draftValues.filter(
        (v) => !(existingValues as string[]).includes(v),
      );
      if (newValues.length > 0) {
        newAnchors[kind] = newValues;
      }
    }
  }

  return Object.keys(newAnchors).length > 0 ? newAnchors : undefined;
}

// ─── Draft Writing ──────────────────────────────────────────────────────────────

/**
 * Convert a draft to a full artifact JSON for writing.
 */
function draftToArtifactJson(draft: EaArtifactDraft): Record<string, unknown> {
  return {
    id: draft.suggestedId,
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    schemaVersion: "1.0.0",
    status: "draft",
    confidence: draft.confidence,
    owners: ["discovery-pipeline"],
    tags: ["discovered"],
    anchors: draft.anchors ?? {},
    relations: draft.relations ?? [],
    ...draft.kindSpecificFields,
  };
}

/**
 * Generate a slug from a title.
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Write a draft artifact to disk.
 */
function writeDraftArtifact(
  draft: EaArtifactDraft,
  projectRoot: string,
  domainDirs: Record<string, string>,
): string | null {
  const domain = getDomainForKind(draft.kind);
  if (!domain) return null;

  const domainDir = domainDirs[domain];
  if (!domainDir) return null;

  const dir = join(projectRoot, domainDir);
  mkdirSync(dir, { recursive: true });

  const slug = titleToSlug(draft.title);
  const prefix = getKindPrefix(draft.kind)?.toLowerCase() ?? draft.kind;
  const filename = `${prefix}-${slug}.json`;
  const filepath = join(dir, filename);

  const json = draftToArtifactJson(draft);
  writeFileSync(filepath, JSON.stringify(json, null, 2) + "\n");

  return filepath;
}

// ─── Discovery Pipeline ─────────────────────────────────────────────────────────

/**
 * Run the discovery pipeline:
 * 1. Deduplicate drafts against existing artifacts
 * 2. Matched → report as "already modeled", suggest anchor additions
 * 3. New → write draft files (unless dry-run)
 * 4. Build discovery report
 */
export function discoverArtifacts(options: DiscoveryOptions): DiscoveryReport {
  const {
    existingArtifacts,
    drafts,
    resolverNames,
    projectRoot,
    domainDirs,
    dryRun,
  } = options;

  const newArtifacts: DiscoveryReport["newArtifacts"] = [];
  const matchedExisting: DiscoveryMatch[] = [];
  const suggestedUpdates: DiscoverySuggestedUpdate[] = [];

  for (const draft of drafts) {
    const matchResult = matchDraftToExisting(draft, existingArtifacts);

    if (matchResult) {
      // Matched existing — suggest anchor additions
      const newAnchors = computeNewAnchors(draft, matchResult.match);
      matchedExisting.push({
        existingId: matchResult.match.id,
        matchedBy: matchResult.matchedBy,
        draft,
        suggestedAnchorsToAdd: newAnchors,
      });

      if (newAnchors) {
        suggestedUpdates.push({
          existingId: matchResult.match.id,
          suggestion: `Add new anchors from discovery: ${JSON.stringify(newAnchors)}`,
          source: draft.discoveredBy,
        });
      }
    } else {
      // New artifact — write draft
      let writtenTo: string | null = null;
      if (!dryRun) {
        writtenTo = writeDraftArtifact(draft, projectRoot, domainDirs);
      }

      newArtifacts.push({
        suggestedId: draft.suggestedId,
        kind: draft.kind,
        title: draft.title,
        confidence: draft.confidence,
        discoveredBy: draft.discoveredBy,
        writtenTo,
      });
    }
  }

  return {
    discoveredAt: new Date().toISOString(),
    resolversUsed: resolverNames,
    summary: {
      newArtifacts: newArtifacts.length,
      matchedExisting: matchedExisting.length,
      suggestedUpdates: suggestedUpdates.length,
    },
    newArtifacts,
    matchedExisting,
    suggestedUpdates,
  };
}

// ─── Built-in Resolver: Stub ────────────────────────────────────────────────────

/**
 * A stub resolver that produces no results.
 * Real resolvers (OpenAPI, Kubernetes, Terraform) will be implemented in later issues.
 */
export const stubResolver: DiscoveryResolver = {
  name: "stub",
  discover(): EaArtifactDraft[] {
    return [];
  },
};

/**
 * Create a draft artifact from minimal inputs (helper for resolvers).
 */
export function createDraft(
  kind: string,
  title: string,
  discoveredBy: string,
  options?: {
    confidence?: "observed" | "inferred";
    anchors?: Record<string, string[]>;
    relations?: EaRelation[];
    kindSpecificFields?: Record<string, unknown>;
    summary?: string;
  },
): EaArtifactDraft {
  const prefix = getKindPrefix(kind) ?? kind.toUpperCase();
  const slug = titleToSlug(title);

  return {
    suggestedId: `${prefix}-${slug}`,
    kind,
    title,
    summary: options?.summary ?? `Discovered ${kind}: ${title}`,
    status: "draft",
    confidence: options?.confidence ?? "inferred",
    anchors: options?.anchors,
    relations: options?.relations,
    discoveredBy,
    discoveredAt: new Date().toISOString(),
    kindSpecificFields: options?.kindSpecificFields,
  };
}

/**
 * Render a discovery report as Markdown.
 */
export function renderDiscoveryReportMarkdown(report: DiscoveryReport): string {
  const lines: string[] = [];

  lines.push("# Discovery Report");
  lines.push("");
  lines.push(`> Discovered: ${report.discoveredAt}`);
  lines.push(`> Resolvers: ${report.resolversUsed.join(", ") || "none"}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| New artifacts | ${report.summary.newArtifacts} |`);
  lines.push(`| Matched existing | ${report.summary.matchedExisting} |`);
  lines.push(`| Suggested updates | ${report.summary.suggestedUpdates} |`);
  lines.push("");

  // New artifacts
  if (report.newArtifacts.length > 0) {
    lines.push("## New Artifacts");
    lines.push("");
    lines.push("| ID | Kind | Title | Confidence | Resolver | Written To |");
    lines.push("|----|------|-------|------------|----------|------------|");
    for (const a of report.newArtifacts) {
      lines.push(
        `| \`${a.suggestedId}\` | ${a.kind} | ${a.title} | ${a.confidence} | ${a.discoveredBy} | ${a.writtenTo ?? "—"} |`,
      );
    }
    lines.push("");
  }

  // Matched existing
  if (report.matchedExisting.length > 0) {
    lines.push("## Matched Existing");
    lines.push("");
    lines.push("| Existing ID | Matched By | Draft Kind | New Anchors |");
    lines.push("|-------------|------------|------------|-------------|");
    for (const m of report.matchedExisting) {
      const anchors = m.suggestedAnchorsToAdd
        ? Object.keys(m.suggestedAnchorsToAdd).join(", ")
        : "—";
      lines.push(
        `| \`${m.existingId}\` | ${m.matchedBy} | ${m.draft.kind} | ${anchors} |`,
      );
    }
    lines.push("");
  }

  // Suggested updates
  if (report.suggestedUpdates.length > 0) {
    lines.push("## Suggested Updates");
    lines.push("");
    for (const u of report.suggestedUpdates) {
      lines.push(`- **\`${u.existingId}\`** (from ${u.source}): ${u.suggestion}`);
    }
    lines.push("");
  }

  if (
    report.newArtifacts.length === 0 &&
    report.matchedExisting.length === 0
  ) {
    lines.push("_No artifacts discovered._");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}
