import type { BackstageEntity } from "../ea/backstage/types.js";
import {
  ANNOTATION_KEYS,
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  formatEntityRef,
  parseEntityRef,
} from "../ea/backstage/index.js";
import {
  legacyIdToEntityName,
  mapLegacyKind,
  mapLegacyPrefix,
} from "../ea/backstage/kind-mapping.js";
import { legacyRelationToSpecEntry } from "../ea/backstage/relation-mapping.js";
import type {
  ArtifactConfidence,
  ArtifactStatus,
  EaAnchors,
  EaComplianceMetadata,
  EaRelation,
  EaRiskAssessment,
  EaTraceRef,
} from "../ea/types.js";

export interface LegacyEntityFixture extends Record<string, unknown> {
  id: string;
  kind: string;
  title?: string;
  summary?: string;
  owners?: string[];
  tags?: string[];
  confidence?: ArtifactConfidence;
  status?: ArtifactStatus;
  relations?: EaRelation[];
  anchors?: EaAnchors;
  traceRefs?: EaTraceRef[];
  risk?: EaRiskAssessment;
  compliance?: EaComplianceMetadata;
  extensions?: Record<string, unknown>;
}

const BASE_KEYS = new Set([
  "id",
  "kind",
  "title",
  "summary",
  "owners",
  "tags",
  "confidence",
  "status",
  "relations",
  "anchors",
  "traceRefs",
  "risk",
  "compliance",
  "extensions",
]);

export function legacyFixtureToEntity(input: LegacyEntityFixture): BackstageEntity {
  const mapping = mapLegacyKind(input.kind);
  if (!mapping) {
    throw new Error(`Unsupported legacy fixture kind: ${input.kind}`);
  }

  const spec: Record<string, unknown> = {
    ...(mapping.specType ? { type: mapping.specType } : {}),
    status: input.status ?? "active",
    lifecycle: statusToLifecycle(input.status ?? "active"),
  };
  if (input.owners) {
    if (input.owners[0]) {
      spec.owner = input.owners[0];
    }
  } else {
    spec.owner = "group:default/team-test";
  }

  if (input.anchors) spec.anchors = input.anchors;
  if (input.traceRefs) spec.traceRefs = input.traceRefs;
  if (input.extensions) Object.assign(spec, input.extensions);

  for (const relation of input.relations ?? []) {
    const mapped = legacyRelationToSpecEntry(
      relation.type,
      normalizeTargetRef(relation.target),
    );
    if (!mapped) continue;
    if (mapped.specField === "owner") {
      spec.owner = mapped.targetRef;
      continue;
    }
    const current = spec[mapped.specField];
    spec[mapped.specField] = Array.isArray(current)
      ? [...current, mapped.targetRef]
      : [mapped.targetRef];
  }

  for (const [key, value] of Object.entries(input)) {
    if (!BASE_KEYS.has(key) && value !== undefined) {
      spec[key] = normalizeSpecValue(value);
    }
  }

  const annotations: Record<string, string> = {
    [ANNOTATION_KEYS.CONFIDENCE]: input.confidence ?? "declared",
    [ANNOTATION_KEYS.LEGACY_KIND]: input.kind,
  };
  if (input.risk?.level) {
    annotations[ANNOTATION_KEYS.RISK] = input.risk.level;
  }
  if (input.compliance?.frameworks?.length) {
    annotations[ANNOTATION_KEYS.COMPLIANCE] = input.compliance.frameworks.join(",");
  }
  if (input.traceRefs?.[0]?.path) {
    annotations[ANNOTATION_KEYS.SOURCE] = input.traceRefs[0].path;
  }

  const metadataName = isEntityRef(input.id)
    ? parseEntityRef(input.id).name
    : legacyIdToEntityName(input.id);

  return {
    apiVersion:
      mapping.apiVersion === BACKSTAGE_API_VERSION
        ? BACKSTAGE_API_VERSION
        : ANCHORED_SPEC_API_VERSION,
    kind: mapping.backstageKind,
    metadata: {
      name: metadataName,
      title: input.title ?? input.id,
      description: input.summary ?? "A well-described test entity.",
      tags: input.tags ?? [],
      annotations,
    },
    spec,
  };
}

function normalizeTargetRef(target: string): string {
  if (isEntityRef(target)) {
    const parsed = parseEntityRef(target);
    return formatEntityRef(parsed.kind, parsed.namespace, parsed.name);
  }

  const localId = target.includes("/") ? target.split("/").pop() ?? target : target;
  const dashIdx = localId.indexOf("-");
  if (dashIdx < 1) return target;

  const prefix = localId.slice(0, dashIdx);
  const slug = localId.slice(dashIdx + 1);
  const mapping = mapLegacyPrefix(prefix);
  if (!mapping) return target;

  return formatEntityRef(mapping.backstageKind, "default", legacyIdToEntityName(`${prefix}-${slug}`));
}

function isEntityRef(value: string): boolean {
  if (!value.includes(":")) return false;
  try {
    parseEntityRef(value);
    return true;
  } catch {
    return false;
  }
}

function statusToLifecycle(status: ArtifactStatus): string {
  switch (status) {
    case "draft":
      return "experimental";
    case "planned":
    case "deferred":
      return "development";
    case "deprecated":
      return "deprecated";
    case "retired":
      return "retired";
    default:
      return "production";
  }
}

function normalizeSpecValue(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizeTargetRef(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => normalizeTargetRef(item));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeSpecValue(nested)]),
    );
  }
  return value;
}
