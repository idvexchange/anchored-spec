/**
 * Backstage Kind Mapping Registry
 *
 * Maps the 48 legacy anchored-spec artifact kinds to the ~16 Backstage-aligned
 * kinds. Built-in Backstage kinds use `backstage.io/v1alpha1`; custom EA kinds
 * use `anchored-spec.dev/v1alpha1`.
 */

import {
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  type ApiVersion,
  type EntityKind,
} from "./types.js";
import type { EaDomain } from "../types.js";

// ─── Mapping Entry ──────────────────────────────────────────────────────────────

/** A mapping from a legacy kind to a Backstage entity kind. */
export interface KindMappingEntry {
  /** The legacy anchored-spec kind (e.g., "service"). */
  legacyKind: string;
  /** The legacy ID prefix (e.g., "SVC"). */
  legacyPrefix: string;
  /** The anchored-spec domain this kind belongs to. */
  domain: EaDomain;
  /** The Backstage API version for this kind. */
  apiVersion: ApiVersion;
  /** The Backstage entity kind (PascalCase). */
  backstageKind: EntityKind;
  /** The `spec.type` value (for kinds that use type discrimination). */
  specType?: string;
  /** Human-readable description. */
  description: string;
}

// ─── The Registry ───────────────────────────────────────────────────────────────

/**
 * Complete mapping from every legacy anchored-spec kind to its Backstage equivalent.
 *
 * Tier 1: Backstage built-in kinds (backstage.io/v1alpha1)
 * Tier 2: Custom EA kinds (anchored-spec.dev/v1alpha1)
 */
export const BACKSTAGE_KIND_REGISTRY: readonly KindMappingEntry[] = [
  // ── Tier 1: Backstage Built-in Kinds ──────────────────────────────────────

  // Systems domain → Component
  { legacyKind: "application", legacyPrefix: "APP", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Component", specType: "website", description: "A frontend application" },
  { legacyKind: "service", legacyPrefix: "SVC", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Component", specType: "service", description: "A backend service or microservice" },
  { legacyKind: "consumer", legacyPrefix: "CON", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Component", specType: "service", description: "A declared API/event consumer" },
  { legacyKind: "platform", legacyPrefix: "PLAT", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Component", specType: "service", description: "A runtime platform" },

  // Systems domain → API
  { legacyKind: "api-contract", legacyPrefix: "API", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "API", specType: "openapi", description: "A REST/GraphQL/gRPC API specification" },
  { legacyKind: "event-contract", legacyPrefix: "EVT", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "API", specType: "asyncapi", description: "An async event/message contract" },

  // Delivery/Data domain → Resource
  { legacyKind: "cloud-resource", legacyPrefix: "CLOUD", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "cloud-resource", description: "A specific cloud resource" },
  { legacyKind: "physical-schema", legacyPrefix: "SCHEMA", domain: "data", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "database-table", description: "A physical database schema" },
  { legacyKind: "data-store", legacyPrefix: "STORE", domain: "data", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "database", description: "A data storage system" },
  { legacyKind: "data-product", legacyPrefix: "DPROD", domain: "data", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "data-product", description: "A data product with SLAs" },
  { legacyKind: "runtime-cluster", legacyPrefix: "CLUSTER", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "cluster", description: "A compute cluster" },
  { legacyKind: "network-zone", legacyPrefix: "ZONE", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "network-zone", description: "A network security zone" },
  { legacyKind: "deployment", legacyPrefix: "DEPLOY", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "deployment", description: "A deployed instance" },
  { legacyKind: "environment", legacyPrefix: "ENV", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Resource", specType: "environment", description: "A deployment environment" },

  // Business domain → Group
  { legacyKind: "org-unit", legacyPrefix: "ORG", domain: "business", apiVersion: BACKSTAGE_API_VERSION, backstageKind: "Group", specType: "team", description: "An organizational unit" },

  // ── Tier 2: Custom EA Kinds ───────────────────────────────────────────────

  // Requirements (all requirement subtypes → Requirement)
  { legacyKind: "requirement", legacyPrefix: "REQ", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Requirement", specType: "functional", description: "A behavioral software requirement" },
  { legacyKind: "security-requirement", legacyPrefix: "SREQ", domain: "systems", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Requirement", specType: "security", description: "A security requirement" },
  { legacyKind: "data-requirement", legacyPrefix: "DREQ", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Requirement", specType: "data", description: "A data requirement" },
  { legacyKind: "technical-requirement", legacyPrefix: "TREQ", domain: "delivery", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Requirement", specType: "technical", description: "A technical requirement" },
  { legacyKind: "information-requirement", legacyPrefix: "IREQ", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Requirement", specType: "information", description: "An information requirement" },

  // Decisions
  { legacyKind: "decision", legacyPrefix: "ADR", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Decision", description: "An architecture decision record" },
  { legacyKind: "change", legacyPrefix: "CHG", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Decision", specType: "change-record", description: "An implementation change record" },

  // Information domain → CanonicalEntity
  { legacyKind: "canonical-entity", legacyPrefix: "CE", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "CanonicalEntity", description: "A canonical data entity" },
  { legacyKind: "information-concept", legacyPrefix: "IC", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "CanonicalEntity", specType: "concept", description: "A high-level information concept" },
  { legacyKind: "glossary-term", legacyPrefix: "TERM", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "CanonicalEntity", specType: "glossary-term", description: "A canonical glossary term" },
  { legacyKind: "master-data-domain", legacyPrefix: "MDM", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "CanonicalEntity", specType: "master-data-domain", description: "A master data domain" },

  // Exchanges
  { legacyKind: "information-exchange", legacyPrefix: "EXCH", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Exchange", description: "A declared information exchange" },
  { legacyKind: "integration", legacyPrefix: "INT", domain: "systems", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Exchange", specType: "integration", description: "A declared integration" },

  // Business domain → Capability, ValueStream, Mission
  { legacyKind: "capability", legacyPrefix: "CAP", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Capability", description: "A business capability" },
  { legacyKind: "value-stream", legacyPrefix: "VS", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "ValueStream", description: "A value stream with stages" },
  { legacyKind: "process", legacyPrefix: "PROC", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "ValueStream", specType: "process", description: "A business process" },
  { legacyKind: "mission", legacyPrefix: "MISSION", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Mission", description: "A strategic mission" },
  { legacyKind: "policy-objective", legacyPrefix: "POL", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Mission", specType: "policy-objective", description: "A policy objective" },
  { legacyKind: "business-service", legacyPrefix: "BSVC", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Capability", specType: "business-service", description: "A business service" },

  // Technology
  { legacyKind: "technology-standard", legacyPrefix: "TECH", domain: "delivery", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Technology", description: "An approved technology standard" },

  // System Interface / Identity
  { legacyKind: "system-interface", legacyPrefix: "SIF", domain: "systems", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "SystemInterface", description: "An external system boundary" },
  { legacyKind: "identity-boundary", legacyPrefix: "IDB", domain: "delivery", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "SystemInterface", specType: "identity-boundary", description: "An identity/auth boundary" },

  // Control / Governance
  { legacyKind: "control", legacyPrefix: "CTRL", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Control", description: "A governance control" },
  { legacyKind: "classification", legacyPrefix: "CLASS", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Control", specType: "classification", description: "A data classification level" },
  { legacyKind: "retention-policy", legacyPrefix: "RET", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Control", specType: "retention-policy", description: "A data retention policy" },
  { legacyKind: "data-quality-rule", legacyPrefix: "DQR", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Control", specType: "data-quality-rule", description: "A data quality rule" },

  // Transitions
  { legacyKind: "transition-plan", legacyPrefix: "PLAN", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "TransitionPlan", description: "A transition plan" },
  { legacyKind: "migration-wave", legacyPrefix: "WAVE", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "TransitionPlan", specType: "migration-wave", description: "A migration wave" },
  { legacyKind: "baseline", legacyPrefix: "BASELINE", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "TransitionPlan", specType: "baseline", description: "A point-in-time snapshot" },
  { legacyKind: "target", legacyPrefix: "TARGET", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "TransitionPlan", specType: "target", description: "A desired future state" },

  // Exceptions
  { legacyKind: "exception", legacyPrefix: "EXCEPT", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Exception", description: "An approved policy exception" },

  // Data domain — Logical/Lineage (these map to CanonicalEntity since they're conceptual)
  { legacyKind: "logical-data-model", legacyPrefix: "LDM", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "CanonicalEntity", specType: "logical-data-model", description: "A logical data model" },
  { legacyKind: "lineage", legacyPrefix: "LINEAGE", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, backstageKind: "Exchange", specType: "data-lineage", description: "A data lineage path" },
] as const;

// ─── Lookup Helpers ─────────────────────────────────────────────────────────────

/** Index by legacy kind for O(1) lookup. */
const byLegacyKind = new Map<string, KindMappingEntry>(
  BACKSTAGE_KIND_REGISTRY.map((e) => [e.legacyKind, e]),
);

/** Index by legacy prefix for O(1) lookup. */
const byLegacyPrefix = new Map<string, KindMappingEntry>(
  BACKSTAGE_KIND_REGISTRY.map((e) => [e.legacyPrefix, e]),
);

/** Index by Backstage kind for reverse lookup (returns all matching entries). */
const byBackstageKind = new Map<string, KindMappingEntry[]>();
for (const entry of BACKSTAGE_KIND_REGISTRY) {
  const existing = byBackstageKind.get(entry.backstageKind) ?? [];
  existing.push(entry);
  byBackstageKind.set(entry.backstageKind, existing);
}

/**
 * Look up a Backstage mapping by legacy kind name.
 */
export function mapLegacyKind(legacyKind: string): KindMappingEntry | undefined {
  return byLegacyKind.get(legacyKind);
}

/**
 * Look up a Backstage mapping by legacy ID prefix (e.g., "SVC", "APP").
 */
export function mapLegacyPrefix(prefix: string): KindMappingEntry | undefined {
  return byLegacyPrefix.get(prefix);
}

/**
 * Reverse lookup: find the best-matching legacy kind for a Backstage entity.
 *
 * Uses `apiVersion`, `kind`, and optionally `spec.type` to disambiguate.
 * Returns undefined if no mapping exists.
 */
export function mapBackstageKind(
  apiVersion: string,
  kind: string,
  specType?: string,
): KindMappingEntry | undefined {
  const entries = byBackstageKind.get(kind);
  if (!entries) return undefined;

  // Filter by apiVersion
  const versionMatches = entries.filter((e) => e.apiVersion === apiVersion);
  if (versionMatches.length === 0) return undefined;
  if (versionMatches.length === 1) return versionMatches[0];

  // Disambiguate by specType
  if (specType) {
    const typeMatch = versionMatches.find((e) => e.specType === specType);
    if (typeMatch) return typeMatch;
  }

  // Fall back to the entry without a specType (the "default" for this kind)
  return versionMatches.find((e) => !e.specType) ?? versionMatches[0];
}

/**
 * Get all legacy kinds that map to a given Backstage kind.
 */
export function getLegacyKindsForBackstageKind(backstageKind: string): KindMappingEntry[] {
  return byBackstageKind.get(backstageKind) ?? [];
}

/**
 * Check if a legacy kind is recognized.
 */
export function isLegacyKindRegistered(legacyKind: string): boolean {
  return byLegacyKind.has(legacyKind);
}

/**
 * Check if a Backstage kind is recognized.
 */
export function isBackstageKindRegistered(backstageKind: string): boolean {
  return byBackstageKind.has(backstageKind);
}

/**
 * Get all unique Backstage kinds (for schema validation, etc.).
 */
export function getAllBackstageKinds(): EntityKind[] {
  return [...new Set(BACKSTAGE_KIND_REGISTRY.map((e) => e.backstageKind))];
}

/**
 * Get all Backstage built-in kinds from the registry.
 */
export function getBuiltinKinds(): KindMappingEntry[] {
  return BACKSTAGE_KIND_REGISTRY.filter(
    (e) => e.apiVersion === BACKSTAGE_API_VERSION,
  ) as unknown as KindMappingEntry[];
}

/**
 * Get all custom anchored-spec kinds from the registry.
 */
export function getCustomKinds(): KindMappingEntry[] {
  return BACKSTAGE_KIND_REGISTRY.filter(
    (e) => e.apiVersion === ANCHORED_SPEC_API_VERSION,
  ) as unknown as KindMappingEntry[];
}

/**
 * Convert a legacy artifact ID (e.g., "SVC-verifier-core") to a Backstage
 * entity name (e.g., "verifier-core").
 *
 * Strips the known prefix and returns the slug portion.
 */
export function legacyIdToEntityName(legacyId: string): string {
  // Strip domain prefix if present (e.g., "systems/SVC-verifier-core")
  const localId = legacyId.includes("/")
    ? legacyId.split("/").pop()!
    : legacyId;

  // Find the prefix
  const dashIndex = localId.indexOf("-");
  if (dashIndex < 0) return localId.toLowerCase();

  const prefix = localId.slice(0, dashIndex);
  const mapping = byLegacyPrefix.get(prefix);

  if (mapping) {
    // Known prefix — strip it
    return localId.slice(dashIndex + 1).toLowerCase();
  }

  // Unknown prefix — return as-is, lowercased
  return localId.toLowerCase();
}

/**
 * Convert a Backstage entity reference back to a legacy artifact ID.
 *
 * @param backstageKind - The Backstage kind (e.g., "Component")
 * @param name - The entity name (e.g., "verifier-core")
 * @param specType - Optional spec.type for disambiguation
 */
export function entityNameToLegacyId(
  backstageKind: string,
  name: string,
  specType?: string,
): string {
  // Find the mapping to determine the legacy prefix
  const entries = byBackstageKind.get(backstageKind) ?? [];

  let mapping: KindMappingEntry | undefined;
  if (specType) {
    mapping = entries.find((e) => e.specType === specType);
  }
  if (!mapping) {
    mapping = entries.find((e) => !e.specType) ?? entries[0];
  }

  if (!mapping) {
    return name.toUpperCase();
  }

  return `${mapping.legacyPrefix}-${name}`;
}
