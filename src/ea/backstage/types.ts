/**
 * Backstage Entity Types for anchored-spec
 *
 * Core type definitions aligned with Backstage's Software Catalog Entity Model.
 * https://backstage.io/docs/features/software-catalog/descriptor-format/
 *
 * These types define the Backstage-compatible entity format that anchored-spec
 * uses as its wire format. Built-in Backstage kinds (Component, API, Resource,
 * System, Domain, Group) use `backstage.io/v1alpha1`. Custom EA kinds use
 * `anchored-spec.dev/v1alpha1`.
 */

// ─── API Versions ───────────────────────────────────────────────────────────────

/** Backstage built-in API version. */
export const BACKSTAGE_API_VERSION = "backstage.io/v1alpha1" as const;

/** anchored-spec custom kinds API version. */
export const ANCHORED_SPEC_API_VERSION = "anchored-spec.dev/v1alpha1" as const;

/** All recognized API versions. */
export type ApiVersion =
  | typeof BACKSTAGE_API_VERSION
  | typeof ANCHORED_SPEC_API_VERSION;

// ─── Entity Kinds ───────────────────────────────────────────────────────────────

/** Backstage built-in entity kinds. */
export type BackstageBuiltinKind =
  | "Component"
  | "API"
  | "Resource"
  | "System"
  | "Domain"
  | "Group"
  | "User"
  | "Location"
  | "Template";

/** anchored-spec custom entity kinds. */
export type AnchoredSpecKind =
  | "Requirement"
  | "Decision"
  | "CanonicalEntity"
  | "Exchange"
  | "Capability"
  | "ValueStream"
  | "Mission"
  | "Technology"
  | "SystemInterface"
  | "Control"
  | "TransitionPlan"
  | "Exception";

/** All entity kinds. */
export type EntityKind = BackstageBuiltinKind | AnchoredSpecKind;

// ─── Metadata ───────────────────────────────────────────────────────────────────

/** A link associated with an entity. */
export interface EntityLink {
  url: string;
  title?: string;
  icon?: string;
  type?: string;
}

/**
 * Entity metadata — identity, labels, annotations, and tags.
 * Follows the Backstage metadata schema.
 */
export interface EntityMetadata {
  /** The machine-readable name of the entity (unique within namespace + kind). */
  name: string;

  /** The namespace the entity belongs to. Default: "default". */
  namespace?: string;

  /** A human-readable title for display purposes. */
  title?: string;

  /** A human-readable description. */
  description?: string;

  /** Key-value labels for filtering. */
  labels?: Record<string, string>;

  /** Key-value annotations for tooling metadata. */
  annotations?: Record<string, string>;

  /** Freeform string tags for grouping. */
  tags?: string[];

  /** External links associated with this entity. */
  links?: EntityLink[];

  /** Auto-generated UID (populated by Backstage catalog, optional in anchored-spec). */
  uid?: string;

  /** Auto-generated etag for optimistic concurrency. */
  etag?: string;
}

// ─── anchored-spec Annotation Keys ──────────────────────────────────────────────

/**
 * Well-known annotation keys in the `anchored-spec.dev/` namespace.
 * These carry anchored-spec metadata on Backstage-native entities.
 */
export const ANNOTATION_PREFIX = "anchored-spec.dev" as const;

export const ANNOTATION_KEYS = {
  /** Path to the authoritative markdown doc section. */
  SOURCE: `${ANNOTATION_PREFIX}/source`,
  /** Confidence level: observed | declared | verified. */
  CONFIDENCE: `${ANNOTATION_PREFIX}/confidence`,
  /** CSV of expected anchors in the source doc. */
  EXPECT_ANCHORS: `${ANNOTATION_PREFIX}/expect-anchors`,
  /** CSV of compliance framework references. */
  COMPLIANCE: `${ANNOTATION_PREFIX}/compliance`,
  /** Risk classification: low | moderate | high | critical. */
  RISK: `${ANNOTATION_PREFIX}/risk`,
  /** CSV of drift/validation rules to suppress. */
  SUPPRESS: `${ANNOTATION_PREFIX}/suppress`,
  /** Legacy artifact ID (for bridge compatibility). */
  LEGACY_ID: `${ANNOTATION_PREFIX}/legacy-id`,
  /** Legacy artifact kind (for bridge compatibility). */
  LEGACY_KIND: `${ANNOTATION_PREFIX}/legacy-kind`,
} as const;

/** Confidence levels for the confidence annotation. */
export type EntityConfidence = "observed" | "declared" | "verified";

/** Risk levels for the risk annotation. */
export type EntityRisk = "low" | "moderate" | "high" | "critical";

// ─── Entity Spec (kind-specific) ────────────────────────────────────────────────

/**
 * Base spec fields shared by Backstage built-in kinds.
 * Kind-specific specs extend this.
 */
export interface EntitySpecBase {
  /** The subtype within a kind. */
  type?: string;
  /** Entity lifecycle stage. */
  lifecycle?: string;
  /** Owner entity reference (e.g., "group:default/platform-team"). */
  owner?: string;
  /** System this entity belongs to. */
  system?: string;
}

/** Component spec (Backstage built-in). */
export interface ComponentSpec extends EntitySpecBase {
  type: string; // service | library | website | worker | data-pipeline
  lifecycle: string; // experimental | production | deprecated
  subcomponentOf?: string;
  providesApis?: string[];
  consumesApis?: string[];
  dependsOn?: string[];
  dependencyOf?: string[];
}

/** API spec (Backstage built-in). */
export interface ApiSpec extends EntitySpecBase {
  type: string; // openapi | asyncapi | grpc | graphql
  lifecycle: string;
  definition: string; // inline or $ref to spec file
  dependsOn?: string[];
}

/** Resource spec (Backstage built-in). */
export interface ResourceSpec extends EntitySpecBase {
  type: string; // database | database-table | s3-bucket | queue | cache | etc.
  dependsOn?: string[];
  dependencyOf?: string[];
}

/** System spec (Backstage built-in). */
export interface SystemSpec {
  owner: string;
  domain?: string;
}

/** Domain spec (Backstage built-in). */
export interface DomainSpec {
  owner: string;
}

/** Group spec (Backstage built-in). */
export interface GroupSpec {
  type: string; // team | department | org
  profile?: {
    displayName?: string;
    email?: string;
    picture?: string;
  };
  parent?: string;
  children: string[];
  members?: string[];
}

// ─── Custom Kind Specs ──────────────────────────────────────────────────────────

/** EARS-format behavior statement. */
export interface BehaviorStatement {
  id: string;
  format?: string; // EARS | Given-When-Then | free-text
  trigger: string;
  response: string;
}

/** Requirement spec (anchored-spec custom). */
export interface RequirementSpec extends EntitySpecBase {
  priority: "must" | "should" | "could" | "wont";
  category: "functional" | "non-functional" | "constraint" | "security" | "data" | "technical" | "information";
  status: string;
  behaviorStatements?: BehaviorStatement[];
  semanticRefs?: {
    interfaces?: string[];
    schemas?: string[];
    events?: string[];
  };
  dependsOn?: string[];
  refinedBy?: string[];
}

/** Decision (ADR) spec (anchored-spec custom). */
export interface DecisionSpec extends EntitySpecBase {
  status: "proposed" | "accepted" | "deprecated" | "superseded";
  date?: string;
  supersedes?: string[];
  constrains?: string[];
  satisfies?: string[];
}

/** CanonicalEntity spec (anchored-spec custom). */
export interface CanonicalEntitySpec extends EntitySpecBase {
  implementedBy?: string[];
  attributes?: Array<{
    name: string;
    type: string;
    required?: boolean;
    values?: string[];
  }>;
}

/** Exchange spec (anchored-spec custom). */
export interface ExchangeSpec extends EntitySpecBase {
  source?: string; // entity ref: source system
  destination?: string; // entity ref: destination system
  protocol?: string;
  exchangedEntities?: string[];
  emits?: string[];
  implementedBy?: string[];
}

/** Capability spec (anchored-spec custom). */
export interface CapabilitySpec extends EntitySpecBase {
  supports?: string[];
  enabledBy?: string[];
  maturity?: "emerging" | "developing" | "mature" | "declining";
}

/** ValueStream spec (anchored-spec custom). */
export interface ValueStreamSpec extends EntitySpecBase {
  stages?: Array<{
    id: string;
    description: string;
    supportingCapabilities?: string[];
  }>;
}

/** Mission spec (anchored-spec custom). */
export interface MissionSpec extends EntitySpecBase {
  status?: string;
  supportedBy?: string[];
  keyResults?: string[];
}

/** Technology spec (anchored-spec custom). */
export interface TechnologySpec extends EntitySpecBase {
  category?: "language" | "framework" | "platform" | "tool";
  usedBy?: string[];
  approvalStatus?: "approved" | "conditional" | "deprecated" | "emerging";
}

/** SystemInterface spec (anchored-spec custom). */
export interface SystemInterfaceSpec extends EntitySpecBase {
  direction?: "inbound" | "outbound" | "bidirectional";
  protocol?: string;
  consumers?: string[];
}

/** Control spec (anchored-spec custom). */
export interface ControlSpec extends EntitySpecBase {
  assertion?: string;
  enforcement?: "automated" | "manual" | "hybrid";
  governedBy?: string[];
}

/** TransitionPlan spec (anchored-spec custom). */
export interface TransitionPlanSpec extends EntitySpecBase {
  baseline?: string; // entity ref
  target?: string; // entity ref
  milestones?: Array<{
    id: string;
    description: string;
    status: string;
  }>;
  risks?: Array<{
    id: string;
    description: string;
    severity: string;
  }>;
}

/** Exception spec (anchored-spec custom). */
export interface ExceptionSpec extends EntitySpecBase {
  scope?: string[];
  expiresAt?: string;
  approvedBy?: string;
  reason?: string;
}

// ─── The Entity ─────────────────────────────────────────────────────────────────

/**
 * A Backstage-compatible entity — the core data type for anchored-spec v2.
 *
 * Every entity follows the four-field envelope: apiVersion, kind, metadata, spec.
 * This is compatible with Backstage's Software Catalog and can be ingested
 * directly by a Backstage instance.
 */
export interface BackstageEntity {
  /** Schema version — either `backstage.io/v1alpha1` or `anchored-spec.dev/v1alpha1`. */
  apiVersion: string;

  /** Entity kind (PascalCase). */
  kind: string;

  /** Identity, labels, annotations, tags. */
  metadata: EntityMetadata;

  /**
   * Kind-specific fields. The shape depends on the `kind` field.
   * Use the typed spec interfaces (ComponentSpec, ApiSpec, etc.) for type safety.
   */
  spec: Record<string, unknown>;

  /**
   * Relations computed by the catalog (optional, not stored in YAML).
   * Backstage populates this; anchored-spec may compute it at load time.
   */
  relations?: EntityRelation[];
}

/** A computed relation (Backstage catalog format). */
export interface EntityRelation {
  type: string;
  targetRef: string;
}

// ─── Entity References ──────────────────────────────────────────────────────────

/**
 * A parsed entity reference in the Backstage format: `[kind:][namespace/]name`
 */
export interface EntityRef {
  kind?: string;
  namespace?: string;
  name: string;
}

/**
 * Parse a Backstage entity reference string.
 *
 * Formats:
 * - `name` → { name }
 * - `kind:name` → { kind, name }
 * - `kind:namespace/name` → { kind, namespace, name }
 * - `namespace/name` → { namespace, name }
 *
 * @throws Error if the reference is empty or malformed
 */
export function parseEntityRef(ref: string): EntityRef {
  if (!ref || !ref.trim()) {
    throw new Error("Entity reference must not be empty");
  }

  const trimmed = ref.trim();

  // Check for kind prefix (contains ":" before any "/")
  const colonIndex = trimmed.indexOf(":");
  const slashIndex = trimmed.indexOf("/");

  let kind: string | undefined;
  let rest: string;

  if (colonIndex >= 0 && (slashIndex < 0 || colonIndex < slashIndex)) {
    kind = trimmed.slice(0, colonIndex).toLowerCase();
    rest = trimmed.slice(colonIndex + 1);
    if (!kind) {
      throw new Error(`Invalid entity reference "${ref}": empty kind`);
    }
  } else {
    rest = trimmed;
  }

  // Check for namespace
  const nsSlash = rest.indexOf("/");
  let namespace: string | undefined;
  let name: string;

  if (nsSlash >= 0) {
    namespace = rest.slice(0, nsSlash);
    name = rest.slice(nsSlash + 1);
    if (!namespace) {
      throw new Error(`Invalid entity reference "${ref}": empty namespace`);
    }
  } else {
    name = rest;
  }

  if (!name) {
    throw new Error(`Invalid entity reference "${ref}": empty name`);
  }

  return {
    ...(kind !== undefined && { kind }),
    ...(namespace !== undefined && { namespace }),
    name,
  };
}

/**
 * Format an entity reference to the canonical Backstage string form.
 *
 * @param kind - Entity kind (optional, lowercased in output)
 * @param namespace - Namespace (optional, omitted if "default")
 * @param name - Entity name (required)
 */
export function formatEntityRef(
  kind: string | undefined,
  namespace: string | undefined,
  name: string,
): string {
  let ref = "";

  if (kind) {
    ref += `${kind.toLowerCase()}:`;
  }

  if (namespace && namespace !== "default") {
    ref += `${namespace}/`;
  }

  ref += name;
  return ref;
}

/**
 * Format a full (unambiguous) entity reference including kind and namespace.
 * Always includes kind and namespace (defaulting to "default").
 */
export function formatFullEntityRef(
  kind: string,
  namespace: string | undefined,
  name: string,
): string {
  return `${kind.toLowerCase()}:${namespace ?? "default"}/${name}`;
}

// ─── Source Location Metadata ───────────────────────────────────────────────────

/** Metadata about where an entity was loaded from. */
export interface EntitySourceLocation {
  /** Absolute path to the source file. */
  filePath: string;
  /** Path relative to project root. */
  relativePath: string;
  /** Zero-based line number where this entity starts in the file. */
  startLine?: number;
  /** Storage mode this entity was loaded from. */
  mode: "artifacts" | "manifest" | "inline";
}

/**
 * A loaded entity with source location metadata.
 * This is what the loader produces.
 */
export interface LoadedEntity {
  entity: BackstageEntity;
  source: EntitySourceLocation;
  errors: Array<{
    path: string;
    message: string;
    severity: "error" | "warning";
    rule: string;
  }>;
}
