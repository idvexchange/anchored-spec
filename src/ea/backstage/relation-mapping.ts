/**
 * Backstage Relation Mapping
 *
 * Maps the anchored-spec relation vocabulary to Backstage well-known
 * relations and custom anchored-spec relations.
 *
 * Backstage well-known relations:
 * https://backstage.io/docs/features/software-catalog/well-known-relations/
 *
 * In the Backstage model, relations live in `spec` arrays (e.g., `spec.dependsOn`,
 * `spec.providesApis`) rather than in a flat `relations[]` array. This module
 * handles the mapping between both representations.
 */

import {
  RELATION_API_CONSUMED_BY,
  RELATION_API_PROVIDED_BY,
  RELATION_CONSUMES_API,
  RELATION_DEPENDENCY_OF,
  RELATION_DEPENDS_ON,
  RELATION_OWNED_BY,
  RELATION_OWNER_OF,
  RELATION_PROVIDES_API,
} from "@backstage/catalog-model";
import { normalizeEntityRef } from "./types.js";

// ─── Relation Tiers ─────────────────────────────────────────────────────────────

/**
 * A mapping from an anchored-spec relation type to its Backstage equivalent.
 */
export interface RelationMappingEntry {
  /** Anchored-spec relation type (canonical direction). */
  type: string;
  /** Inverse anchored-spec relation type. */
  inverse: string;
  /** Backstage relation type (forward). */
  backstageType: string;
  /** Backstage inverse relation type. */
  backstageInverse: string;
  /** Whether this is a Backstage well-known relation. */
  isWellKnown: boolean;
  /**
   * Where this relation is stored in Backstage YAML.
   * - `spec-field`: stored as `spec.{fieldName}: string[]` (Backstage convention)
   * - `relations`: stored in a computed `relations[]` array (Backstage catalog format)
   * - `annotation`: stored in `metadata.annotations` (for special cases)
   */
  placement: "spec-field" | "relations" | "annotation";
  /** The spec field name if placement is "spec-field" (e.g., "dependsOn", "providesApis"). */
  specField?: string;
  /** Description of the mapping. */
  description: string;
}

// ─── Tier 1: Backstage Well-Known Relations ─────────────────────────────────────

const WELL_KNOWN_RELATIONS: RelationMappingEntry[] = [
  {
    type: "dependsOn",
    inverse: "dependedOnBy",
    backstageType: RELATION_DEPENDS_ON,
    backstageInverse: RELATION_DEPENDENCY_OF,
    isWellKnown: true,
    placement: "spec-field",
    specField: "dependsOn",
    description: "A needs B to function. Backstage well-known.",
  },
  {
    type: "ownedBy",
    inverse: "ownerOf",
    backstageType: RELATION_OWNED_BY,
    backstageInverse: RELATION_OWNER_OF,
    isWellKnown: true,
    placement: "spec-field",
    specField: "owner",
    description: "Ownership/accountability. Expressed via spec.owner in Backstage.",
  },
  {
    type: "exposes",
    inverse: "exposedBy",
    backstageType: RELATION_PROVIDES_API,
    backstageInverse: RELATION_API_PROVIDED_BY,
    isWellKnown: true,
    placement: "spec-field",
    specField: "providesApis",
    description: "Component exposes an API. Backstage well-known.",
  },
  {
    type: "consumes",
    inverse: "consumedBy",
    backstageType: RELATION_CONSUMES_API,
    backstageInverse: RELATION_API_CONSUMED_BY,
    isWellKnown: true,
    placement: "spec-field",
    specField: "consumesApis",
    description: "Component uses an API. Backstage well-known.",
  },
];

// ─── Tier 2: Custom anchored-spec Relations ─────────────────────────────────────

const CUSTOM_RELATIONS: RelationMappingEntry[] = [
  {
    type: "realizes",
    inverse: "realizedBy",
    backstageType: "realizes",
    backstageInverse: "realizedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "realizes",
    description: "Source system realizes a capability or requirement.",
  },
  {
    type: "uses",
    inverse: "usedBy",
    backstageType: "uses",
    backstageInverse: "usedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "uses",
    description: "Source uses a data store or system.",
  },
  {
    type: "deploys",
    inverse: "deployedBy",
    backstageType: "deploys",
    backstageInverse: "deployedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "deploys",
    description: "Deployment deploys an application.",
  },
  {
    type: "runsOn",
    inverse: "runs",
    backstageType: "runsOn",
    backstageInverse: "runs",
    isWellKnown: false,
    placement: "spec-field",
    specField: "runsOn",
    description: "Source runs on a platform or cluster.",
  },
  {
    type: "boundedBy",
    inverse: "bounds",
    backstageType: "boundedBy",
    backstageInverse: "bounds",
    isWellKnown: false,
    placement: "spec-field",
    specField: "boundedBy",
    description: "Source is bounded by a network zone or identity boundary.",
  },
  {
    type: "authenticatedBy",
    inverse: "authenticates",
    backstageType: "authenticatedBy",
    backstageInverse: "authenticates",
    isWellKnown: false,
    placement: "spec-field",
    specField: "authenticatedBy",
    description: "Source is authenticated by an identity boundary.",
  },
  {
    type: "deployedTo",
    inverse: "hosts",
    backstageType: "deployedTo",
    backstageInverse: "hosts",
    isWellKnown: false,
    placement: "spec-field",
    specField: "deployedTo",
    description: "Application deployed to a platform or environment.",
  },
  {
    type: "interfacesWith",
    inverse: "interfacedBy",
    backstageType: "interfacesWith",
    backstageInverse: "interfacedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "interfacesWith",
    description: "Source interfaces with an external system boundary.",
  },
  {
    type: "standardizes",
    inverse: "standardizedBy",
    backstageType: "standardizes",
    backstageInverse: "standardizedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "standardizes",
    description: "Technology standard governs target entities.",
  },
  {
    type: "providedBy",
    inverse: "provides",
    backstageType: "providedBy",
    backstageInverse: "provides",
    isWellKnown: false,
    placement: "spec-field",
    specField: "providedBy",
    description: "Cloud resource provided by a platform.",
  },
  {
    type: "stores",
    inverse: "storedIn",
    backstageType: "stores",
    backstageInverse: "storedIn",
    isWellKnown: false,
    placement: "spec-field",
    specField: "stores",
    description: "Data store stores a schema or entity.",
  },
  {
    type: "hostedOn",
    inverse: "hostsData",
    backstageType: "hostedOn",
    backstageInverse: "hostsData",
    isWellKnown: false,
    placement: "spec-field",
    specField: "hostedOn",
    description: "Data store hosted on infrastructure.",
  },
  {
    type: "lineageFrom",
    inverse: "lineageTo",
    backstageType: "lineageFrom",
    backstageInverse: "lineageTo",
    isWellKnown: false,
    placement: "spec-field",
    specField: "lineageFrom",
    description: "Data lineage from a source.",
  },
  {
    type: "implementedBy",
    inverse: "implements",
    backstageType: "implementedBy",
    backstageInverse: "implements",
    isWellKnown: false,
    placement: "spec-field",
    specField: "implementedBy",
    description: "Logical concept implemented by physical entity.",
  },
  {
    type: "classifiedAs",
    inverse: "classifies",
    backstageType: "classifiedAs",
    backstageInverse: "classifies",
    isWellKnown: false,
    placement: "spec-field",
    specField: "classifiedAs",
    description: "Data entity classified under a category.",
  },
  {
    type: "exchangedVia",
    inverse: "exchanges",
    backstageType: "exchangedVia",
    backstageInverse: "exchanges",
    isWellKnown: false,
    placement: "spec-field",
    specField: "exchangedVia",
    description: "Information exchanged via a contract.",
  },
  {
    type: "retainedUnder",
    inverse: "retains",
    backstageType: "retainedUnder",
    backstageInverse: "retains",
    isWellKnown: false,
    placement: "spec-field",
    specField: "retainedUnder",
    description: "Data subject to retention policy.",
  },
  {
    type: "supports",
    inverse: "supportedBy",
    backstageType: "supports",
    backstageInverse: "supportedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "supports",
    description: "Source supports a capability or mission.",
  },
  {
    type: "performedBy",
    inverse: "performs",
    backstageType: "performedBy",
    backstageInverse: "performs",
    isWellKnown: false,
    placement: "spec-field",
    specField: "performedBy",
    description: "Capability performed by a process or org unit.",
  },
  {
    type: "governedBy",
    inverse: "governs",
    backstageType: "governedBy",
    backstageInverse: "governs",
    isWellKnown: false,
    placement: "spec-field",
    specField: "governedBy",
    description: "Entity governed by a policy or control.",
  },
  {
    type: "supersedes",
    inverse: "supersededBy",
    backstageType: "supersedes",
    backstageInverse: "supersededBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "supersedes",
    description: "Source supersedes target.",
  },
  {
    type: "generates",
    inverse: "generatedBy",
    backstageType: "generates",
    backstageInverse: "generatedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "generates",
    description: "Transition plan generates change records.",
  },
  {
    type: "mitigates",
    inverse: "mitigatedBy",
    backstageType: "mitigates",
    backstageInverse: "mitigatedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "mitigates",
    description: "Exception mitigates drift findings.",
  },
  {
    type: "targets",
    inverse: "targetedBy",
    backstageType: "targets",
    backstageInverse: "targetedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "targets",
    description: "Transition entity targets a future state.",
  },
];

// ─── Combined Registry ──────────────────────────────────────────────────────────

export const RELATION_MAPPING_REGISTRY: readonly RelationMappingEntry[] = [
  ...WELL_KNOWN_RELATIONS,
  ...CUSTOM_RELATIONS,
] as const;

// ─── Lookup Indexes ─────────────────────────────────────────────────────────────

/** Lookup by anchored-spec type (forward). */
const byType = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.map((e) => [e.type, e]),
);

/** Lookup by anchored-spec inverse type. */
const byInverse = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.map((e) => [e.inverse, e]),
);

/** Lookup by Backstage type (forward). */
const byBackstageType = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.map((e) => [e.backstageType, e]),
);

/** Lookup by Backstage inverse type. */
const byBackstageInverse = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.map((e) => [e.backstageInverse, e]),
);

/** Lookup by spec field name. */
const bySpecField = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.filter((e) => e.specField).map((e) => [e.specField!, e]),
);

// ─── Lookup Functions ───────────────────────────────────────────────────────────

/**
 * Map an anchored-spec relation type to its Backstage equivalent.
 * Handles both forward and inverse types.
 */
export function mapRelationType(type: string): RelationMappingEntry | undefined {
  return byType.get(type) ?? byInverse.get(type);
}

/**
 * Map a Backstage relation type to the mapping entry.
 * Handles both forward and inverse types.
 */
export function mapBackstageRelation(backstageType: string): RelationMappingEntry | undefined {
  return byBackstageType.get(backstageType) ?? byBackstageInverse.get(backstageType);
}

/**
 * Get the mapping entry for a spec field name (e.g., "dependsOn", "providesApis").
 */
export function mapSpecField(fieldName: string): RelationMappingEntry | undefined {
  return bySpecField.get(fieldName);
}

/**
 * Get all well-known Backstage relation mappings.
 */
export function getWellKnownRelations(): RelationMappingEntry[] {
  return RELATION_MAPPING_REGISTRY.filter((e) => e.isWellKnown) as unknown as RelationMappingEntry[];
}

/**
 * Get all custom anchored-spec relation mappings.
 */
export function getCustomRelations(): RelationMappingEntry[] {
  return RELATION_MAPPING_REGISTRY.filter((e) => !e.isWellKnown) as unknown as RelationMappingEntry[];
}

/**
 * Check if a relation type is a Backstage well-known relation.
 */
export function isWellKnownRelation(type: string): boolean {
  const entry = byBackstageType.get(type) ?? byBackstageInverse.get(type);
  return entry?.isWellKnown ?? false;
}

/**
 * Convert an anchored-spec relation (type + target entity ID) to Backstage format.
 *
 * Returns the spec field name and the entity ref to add to it, or
 * null if the relation isn't mapped.
 */
export function relationTypeToSpecEntry(
  type: string,
  targetEntityRef: string,
): { specField: string; targetRef: string } | null {
  const entry = byType.get(type);
  if (!entry || !entry.specField) return null;

  return {
    specField: entry.specField,
    targetRef: targetEntityRef,
  };
}

/**
 * Extract relations from a Backstage entity's spec fields.
 *
 * Scans all known spec field names (dependsOn, providesApis, etc.) and
 * returns them as anchored-spec relation objects: { type, target }.
 */
export function extractRelationsFromSpec(
  spec: Record<string, unknown>,
): Array<{ type: string; backstageType: string; targets: string[] }> {
  const results: Array<{ type: string; backstageType: string; targets: string[] }> = [];

  const normalizeSpecTarget = (specField: string, target: string): string => {
    switch (specField) {
      case "owner":
        return normalizeEntityRef(target, {
          defaultKind: "Group",
          defaultNamespace: "default",
        });
      case "providesApis":
      case "consumesApis":
        return normalizeEntityRef(target, {
          defaultKind: "API",
          defaultNamespace: "default",
        });
      default:
        return normalizeEntityRef(target, { defaultNamespace: "default" });
    }
  };

  for (const entry of RELATION_MAPPING_REGISTRY) {
    if (!entry.specField) continue;

    const value = spec[entry.specField];
    if (!value) continue;

    // `owner` is a single string, all others are string arrays
    if (entry.specField === "owner") {
      if (typeof value === "string") {
        const target = (() => {
          try {
            return normalizeSpecTarget(entry.specField, value);
          } catch {
            return value;
          }
        })();
        results.push({
          type: entry.type,
          backstageType: entry.backstageType,
          targets: [target],
        });
      }
    } else if (Array.isArray(value)) {
      const targets = value
        .filter((v): v is string => typeof v === "string")
        .map((target) => {
          try {
            return normalizeSpecTarget(entry.specField!, target);
          } catch {
            return target;
          }
        });
      if (targets.length > 0) {
        results.push({
          type: entry.type,
          backstageType: entry.backstageType,
          targets,
        });
      }
    }
  }

  return results;
}
