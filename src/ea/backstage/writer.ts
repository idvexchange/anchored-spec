/**
 * Backstage YAML Writer
 *
 * Serializes BackstageEntity objects to YAML in three modes:
 *   1. Single-document (one entity per file)
 *   2. Multi-document manifest (`---`-separated entities)
 *   3. Frontmatter (YAML frontmatter + markdown body)
 */

import { stringify } from "yaml";
import type { BackstageEntity } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** YAML serialization options. */
export interface WriteOptions {
  /** YAML indentation level (default: 2). */
  indent?: number;
  /** Line width for YAML scalar wrapping (default: 120, 0 to disable). */
  lineWidth?: number;
}

// ─── Single Document ────────────────────────────────────────────────────────────

/**
 * Serialize a single Backstage entity to YAML.
 * The output does NOT include a leading `---` marker.
 */
export function writeBackstageYaml(
  entity: BackstageEntity,
  options?: WriteOptions,
): string {
  const ordered = prepareEntity(entity);
  return stringify(ordered, {
    indent: options?.indent ?? 2,
    lineWidth: options?.lineWidth ?? 120,
  });
}

// ─── Multi-document Manifest ────────────────────────────────────────────────────

/**
 * Serialize multiple Backstage entities to multi-document YAML.
 * Each entity is preceded by a `---` document-start marker,
 * matching the standard Backstage `catalog-info.yaml` format.
 */
export function writeBackstageManifest(
  entities: BackstageEntity[],
  options?: WriteOptions,
): string {
  if (entities.length === 0) return "";

  return entities
    .map((entity) => `---\n${writeBackstageYaml(entity, options)}`)
    .join("");
}

// ─── Frontmatter ────────────────────────────────────────────────────────────────

/**
 * Serialize a Backstage entity as YAML frontmatter wrapping a markdown body.
 *
 * The `markdownBody` is appended verbatim after the closing `---`.
 * For round-trip fidelity, pass the body exactly as returned by
 * `extractMarkdownBody()`.
 *
 * For new files, pass the desired body content (typically starting
 * with `\n` for the conventional blank-line separator).
 */
export function writeBackstageFrontmatter(
  entity: BackstageEntity,
  markdownBody: string = "",
  options?: WriteOptions,
): string {
  const yaml = writeBackstageYaml(entity, options);
  return `---\n${yaml}---\n${markdownBody}`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Ensure top-level entity keys come out in canonical Backstage order:
 * apiVersion → kind → metadata → spec → relations → (everything else).
 */
function prepareEntity(entity: BackstageEntity): Record<string, unknown> {
  const { apiVersion, kind, metadata, spec, relations, ...rest } =
    entity as Record<string, unknown>;

  const result: Record<string, unknown> = { apiVersion, kind };

  if (metadata !== undefined) {
    result.metadata = prepareMetadata(
      metadata as Record<string, unknown>,
    );
  }
  if (spec !== undefined) result.spec = spec;
  if (relations !== undefined) result.relations = relations;

  // Preserve any non-standard top-level keys
  for (const [key, value] of Object.entries(rest)) {
    result[key] = value;
  }

  return result;
}

/**
 * Ensure metadata keys come out in a readable order:
 * name → namespace → title → description → labels → annotations → tags → links.
 */
function prepareMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const {
    name,
    namespace,
    title,
    description,
    labels,
    annotations,
    tags,
    links,
    ...rest
  } = metadata;

  const result: Record<string, unknown> = {};
  if (name !== undefined) result.name = name;
  if (namespace !== undefined) result.namespace = namespace;
  if (title !== undefined) result.title = title;
  if (description !== undefined) result.description = description;
  if (labels !== undefined && hasContent(labels)) result.labels = labels;
  if (annotations !== undefined && hasContent(annotations))
    result.annotations = annotations;
  if (tags !== undefined && hasContent(tags)) result.tags = tags;
  if (links !== undefined && hasContent(links)) result.links = links;

  for (const [key, value] of Object.entries(rest)) {
    result[key] = value;
  }

  return result;
}

/** Check whether a value has meaningful content (non-empty object/array). */
function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object" && value !== null) {
    return Object.keys(value).length > 0;
  }
  return value != null;
}
