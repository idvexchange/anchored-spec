/**
 * Backstage ↔ EaArtifactBase Bridge
 *
 * Bidirectional conversion between Backstage entities and the legacy
 * EaArtifactBase internal representation. This bridge enables Phase A:
 * Backstage I/O while keeping all internal modules unchanged.
 *
 * backstageToArtifact(): BackstageEntity → EaArtifactBase
 * artifactToBackstage(): EaArtifactBase → BackstageEntity
 */

import type { BackstageEntity, EntityMetadata } from "./types.js";
import {
  ANNOTATION_KEYS,
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  parseEntityRef,
  formatEntityRef,
} from "./types.js";
import {
  mapBackstageKind,
  mapLegacyKind,
  mapLegacyPrefix as mapLegacyPrefixFn,
  legacyIdToEntityName,
  entityNameToLegacyId,
} from "./kind-mapping.js";
import {
  extractRelationsFromSpec,
  legacyRelationToSpecEntry,
  RELATION_MAPPING_REGISTRY,
} from "./relation-mapping.js";
import type {
  EaArtifactBase,
  EaRelation,
  EaAnchors,
  EaTraceRef,
  EaRiskAssessment,
  EaComplianceMetadata,
  ArtifactStatus,
  ArtifactConfidence,
} from "../types.js";

// ─── Backstage → EaArtifactBase ─────────────────────────────────────────────────

/**
 * Convert a Backstage entity to an EaArtifactBase for internal module consumption.
 *
 * Maps:
 * - Entity kind + spec.type → legacy kind (via kind mapping registry)
 * - metadata.name → legacy ID (with prefix)
 * - metadata.description → summary
 * - metadata.title → title (falls back to name)
 * - metadata.tags → tags
 * - spec.lifecycle → status
 * - spec.owner → owners[]
 * - anchored-spec.dev/* annotations → confidence, traceRefs, anchors, risk, compliance
 * - spec relation fields → relations[]
 */
export function backstageToArtifact(entity: BackstageEntity): EaArtifactBase {
  const spec = entity.spec ?? {};
  const annotations = entity.metadata.annotations ?? {};

  // Kind mapping
  const specType = typeof spec.type === "string" ? spec.type : undefined;
  const mapping = mapBackstageKind(entity.apiVersion, entity.kind, specType);

  const legacyKind = mapping?.legacyKind ?? entity.kind.toLowerCase();
  const legacyPrefix = mapping?.legacyPrefix;

  // Build legacy ID
  const id = legacyPrefix
    ? `${legacyPrefix}-${entity.metadata.name}`
    : annotations[ANNOTATION_KEYS.LEGACY_ID] ?? entity.metadata.name;

  // Map lifecycle → status
  const status = mapLifecycleToStatus(
    typeof spec.lifecycle === "string" ? spec.lifecycle : undefined,
    typeof spec.status === "string" ? spec.status : undefined,
  );

  // Extract confidence from annotation
  const confidence = mapAnnotationConfidence(annotations[ANNOTATION_KEYS.CONFIDENCE]);

  // Extract owners
  const owners = extractOwners(spec, entity.metadata);

  // Build relations from spec fields
  const relations = buildRelationsFromSpec(spec, entity.kind);

  // Build anchors: prefer spec.anchors (full fidelity), fall back to expect-anchors annotation
  const specAnchors = spec?.anchors;
  const anchors = (specAnchors && typeof specAnchors === "object" && !Array.isArray(specAnchors))
    ? specAnchors as EaAnchors
    : buildAnchorsFromAnnotations(annotations);

  // Build trace refs from spec.traceRefs (full fidelity) or source annotation (single ref)
  const traceRefs = buildTraceRefs(annotations, spec);

  // Build risk from annotation
  const risk = buildRisk(annotations);

  // Build compliance from annotation
  const compliance = buildCompliance(annotations);

  const artifact: EaArtifactBase = {
    id,
    schemaVersion: "1.0.0",
    kind: legacyKind,
    title: entity.metadata.title ?? entity.metadata.name,
    status,
    summary: entity.metadata.description ?? "",
    owners,
    confidence,
    ...(entity.metadata.tags?.length && { tags: entity.metadata.tags }),
    ...(relations.length > 0 && { relations }),
    ...(anchors && { anchors }),
    ...(traceRefs.length > 0 && { traceRefs }),
    ...(risk && { risk }),
    ...(compliance && { compliance }),
  };

  // Carry forward extensions from spec fields not consumed by relation mapping
  const extensions = extractExtensions(spec, entity.kind);
  if (Object.keys(extensions).length > 0) {
    artifact.extensions = extensions;
  }

  return artifact;
}

// ─── EaArtifactBase → Backstage ─────────────────────────────────────────────────

/**
 * Convert an EaArtifactBase to a Backstage entity for external I/O.
 *
 * Inverse of backstageToArtifact().
 */
export function artifactToBackstage(artifact: EaArtifactBase): BackstageEntity {
  const mapping = mapLegacyKind(artifact.kind);

  const apiVersion = mapping?.apiVersion ?? ANCHORED_SPEC_API_VERSION;
  const kind = mapping?.backstageKind ?? artifact.kind;
  const entityName = legacyIdToEntityName(artifact.id);

  // Build metadata
  const metadata: EntityMetadata = {
    name: entityName,
    ...(artifact.title !== entityName && { title: artifact.title }),
    ...(artifact.summary && { description: artifact.summary }),
    ...(artifact.tags?.length && { tags: artifact.tags }),
  };

  // Build annotations
  const annotations: Record<string, string> = {};

  // Source annotation from traceRefs — use best heuristic for primary
  if (artifact.traceRefs?.length) {
    // 1. Prefer role=specification, 2. first .md file, 3. first ref
    const specRef = artifact.traceRefs.find((r) => r.role === "specification");
    const docRef = !specRef ? artifact.traceRefs.find((r) => r.path.endsWith(".md")) : undefined;
    const primary = specRef ?? docRef ?? artifact.traceRefs[0];
    if (primary) {
      annotations[ANNOTATION_KEYS.SOURCE] = primary.path;
    }
  }

  // Confidence
  if (artifact.confidence && artifact.confidence !== "declared") {
    annotations[ANNOTATION_KEYS.CONFIDENCE] = artifact.confidence;
  }

  // Anchors → expect-anchors CSV
  const anchorValues = flattenAnchors(artifact.anchors);
  if (anchorValues.length > 0) {
    annotations[ANNOTATION_KEYS.EXPECT_ANCHORS] = anchorValues.join(",");
  }

  // Risk
  if (artifact.risk) {
    annotations[ANNOTATION_KEYS.RISK] = artifact.risk.level;
  }

  // Compliance
  if (artifact.compliance?.frameworks?.length) {
    annotations[ANNOTATION_KEYS.COMPLIANCE] = artifact.compliance.frameworks.join(",");
  }

  // Legacy ID for round-trip
  annotations[ANNOTATION_KEYS.LEGACY_ID] = artifact.id;
  annotations[ANNOTATION_KEYS.LEGACY_KIND] = artifact.kind;

  if (Object.keys(annotations).length > 0) {
    metadata.annotations = annotations;
  }

  // Build spec
  const spec: Record<string, unknown> = {};

  // spec.type from mapping
  if (mapping?.specType) {
    spec.type = mapping.specType;
  }

  // spec.lifecycle from status
  spec.lifecycle = mapStatusToLifecycle(artifact.status);

  // spec.owner
  if (artifact.owners.length > 0) {
    spec.owner = artifact.owners[0];
  }

  // Relations → spec fields
  if (artifact.relations) {
    for (const rel of artifact.relations) {
      const targetRef = convertTargetToEntityRef(rel.target);
      const entry = legacyRelationToSpecEntry(rel.type, targetRef);

      if (entry) {
        if (entry.specField === "owner") {
          spec.owner = entry.targetRef;
        } else {
          const existing = spec[entry.specField];
          if (Array.isArray(existing)) {
            (existing as string[]).push(entry.targetRef);
          } else {
            spec[entry.specField] = [entry.targetRef];
          }
        }
      }
    }
  }

  // Carry forward extensions to spec
  if (artifact.extensions) {
    for (const [key, value] of Object.entries(artifact.extensions)) {
      if (!(key in spec)) {
        spec[key] = value;
      }
    }
  }

  // Preserve all traceRefs in spec.traceRefs (when multiple exist)
  if (artifact.traceRefs && artifact.traceRefs.length > 1) {
    spec.traceRefs = artifact.traceRefs.map((r) => ({
      path: r.path,
      ...(r.role && { role: r.role }),
    }));
  }

  // Preserve structured anchors in spec.anchors (full fidelity)
  if (artifact.anchors) {
    spec.anchors = artifact.anchors;
  }

  return {
    apiVersion,
    kind,
    metadata,
    spec,
  };
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

/** Map Backstage lifecycle / custom status to EaArtifactBase status. */
function mapLifecycleToStatus(lifecycle?: string, specStatus?: string): ArtifactStatus {
  // Custom status takes precedence (used by custom kinds like Requirement, Decision)
  if (specStatus) {
    const statusMap: Record<string, ArtifactStatus> = {
      proposed: "draft",
      accepted: "active",
      shipped: "shipped",
      deprecated: "deprecated",
      superseded: "deprecated",
      retired: "retired",
      "in-progress": "active",
    };
    return statusMap[specStatus] ?? (specStatus as ArtifactStatus);
  }

  if (!lifecycle) return "draft";

  const lifecycleMap: Record<string, ArtifactStatus> = {
    experimental: "draft",
    development: "planned",
    production: "active",
    deprecated: "deprecated",
    retired: "retired",
  };

  return lifecycleMap[lifecycle] ?? "active";
}

/** Map EaArtifactBase status to Backstage lifecycle. */
function mapStatusToLifecycle(status: ArtifactStatus): string {
  const map: Record<ArtifactStatus, string> = {
    draft: "experimental",
    planned: "development",
    active: "production",
    shipped: "production",
    deprecated: "deprecated",
    retired: "retired",
    deferred: "experimental",
  };
  return map[status] ?? "production";
}

/** Map annotation confidence value to ArtifactConfidence. */
function mapAnnotationConfidence(value?: string): ArtifactConfidence {
  if (value === "observed" || value === "declared" || value === "verified") {
    return value === "verified" ? "declared" : value;
  }
  return "declared";
}

/** Extract owners from spec.owner and metadata. */
function extractOwners(spec: Record<string, unknown>, metadata: EntityMetadata): string[] {
  const owners: string[] = [];

  if (typeof spec.owner === "string") {
    // Parse entity ref to get the name
    try {
      const ref = parseEntityRef(spec.owner);
      owners.push(ref.name);
    } catch {
      owners.push(spec.owner);
    }
  }

  if (owners.length === 0) {
    owners.push("unassigned");
  }

  return owners;
}

/** Build EaRelation[] from Backstage spec relation fields. */
function buildRelationsFromSpec(spec: Record<string, unknown>, entityKind: string): EaRelation[] {
  const extracted = extractRelationsFromSpec(spec);
  const relations: EaRelation[] = [];

  for (const { legacyType, targets } of extracted) {
    // Skip owner — it's handled separately
    if (legacyType === "owns") continue;

    for (const target of targets) {
      relations.push({
        type: legacyType,
        target: convertEntityRefToTarget(target),
      });
    }
  }

  return relations;
}

/** Build EaAnchors from expect-anchors annotation. */
function buildAnchorsFromAnnotations(annotations: Record<string, string>): EaAnchors | undefined {
  const expectAnchors = annotations[ANNOTATION_KEYS.EXPECT_ANCHORS];
  if (!expectAnchors) return undefined;

  const values = expectAnchors.split(",").map((s) => s.trim()).filter(Boolean);
  if (values.length === 0) return undefined;

  // Put all anchors in symbols by default; more specific categorization
  // would need kind-aware logic
  return { symbols: values };
}

/** Build EaTraceRef[] from spec.traceRefs (full fidelity) or source annotation (single ref fallback). */
function buildTraceRefs(annotations: Record<string, string>, spec: Record<string, unknown>): EaTraceRef[] {
  // Prefer spec.traceRefs — preserves all refs with role metadata
  if (Array.isArray(spec.traceRefs) && spec.traceRefs.length > 0) {
    return (spec.traceRefs as Array<{ path?: string; role?: string }>)
      .filter((r) => typeof r.path === "string")
      .map((r) => {
        const ref: EaTraceRef = { path: r.path as string };
        if (typeof r.role === "string") {
          ref.role = r.role as EaTraceRef["role"];
        }
        return ref;
      });
  }

  // Fall back to source annotation (single ref)
  const source = annotations[ANNOTATION_KEYS.SOURCE];
  if (!source) return [];

  return [{
    path: source,
    role: "specification",
  }];
}

/** Build EaRiskAssessment from risk annotation. */
function buildRisk(annotations: Record<string, string>): EaRiskAssessment | undefined {
  const risk = annotations[ANNOTATION_KEYS.RISK];
  if (!risk) return undefined;

  const validLevels = ["low", "medium", "high", "critical"] as const;
  const level = risk === "moderate" ? "medium" : risk;

  if (validLevels.includes(level as (typeof validLevels)[number])) {
    return { level: level as EaRiskAssessment["level"] };
  }

  return undefined;
}

/** Build EaComplianceMetadata from compliance annotation. */
function buildCompliance(annotations: Record<string, string>): EaComplianceMetadata | undefined {
  const compliance = annotations[ANNOTATION_KEYS.COMPLIANCE];
  if (!compliance) return undefined;

  const frameworks = compliance.split(",").map((s) => s.trim()).filter(Boolean);
  if (frameworks.length === 0) return undefined;

  return { frameworks };
}

/**
 * Convert a Backstage entity ref to a legacy artifact ID target.
 * E.g., "component:default/verifier-core" → "SVC-verifier-core"
 */
function convertEntityRefToTarget(ref: string): string {
  try {
    const parsed = parseEntityRef(ref);
    if (parsed.kind) {
      return entityNameToLegacyId(
        // Capitalize first letter to match kind format
        parsed.kind.charAt(0).toUpperCase() + parsed.kind.slice(1),
        parsed.name,
      );
    }
    return ref;
  } catch {
    return ref;
  }
}

/**
 * Convert a legacy artifact ID to a Backstage entity ref.
 * E.g., "SVC-verifier-core" → "component:verifier-core"
 */
function convertTargetToEntityRef(target: string): string {
  const mapping = mapLegacyKind(
    // Try to resolve from prefix
    resolveKindFromId(target),
  );

  if (mapping) {
    const name = legacyIdToEntityName(target);
    return formatEntityRef(mapping.backstageKind, undefined, name);
  }

  return target;
}

/** Try to resolve a legacy kind from an artifact ID's prefix. */
function resolveKindFromId(id: string): string {
  const localId = id.includes("/") ? id.split("/").pop()! : id;
  const dashIndex = localId.indexOf("-");
  if (dashIndex < 0) return "";

  const prefix = localId.slice(0, dashIndex);
  const entry = mapLegacyPrefixFn(prefix);
  return entry?.legacyKind ?? "";
}

/** Flatten all anchor arrays into a single string array. */
function flattenAnchors(anchors?: EaAnchors): string[] {
  if (!anchors) return [];

  const values: string[] = [];
  for (const key of ["symbols", "apis", "events", "schemas", "infra", "catalogRefs", "iam", "network", "statuses", "transitions"] as const) {
    const arr = anchors[key];
    if (arr) values.push(...arr);
  }

  if (anchors.other) {
    for (const arr of Object.values(anchors.other)) {
      values.push(...arr);
    }
  }

  return values;
}

/**
 * Extract spec fields that aren't consumed by relation mapping or standard fields.
 * These become artifact.extensions.
 */
function extractExtensions(spec: Record<string, unknown>, entityKind: string): Record<string, unknown> {
  const standardFields = new Set([
    "type", "lifecycle", "owner", "system",
    "subcomponentOf", "profile", "parent", "children", "members",
    "domain", "traceRefs", "status", "anchors",
  ]);

  // Also exclude all known relation spec fields
  const relationFields = new Set(
    RELATION_MAPPING_REGISTRY.filter((e) => e.specField).map((e) => e.specField!),
  );

  const extensions: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (!standardFields.has(key) && !relationFields.has(key)) {
      extensions[key] = value;
    }
  }

  return extensions;
}
