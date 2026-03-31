/**
 * Backstage Entity Accessors
 *
 * Convenience functions for reading fields from BackstageEntity in a way
 * that parallels EaArtifactBase field access. These accessors encapsulate
 * the mapping between the Backstage envelope structure and the flat field
 * access patterns used throughout the codebase.
 *
 * Designed to make module-by-module migration (Phase B) tractable — each module
 * can switch from `artifact.field` to `getEntityField(entity)` without needing
 * to understand the Backstage envelope structure.
 */

import type { BackstageEntity, EntityRelation } from "./types.js";
import { ANNOTATION_KEYS, formatEntityRef } from "./types.js";
import { mapBackstageKind } from "./kind-mapping.js";
import type { KindMappingEntry } from "./kind-mapping.js";
import { extractRelationsFromSpec } from "./relation-mapping.js";

// ─── Identity ───────────────────────────────────────────────────────────────────

/**
 * Get the entity reference string: `[kind:][namespace/]name`
 * This is the Backstage-native equivalent of EaArtifactBase.id.
 */
export function getEntityId(entity: BackstageEntity): string {
  return formatEntityRef(entity.kind, entity.metadata.namespace, entity.metadata.name);
}

/**
 * Get the entity's simple name (metadata.name).
 */
export function getEntityName(entity: BackstageEntity): string {
  return entity.metadata.name;
}

/**
 * Get the entity's namespace (defaults to "default" if unset).
 */
export function getEntityNamespace(entity: BackstageEntity): string {
  return entity.metadata.namespace ?? "default";
}

// ─── Display ────────────────────────────────────────────────────────────────────

/**
 * Get the human-readable title. Falls back to metadata.name.
 * Equivalent to EaArtifactBase.title.
 */
export function getEntityTitle(entity: BackstageEntity): string {
  return entity.metadata.title ?? entity.metadata.name;
}

/**
 * Get the human-readable description.
 * Equivalent to EaArtifactBase.summary.
 */
export function getEntityDescription(entity: BackstageEntity): string {
  return entity.metadata.description ?? "";
}

// ─── Kind & Type ────────────────────────────────────────────────────────────────

/**
 * Get the legacy kebab-case kind (e.g., "service", "api-contract").
 * Uses the kind mapping registry to reverse-map from Backstage kind + spec.type.
 */
export function getEntityLegacyKind(entity: BackstageEntity): string {
  const specType = typeof entity.spec?.type === "string" ? entity.spec.type : undefined;
  const mapping = mapBackstageKind(entity.apiVersion, entity.kind, specType);
  return mapping?.legacyKind ?? entity.kind.toLowerCase();
}

/**
 * Get the kind mapping entry for this entity, or undefined if not mapped.
 */
export function getEntityKindMapping(entity: BackstageEntity): KindMappingEntry | undefined {
  const specType = typeof entity.spec?.type === "string" ? entity.spec.type : undefined;
  return mapBackstageKind(entity.apiVersion, entity.kind, specType);
}

/**
 * Get the spec.type value (e.g., "service", "openapi", "database").
 */
export function getEntitySpecType(entity: BackstageEntity): string | undefined {
  return typeof entity.spec?.type === "string" ? entity.spec.type : undefined;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────────

/** Status values aligned with EaArtifactBase.status. */
export type EntityStatus = "draft" | "planned" | "active" | "shipped" | "deprecated" | "retired" | "deferred";

/**
 * Get the lifecycle status mapped to EaArtifactBase-compatible status values.
 *
 * Reads from `spec.status` first (custom kinds like Requirement, Decision),
 * then `spec.lifecycle` (Backstage convention).
 *
 * Equivalent to EaArtifactBase.status.
 */
export function getEntityStatus(entity: BackstageEntity): EntityStatus {
  const spec = entity.spec ?? {};
  const specStatus = typeof spec.status === "string" ? spec.status : undefined;
  const lifecycle = typeof spec.lifecycle === "string" ? spec.lifecycle : undefined;

  // Custom status takes precedence
  if (specStatus) {
    const statusMap: Record<string, EntityStatus> = {
      proposed: "draft",
      accepted: "active",
      shipped: "shipped",
      deprecated: "deprecated",
      superseded: "deprecated",
      retired: "retired",
      "in-progress": "active",
    };
    return statusMap[specStatus] ?? (specStatus as EntityStatus);
  }

  if (!lifecycle) return "draft";

  const lifecycleMap: Record<string, EntityStatus> = {
    experimental: "draft",
    development: "planned",
    production: "active",
    deprecated: "deprecated",
    retired: "retired",
  };

  return lifecycleMap[lifecycle] ?? "active";
}

/**
 * Get the raw lifecycle string from spec.lifecycle.
 * Returns undefined if not set.
 */
export function getEntityLifecycle(entity: BackstageEntity): string | undefined {
  return typeof entity.spec?.lifecycle === "string" ? entity.spec.lifecycle : undefined;
}

// ─── Ownership ──────────────────────────────────────────────────────────────────

/**
 * Get the entity owners as an array of strings.
 * Parses the entity ref in spec.owner.
 * Equivalent to EaArtifactBase.owners.
 */
export function getEntityOwners(entity: BackstageEntity): string[] {
  const owner = entity.spec?.owner;
  if (typeof owner !== "string" || !owner) return ["unassigned"];
  return [owner];
}

/**
 * Get the raw owner entity ref string (e.g., "group:default/platform-team").
 */
export function getEntityOwnerRef(entity: BackstageEntity): string | undefined {
  const owner = entity.spec?.owner;
  return typeof owner === "string" ? owner : undefined;
}

// ─── Tags ───────────────────────────────────────────────────────────────────────

/**
 * Get the entity's tags.
 * Equivalent to EaArtifactBase.tags.
 */
export function getEntityTags(entity: BackstageEntity): string[] {
  return entity.metadata.tags ?? [];
}

// ─── Annotations ────────────────────────────────────────────────────────────────

/**
 * Get an annotation value by key.
 */
export function getAnnotation(entity: BackstageEntity, key: string): string | undefined {
  return entity.metadata.annotations?.[key];
}

/**
 * Get all annotations as a record.
 */
export function getAnnotations(entity: BackstageEntity): Record<string, string> {
  return entity.metadata.annotations ?? {};
}

/**
 * Get the confidence level from the anchored-spec annotation.
 * Equivalent to EaArtifactBase.confidence.
 */
export function getEntityConfidence(entity: BackstageEntity): "declared" | "observed" | "inferred" {
  const value = getAnnotation(entity, ANNOTATION_KEYS.CONFIDENCE);
  if (value === "observed" || value === "declared" || value === "inferred") {
    return value;
  }
  return "declared";
}

/**
 * Get the risk level from the anchored-spec annotation.
 * Returns undefined if not set.
 */
export function getEntityRisk(entity: BackstageEntity): string | undefined {
  return getAnnotation(entity, ANNOTATION_KEYS.RISK);
}

/**
 * Get compliance frameworks from the anchored-spec annotation.
 * Returns an array of framework identifiers.
 */
export function getEntityCompliance(entity: BackstageEntity): string[] {
  const value = getAnnotation(entity, ANNOTATION_KEYS.COMPLIANCE);
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Get the source document path from the anchored-spec annotation.
 */
export function getEntitySource(entity: BackstageEntity): string | undefined {
  return getAnnotation(entity, ANNOTATION_KEYS.SOURCE);
}

/**
 * Get all traceRefs from spec.traceRefs (full fidelity) or the source annotation (single ref).
 * Returns an array of `{ path, role? }` objects.
 */
export function getEntityTraceRefs(entity: BackstageEntity): Array<{ path: string; role?: string }> {
  // Prefer spec.traceRefs — preserves all refs with role metadata
  const specRefs = entity.spec?.traceRefs;
  if (Array.isArray(specRefs) && specRefs.length > 0) {
    return (specRefs as Array<{ path?: string; role?: string }>)
      .filter((r) => typeof r.path === "string")
      .map((r) => ({
        path: r.path as string,
        ...(typeof r.role === "string" && { role: r.role }),
      }));
  }

  // Fall back to source annotation
  const source = getAnnotation(entity, ANNOTATION_KEYS.SOURCE);
  if (!source) return [];
  return [{ path: source, role: "specification" }];
}

/**
 * Get expected anchors from the anchored-spec annotation.
 */
export function getEntityExpectAnchors(entity: BackstageEntity): string[] {
  const value = getAnnotation(entity, ANNOTATION_KEYS.EXPECT_ANCHORS);
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Get suppressed rules from the anchored-spec annotation.
 */
export function getEntitySuppressions(entity: BackstageEntity): string[] {
  const value = getAnnotation(entity, ANNOTATION_KEYS.SUPPRESS);
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * Get the legacy artifact ID preserved during bridge conversion.
 */
export function getEntityLegacyId(entity: BackstageEntity): string | undefined {
  return getAnnotation(entity, ANNOTATION_KEYS.LEGACY_ID);
}

// ─── Labels ─────────────────────────────────────────────────────────────────────

/**
 * Get a label value by key.
 */
export function getLabel(entity: BackstageEntity, key: string): string | undefined {
  return entity.metadata.labels?.[key];
}

/**
 * Get all labels as a record.
 */
export function getLabels(entity: BackstageEntity): Record<string, string> {
  return entity.metadata.labels ?? {};
}

// ─── Relations ──────────────────────────────────────────────────────────────────

/**
 * Get entity relations extracted from spec fields.
 *
 * Returns relations in the legacy format: `{ legacyType, targets }[]`.
 * Use this when migrating modules that consume `EaArtifactBase.relations`.
 */
export function getEntitySpecRelations(entity: BackstageEntity): Array<{ legacyType: string; targets: string[] }> {
  return extractRelationsFromSpec(entity.spec ?? {});
}

/**
 * Get the computed relations array (Backstage format).
 * These may be set by the catalog or computed at load time.
 */
export function getEntityRelations(entity: BackstageEntity): EntityRelation[] {
  return entity.relations ?? [];
}

/**
 * Get targets from a specific spec field (e.g., "dependsOn", "consumesApis").
 */
export function getSpecFieldTargets(entity: BackstageEntity, field: string): string[] {
  const value = entity.spec?.[field];
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") return [value];
  return [];
}

// ─── Spec Access ────────────────────────────────────────────────────────────────

/**
 * Get a typed spec field value.
 */
export function getSpecField<T = unknown>(entity: BackstageEntity, field: string): T | undefined {
  return entity.spec?.[field] as T | undefined;
}

/**
 * Get the full spec object.
 */
export function getSpec(entity: BackstageEntity): Record<string, unknown> {
  return entity.spec ?? {};
}

// ─── System & Domain Grouping ───────────────────────────────────────────────────

/**
 * Get the system this entity belongs to (from spec.system).
 */
export function getEntitySystem(entity: BackstageEntity): string | undefined {
  return typeof entity.spec?.system === "string" ? entity.spec.system : undefined;
}

/**
 * Get the domain this entity belongs to (from spec.domain or kind-mapping).
 */
export function getEntityDomain(entity: BackstageEntity): string | undefined {
  // Direct domain field (System kind)
  if (typeof entity.spec?.domain === "string") return entity.spec.domain;

  // Via kind mapping
  const mapping = getEntityKindMapping(entity);
  if (mapping) {
    // Legacy kinds carry domain in the mapping entry's prefix structure
    // We need to look up from the legacy kind → EA_KIND_REGISTRY for domain
    // For now, return undefined; the kind mapping doesn't carry domain
  }

  return undefined;
}

// ─── Links ──────────────────────────────────────────────────────────────────────

/**
 * Get external links associated with this entity.
 */
export function getEntityLinks(entity: BackstageEntity): Array<{ url: string; title?: string; icon?: string; type?: string }> {
  return entity.metadata.links ?? [];
}
