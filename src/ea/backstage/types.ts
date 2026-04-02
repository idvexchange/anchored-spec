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

import type {
  ApiEntityV1alpha1,
  ComponentEntityV1alpha1,
  CompoundEntityRef,
  DomainEntityV1alpha1,
  Entity as CatalogEntity,
  EntityLink as CatalogEntityLink,
  EntityMeta as CatalogEntityMeta,
  EntityRelation as CatalogEntityRelation,
  GroupEntityV1alpha1,
  LocationEntityV1alpha1,
  ResourceEntityV1alpha1,
  SystemEntityV1alpha1,
  UserEntityV1alpha1,
} from "@backstage/catalog-model";
import {
  parseEntityRef as parseCatalogEntityRef,
  parseLocationRef,
  stringifyEntityRef,
  stringifyLocationRef,
} from "@backstage/catalog-model";
import type {
  AlphaEntity as CatalogAlphaEntity,
  EntityStatus as CatalogEntityStatus,
} from "@backstage/catalog-model/alpha";

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

/** Backstage built-in entities supported directly by anchored-spec. */
export type BackstageBuiltinEntity =
  | ComponentEntityV1alpha1
  | ApiEntityV1alpha1
  | ResourceEntityV1alpha1
  | SystemEntityV1alpha1
  | DomainEntityV1alpha1
  | GroupEntityV1alpha1
  | UserEntityV1alpha1
  | LocationEntityV1alpha1;

/** Backstage built-in entity kinds. */
export type BackstageBuiltinKind = BackstageBuiltinEntity["kind"];

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
export type EntityLink = CatalogEntityLink;

/**
 * Entity metadata — identity, labels, annotations, and tags.
 * Follows the Backstage metadata schema.
 */
export type EntityMetadata = CatalogEntityMeta;

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
} as const;

/** Confidence levels for the confidence annotation. */
export type EntityConfidence = "observed" | "declared" | "inferred";

/** Risk levels for the risk annotation. */
export type EntityRisk = "low" | "moderate" | "high" | "critical";

// ─── Entity Spec (kind-specific) ────────────────────────────────────────────────

/**
 * Standard Backstage descriptor substitution objects.
 *
 * anchored-spec supports local relative-file substitutions and keeps the authored
 * object shape intact so YAML can remain Backstage-compatible.
 */
export interface DescriptorTextSubstitution {
  $text: string;
}

export interface DescriptorJsonSubstitution {
  $json: string;
}

export interface DescriptorYamlSubstitution {
  $yaml: string;
}

export type DescriptorSubstitution =
  | DescriptorTextSubstitution
  | DescriptorJsonSubstitution
  | DescriptorYamlSubstitution;

/**
 * Shared shape used by anchored-spec custom kinds.
 *
 * Built-in kinds should come directly from Backstage entity definitions wherever
 * possible; this base exists for custom kinds that intentionally extend the model.
 */
export interface EntitySpecBase extends Record<string, unknown> {
  /** The subtype within a kind. */
  type?: string;
  /** Entity lifecycle stage. */
  lifecycle?: string;
  /** Owner entity reference (e.g. "group:default/platform-team"). */
  owner?: string;
  /** System this entity belongs to. */
  system?: string;
}

/** Built-in Backstage kind specs, sourced from the Backstage model. */
export type ComponentSpec = ComponentEntityV1alpha1["spec"] & Record<string, unknown>;
export type ApiSpec =
  Omit<ApiEntityV1alpha1["spec"], "definition"> & {
    definition: ApiEntityV1alpha1["spec"]["definition"] | DescriptorSubstitution;
  } & Record<string, unknown>;
export type ResourceSpec = ResourceEntityV1alpha1["spec"] & Record<string, unknown>;
export type SystemSpec = SystemEntityV1alpha1["spec"] & Record<string, unknown>;
export type DomainSpec = DomainEntityV1alpha1["spec"] & Record<string, unknown>;
export type GroupSpec = GroupEntityV1alpha1["spec"] & Record<string, unknown>;

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
export type BackstageEntity =
  Omit<CatalogEntity, "metadata" | "spec" | "relations"> &
  Omit<CatalogAlphaEntity, "metadata" | "spec" | "relations"> & {
    /** Identity, labels, annotations, tags. */
    metadata: EntityMetadata;
    /**
     * Kind-specific fields.
     *
     * Built-in shapes should align with Backstage definitions; custom kinds use
     * anchored-spec schemas under `anchored-spec.dev/v1alpha1`.
     */
    spec: Record<string, unknown>;
    /**
     * Relations computed by the catalog or by anchored-spec runtime analysis.
     * These are derived output, not authored descriptor fields.
     */
    relations?: EntityRelation[];
    /**
     * Catalog-style status output. This is distinct from authored `spec.lifecycle`
     * or custom kind `spec.status`.
     */
    status?: CatalogEntityStatus;
  };

/** A computed relation (Backstage catalog format). */
export type EntityRelation = CatalogEntityRelation;

// ─── Entity References ──────────────────────────────────────────────────────────

/**
 * A parsed entity reference in the Backstage format: `[kind:][namespace/]name`
 */
export type EntityRef = CompoundEntityRef;

/**
 * Parse an entity reference using Backstage catalog-model semantics.
 * Trims surrounding whitespace before delegating to the upstream parser.
 */
export function parseEntityRef(
  ref: string | { kind?: string; namespace?: string; name: string },
  context?: { defaultKind?: string; defaultNamespace?: string },
): EntityRef {
  return parseCatalogEntityRef(
    typeof ref === "string" ? ref.trim() : ref,
    context,
  );
}

/**
 * Normalize an entity reference to Backstage's canonical string form.
 */
export function normalizeEntityRef(
  ref: string | { kind?: string; namespace?: string; name: string },
  context?: { defaultKind?: string; defaultNamespace?: string },
): string {
  return stringifyEntityRef(parseEntityRef(ref, context));
}

export { stringifyEntityRef, parseLocationRef, stringifyLocationRef };

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
  mode: "manifest" | "inline";
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
