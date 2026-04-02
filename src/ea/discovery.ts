/**
 * Anchored Spec — EA Discovery Pipeline
 *
 * Discovers new EA entities by scanning sources (e.g., OpenAPI specs,
 * Kubernetes manifests, Terraform state). Creates draft entities with
 * confidence "inferred" or "observed", never overwrites existing entities.
 *
 * Design reference: docs/delivery/discovery-drift-generation.md (Discovery workflow)
 * Conflict rule: docs/delivery/discovery-drift-generation.md (declared data remains primary)
 */

import type { BackstageEntity } from "./backstage/types.js";
import {
  ANNOTATION_KEYS,
  normalizeEntityRef,
  parseEntityRef,
  relationTypeToSpecEntry,
} from "./backstage/index.js";
import type { EntityDescriptor } from "./backstage/kind-mapping.js";
import {
  getEntityAnchors,
  getEntityId,
  getEntitySchema,
  getEntityTitle,
} from "./backstage/accessors.js";
import { writeEntity } from "./backstage/entity-writer.js";
import type { AnchoredSpecConfigV1 } from "./config.js";
import type { EaRelation } from "./types.js";

// ─── Discovery Types ────────────────────────────────────────────────────────────

/** A draft entity produced by discovery. */
export interface EntityDraft {
  /** Suggested canonical entity ref. */
  suggestedId: string;
  /** Backstage or anchored-spec entity kind. */
  kind: string;
  /** Optional `spec.type` discriminator for the entity kind. */
  type?: string;
  /** Anchored-spec schema profile for validation and policy. */
  schema: string;
  /** API version for the entity kind. */
  apiVersion: string;
  /** Human-readable title. */
  title: string;
  /** Description of what was discovered. */
  summary: string;
  /** Always "draft" for discovered entities. */
  status: "draft";
  /** How this was discovered. */
  confidence: "observed" | "inferred";
  /** Anchors linking to the discovery source. */
  anchors?: Record<string, string[]>;
  /** Inferred relations to other entities. */
  relations?: EaRelation[];
  /** Which resolver produced this draft. */
  discoveredBy: string;
  /** ISO 8601 timestamp of discovery. */
  discoveredAt: string;
  /** Schema-specific fields. */
  schemaFields?: Record<string, unknown>;
}

/** A match between a discovered draft and an existing entity. */
export interface DiscoveryMatch {
  /** Existing entity ref. */
  existingId: string;
  /** How the match was determined. */
  matchedBy: "anchor" | "title";
  /** The draft that matched. */
  draft: EntityDraft;
  /** New anchors that could be added to the existing entity. */
  suggestedAnchorsToAdd?: Record<string, string[]>;
}

/** A suggestion to update an existing entity. */
export interface DiscoverySuggestedUpdate {
  /** Existing entity ref to update. */
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
    newEntities: number;
    matchedExisting: number;
    suggestedUpdates: number;
  };
  /** New entities that were created. */
  newEntities: Array<{
    suggestedId: string;
    kind: string;
    type?: string;
    schema: string;
    title: string;
    confidence: string;
    discoveredBy: string;
    writtenTo: string | null;
  }>;
  /** Drafts that matched existing entities. */
  matchedExisting: DiscoveryMatch[];
  /** Suggestions for existing entities. */
  suggestedUpdates: DiscoverySuggestedUpdate[];
}

/** Options for the discovery pipeline. */
export interface DiscoveryOptions {
  /** Existing loaded entities to deduplicate against. */
  existingEntities: BackstageEntity[];
  /** Draft entities from resolvers. */
  drafts: EntityDraft[];
  /** Resolver names that were used. */
  resolverNames: string[];
  /** Project root directory. */
  projectRoot: string;
  /** Resolved project config. */
  config: AnchoredSpecConfigV1;
  /** If true, don't write files — just report. */
  dryRun?: boolean;
  /** Resolver cache for caching observed state. */
  cache?: import("./cache.js").ResolverCache;
}

/** Interface for a discovery resolver. */
export interface DiscoveryResolver {
  /** Resolver name. */
  name: string;
  /** Discover entities from a source. */
  discover(source: string): EntityDraft[];
}

function getExistingId(value: BackstageEntity): string {
  return getEntityId(value);
}

function getExistingSchema(value: BackstageEntity): string {
  return getEntitySchema(value);
}

function getExistingTitle(value: BackstageEntity): string {
  return getEntityTitle(value);
}

function getExistingAnchors(value: BackstageEntity): Record<string, unknown> {
  return (getEntityAnchors(value) ?? {}) as Record<string, unknown>;
}

// ─── Deduplication ──────────────────────────────────────────────────────────────

/**
 * Check if a draft matches an existing entity.
 *
 * Match criteria:
 * 1. Same schema AND at least one anchor value overlaps
 * 2. Same schema AND normalized title matches
 */
export function matchDraftToExisting(
  draft: EntityDraft,
  existing: BackstageEntity[],
): { match: BackstageEntity; matchedBy: "anchor" | "title" } | null {
  const sameSchema = existing.filter((entity) => getExistingSchema(entity) === draft.schema);

  if (draft.anchors) {
    for (const entity of sameSchema) {
      const existingAnchors = getExistingAnchors(entity);
      for (const [anchorKind, draftValues] of Object.entries(draft.anchors)) {
        const existingValues = existingAnchors[anchorKind];
        if (!Array.isArray(existingValues) || !Array.isArray(draftValues)) continue;

        const overlap = draftValues.some((value) => (existingValues as string[]).includes(value));
        if (overlap) {
          return { match: entity, matchedBy: "anchor" };
        }
      }
    }
  }

  const normalizedTitle = normalizeTitle(draft.title);
  for (const entity of sameSchema) {
    if (normalizeTitle(getExistingTitle(entity)) === normalizedTitle) {
      return { match: entity, matchedBy: "title" };
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
 * Compute new anchors that a draft has but the existing entity doesn't.
 */
function computeNewAnchors(
  draft: EntityDraft,
  existing: BackstageEntity,
): Record<string, string[]> | undefined {
  if (!draft.anchors) return undefined;

  const existingAnchors = getExistingAnchors(existing);
  const newAnchors: Record<string, string[]> = {};

  for (const [kind, draftValues] of Object.entries(draft.anchors)) {
    const existingValues = existingAnchors[kind];
    if (!Array.isArray(existingValues)) {
      newAnchors[kind] = draftValues;
    } else {
      const newValues = draftValues.filter((value) => !(existingValues as string[]).includes(value));
      if (newValues.length > 0) {
        newAnchors[kind] = newValues;
      }
    }
  }

  return Object.keys(newAnchors).length > 0 ? newAnchors : undefined;
}

// ─── Draft Writing ──────────────────────────────────────────────────────────────

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

function tryParseEntityRef(value: string): ReturnType<typeof parseEntityRef> | null {
  try {
    return parseEntityRef(value);
  } catch {
    return null;
  }
}

function toCanonicalTargetRef(target: string): string {
  const parsed = tryParseEntityRef(target);
  if (parsed) {
    return normalizeEntityRef(parsed, { defaultNamespace: "default" });
  }

  return target;
}

/** Convert a draft into a Backstage entity ready for supported writers. */
function draftToEntity(draft: EntityDraft): BackstageEntity | null {
  const parsedRef = tryParseEntityRef(draft.suggestedId);
  if (!parsedRef) return null;

  const metadataName = parsedRef.name;
  const metadataNamespace = parsedRef?.namespace;

  const metadata: BackstageEntity["metadata"] = {
    name: metadataName,
    ...(metadataNamespace ? { namespace: metadataNamespace } : {}),
    ...(draft.title !== metadataName ? { title: draft.title } : {}),
    ...(draft.summary ? { description: draft.summary } : {}),
    tags: ["discovered"],
    annotations: {
      [ANNOTATION_KEYS.CONFIDENCE]: draft.confidence,
    },
  };

  const spec: Record<string, unknown> = {
    lifecycle: "experimental",
    owner: "group:default/discovery-pipeline",
    ...(draft.type ? { type: draft.type } : {}),
    ...(draft.anchors ? { anchors: draft.anchors } : {}),
  };

  for (const relation of draft.relations ?? []) {
    const mapped = relationTypeToSpecEntry(relation.type, toCanonicalTargetRef(relation.target));
    if (!mapped) continue;

    if (mapped.specField === "owner") {
      spec.owner = mapped.targetRef;
      continue;
    }

    const existing = spec[mapped.specField];
    if (Array.isArray(existing)) {
      (existing as string[]).push(mapped.targetRef);
    } else {
      spec[mapped.specField] = [mapped.targetRef];
    }
  }

  for (const [key, value] of Object.entries(draft.schemaFields ?? {})) {
    if (!(key in spec)) {
      spec[key] = value;
    }
  }

  return {
    apiVersion: draft.apiVersion,
    kind: draft.kind,
    metadata,
    spec,
  };
}

async function writeDraftEntity(
  draft: EntityDraft,
  projectRoot: string,
  config: AnchoredSpecConfigV1,
): Promise<string | null> {
  const entity = draftToEntity(draft);
  if (!entity) return null;
  const result = await writeEntity(entity, config, projectRoot);
  return result.filePath;
}

// ─── Discovery Pipeline ─────────────────────────────────────────────────────────

/**
 * Run the discovery pipeline:
 * 1. Deduplicate drafts against existing entities
 * 2. Matched → report as "already modeled", suggest anchor additions
 * 3. New → write draft files (unless dry-run)
 * 4. Build discovery report
 */
export async function discoverEntities(options: DiscoveryOptions): Promise<DiscoveryReport> {
  const {
    existingEntities,
    drafts,
    resolverNames,
    projectRoot,
    config,
    dryRun,
  } = options;

  const newEntities: DiscoveryReport["newEntities"] = [];
  const matchedExisting: DiscoveryMatch[] = [];
  const suggestedUpdates: DiscoverySuggestedUpdate[] = [];

  for (const draft of drafts) {
    const matchResult = matchDraftToExisting(draft, existingEntities);

    if (matchResult) {
      const newAnchors = computeNewAnchors(draft, matchResult.match);
      matchedExisting.push({
        existingId: getExistingId(matchResult.match),
        matchedBy: matchResult.matchedBy,
        draft,
        suggestedAnchorsToAdd: newAnchors,
      });

      if (newAnchors) {
        suggestedUpdates.push({
          existingId: getExistingId(matchResult.match),
          suggestion: `Add new anchors from discovery: ${JSON.stringify(newAnchors)}`,
          source: draft.discoveredBy,
        });
      }
      continue;
    }

    let writtenTo: string | null = null;
    if (!dryRun) {
      writtenTo = await writeDraftEntity(draft, projectRoot, config);
    }

    newEntities.push({
      suggestedId: draft.suggestedId,
      kind: draft.kind,
      type: draft.type,
      schema: draft.schema,
      title: draft.title,
      confidence: draft.confidence,
      discoveredBy: draft.discoveredBy,
      writtenTo,
    });
  }

  return {
    discoveredAt: new Date().toISOString(),
    resolversUsed: resolverNames,
    summary: {
      newEntities: newEntities.length,
      matchedExisting: matchedExisting.length,
      suggestedUpdates: suggestedUpdates.length,
    },
    newEntities,
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
  discover(): EntityDraft[] {
    return [];
  },
};

/**
 * Create a draft entity from minimal inputs (helper for resolvers).
 */
export interface DraftEntityDescriptor {
  apiVersion: string;
  kind: string;
  type?: string;
  specType?: string;
  schema: string;
}

export function createDraft(
  descriptor: DraftEntityDescriptor | EntityDescriptor,
  title: string,
  discoveredBy: string,
  options?: {
    confidence?: "observed" | "inferred";
    anchors?: Record<string, string[]>;
    relations?: EaRelation[];
    schemaFields?: Record<string, unknown>;
    summary?: string;
  },
): EntityDraft {
  const slug = titleToSlug(title);
  const suggestedId = `${descriptor.kind.toLowerCase()}:${slug}`;
  const type = "type" in descriptor && descriptor.type !== undefined
    ? descriptor.type
    : descriptor.specType;

  return {
    suggestedId,
    apiVersion: descriptor.apiVersion,
    kind: descriptor.kind,
    type,
    schema: descriptor.schema,
    title,
    summary: options?.summary ?? `Discovered ${descriptor.schema}: ${title}`,
    status: "draft",
    confidence: options?.confidence ?? "inferred",
    anchors: options?.anchors,
    relations: options?.relations,
    discoveredBy,
    discoveredAt: new Date().toISOString(),
    schemaFields: options?.schemaFields,
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

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| New entities | ${report.summary.newEntities} |`);
  lines.push(`| Matched existing | ${report.summary.matchedExisting} |`);
  lines.push(`| Suggested updates | ${report.summary.suggestedUpdates} |`);
  lines.push("");

  if (report.newEntities.length > 0) {
    lines.push("## New Entities");
    lines.push("");
    lines.push("| ID | Kind | Title | Confidence | Resolver | Written To |");
    lines.push("|----|------|-------|------------|----------|------------|");
    for (const entity of report.newEntities) {
      lines.push(
        `| \`${entity.suggestedId}\` | ${entity.kind}${entity.type ? `/${entity.type}` : ""} | ${entity.title} | ${entity.confidence} | ${entity.discoveredBy} | ${entity.writtenTo ?? "—"} |`,
      );
    }
    lines.push("");
  }

  if (report.matchedExisting.length > 0) {
    lines.push("## Matched Existing");
    lines.push("");
    lines.push("| Existing | Draft | Schema | Match | Suggested Anchors |");
    lines.push("|----------|-------|--------|-------|-------------------|");
    for (const match of report.matchedExisting) {
      lines.push(
        `| \`${match.existingId}\` | \`${match.draft.suggestedId}\` | ${match.draft.schema} | ${match.matchedBy} | ${match.suggestedAnchorsToAdd ? `\`${JSON.stringify(match.suggestedAnchorsToAdd)}\`` : "—"} |`,
      );
    }
    lines.push("");
  }

  if (report.suggestedUpdates.length > 0) {
    lines.push("## Suggested Updates");
    lines.push("");
    lines.push("| Existing | Source | Suggestion |");
    lines.push("|----------|--------|------------|");
    for (const update of report.suggestedUpdates) {
      lines.push(
        `| \`${update.existingId}\` | ${update.source} | ${update.suggestion} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
