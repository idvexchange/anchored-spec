/**
 * Backstage Relation Mapping
 *
 * Maps the 27 legacy anchored-spec relation types to Backstage well-known
 * relations and custom anchored-spec relations.
 *
 * Backstage well-known relations:
 * https://backstage.io/docs/features/software-catalog/well-known-relations/
 *
 * In the Backstage model, relations live in `spec` arrays (e.g., `spec.dependsOn`,
 * `spec.providesApis`) rather than in a flat `relations[]` array. This module
 * handles the mapping between both representations.
 */

// ─── Relation Tiers ─────────────────────────────────────────────────────────────

/**
 * A mapping from a legacy relation type to its Backstage equivalent.
 */
export interface RelationMappingEntry {
  /** Legacy anchored-spec relation type (canonical direction). */
  legacyType: string;
  /** Legacy inverse type. */
  legacyInverse: string;
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
    legacyType: "dependsOn",
    legacyInverse: "dependedOnBy",
    backstageType: "dependsOn",
    backstageInverse: "dependencyOf",
    isWellKnown: true,
    placement: "spec-field",
    specField: "dependsOn",
    description: "A needs B to function. Backstage well-known.",
  },
  {
    legacyType: "ownedBy",
    legacyInverse: "ownerOf",
    backstageType: "ownedBy",
    backstageInverse: "ownerOf",
    isWellKnown: true,
    placement: "spec-field",
    specField: "owner",
    description: "Ownership/accountability. Expressed via spec.owner in Backstage.",
  },
  {
    legacyType: "exposes",
    legacyInverse: "exposedBy",
    backstageType: "providesApi",
    backstageInverse: "apiProvidedBy",
    isWellKnown: true,
    placement: "spec-field",
    specField: "providesApis",
    description: "Component exposes an API. Backstage well-known.",
  },
  {
    legacyType: "consumes",
    legacyInverse: "consumedBy",
    backstageType: "consumesApi",
    backstageInverse: "apiConsumedBy",
    isWellKnown: true,
    placement: "spec-field",
    specField: "consumesApis",
    description: "Component uses an API. Backstage well-known.",
  },
];

// ─── Tier 2: Custom anchored-spec Relations ─────────────────────────────────────

const CUSTOM_RELATIONS: RelationMappingEntry[] = [
  {
    legacyType: "realizes",
    legacyInverse: "realizedBy",
    backstageType: "realizes",
    backstageInverse: "realizedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "realizes",
    description: "Source system realizes a capability or requirement.",
  },
  {
    legacyType: "uses",
    legacyInverse: "usedBy",
    backstageType: "uses",
    backstageInverse: "usedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "uses",
    description: "Source uses a data store or system.",
  },
  {
    legacyType: "deploys",
    legacyInverse: "deployedBy",
    backstageType: "deploys",
    backstageInverse: "deployedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "deploys",
    description: "Deployment deploys an application.",
  },
  {
    legacyType: "runsOn",
    legacyInverse: "runs",
    backstageType: "runsOn",
    backstageInverse: "runs",
    isWellKnown: false,
    placement: "spec-field",
    specField: "runsOn",
    description: "Source runs on a platform or cluster.",
  },
  {
    legacyType: "boundedBy",
    legacyInverse: "bounds",
    backstageType: "boundedBy",
    backstageInverse: "bounds",
    isWellKnown: false,
    placement: "spec-field",
    specField: "boundedBy",
    description: "Source is bounded by a network zone or identity boundary.",
  },
  {
    legacyType: "authenticatedBy",
    legacyInverse: "authenticates",
    backstageType: "authenticatedBy",
    backstageInverse: "authenticates",
    isWellKnown: false,
    placement: "spec-field",
    specField: "authenticatedBy",
    description: "Source is authenticated by an identity boundary.",
  },
  {
    legacyType: "deployedTo",
    legacyInverse: "hosts",
    backstageType: "deployedTo",
    backstageInverse: "hosts",
    isWellKnown: false,
    placement: "spec-field",
    specField: "deployedTo",
    description: "Application deployed to a platform or environment.",
  },
  {
    legacyType: "interfacesWith",
    legacyInverse: "interfacedBy",
    backstageType: "interfacesWith",
    backstageInverse: "interfacedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "interfacesWith",
    description: "Source interfaces with an external system boundary.",
  },
  {
    legacyType: "standardizes",
    legacyInverse: "standardizedBy",
    backstageType: "standardizes",
    backstageInverse: "standardizedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "standardizes",
    description: "Technology standard governs target artifacts.",
  },
  {
    legacyType: "providedBy",
    legacyInverse: "provides",
    backstageType: "providedBy",
    backstageInverse: "provides",
    isWellKnown: false,
    placement: "spec-field",
    specField: "providedBy",
    description: "Cloud resource provided by a platform.",
  },
  {
    legacyType: "stores",
    legacyInverse: "storedIn",
    backstageType: "stores",
    backstageInverse: "storedIn",
    isWellKnown: false,
    placement: "spec-field",
    specField: "stores",
    description: "Data store stores a schema or entity.",
  },
  {
    legacyType: "hostedOn",
    legacyInverse: "hostsData",
    backstageType: "hostedOn",
    backstageInverse: "hostsData",
    isWellKnown: false,
    placement: "spec-field",
    specField: "hostedOn",
    description: "Data store hosted on infrastructure.",
  },
  {
    legacyType: "lineageFrom",
    legacyInverse: "lineageTo",
    backstageType: "lineageFrom",
    backstageInverse: "lineageTo",
    isWellKnown: false,
    placement: "spec-field",
    specField: "lineageFrom",
    description: "Data lineage from a source.",
  },
  {
    legacyType: "implementedBy",
    legacyInverse: "implements",
    backstageType: "implementedBy",
    backstageInverse: "implements",
    isWellKnown: false,
    placement: "spec-field",
    specField: "implementedBy",
    description: "Logical concept implemented by physical artifact.",
  },
  {
    legacyType: "classifiedAs",
    legacyInverse: "classifies",
    backstageType: "classifiedAs",
    backstageInverse: "classifies",
    isWellKnown: false,
    placement: "spec-field",
    specField: "classifiedAs",
    description: "Data artifact classified under a category.",
  },
  {
    legacyType: "exchangedVia",
    legacyInverse: "exchanges",
    backstageType: "exchangedVia",
    backstageInverse: "exchanges",
    isWellKnown: false,
    placement: "spec-field",
    specField: "exchangedVia",
    description: "Information exchanged via a contract.",
  },
  {
    legacyType: "retainedUnder",
    legacyInverse: "retains",
    backstageType: "retainedUnder",
    backstageInverse: "retains",
    isWellKnown: false,
    placement: "spec-field",
    specField: "retainedUnder",
    description: "Data subject to retention policy.",
  },
  {
    legacyType: "supports",
    legacyInverse: "supportedBy",
    backstageType: "supports",
    backstageInverse: "supportedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "supports",
    description: "Source supports a capability or mission.",
  },
  {
    legacyType: "performedBy",
    legacyInverse: "performs",
    backstageType: "performedBy",
    backstageInverse: "performs",
    isWellKnown: false,
    placement: "spec-field",
    specField: "performedBy",
    description: "Capability performed by a process or org unit.",
  },
  {
    legacyType: "governedBy",
    legacyInverse: "governs",
    backstageType: "governedBy",
    backstageInverse: "governs",
    isWellKnown: false,
    placement: "spec-field",
    specField: "governedBy",
    description: "Artifact governed by a policy or control.",
  },
  {
    legacyType: "supersedes",
    legacyInverse: "supersededBy",
    backstageType: "supersedes",
    backstageInverse: "supersededBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "supersedes",
    description: "Source supersedes target.",
  },
  {
    legacyType: "generates",
    legacyInverse: "generatedBy",
    backstageType: "generates",
    backstageInverse: "generatedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "generates",
    description: "Transition plan generates change records.",
  },
  {
    legacyType: "mitigates",
    legacyInverse: "mitigatedBy",
    backstageType: "mitigates",
    backstageInverse: "mitigatedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "mitigates",
    description: "Exception mitigates drift findings.",
  },
  {
    legacyType: "targets",
    legacyInverse: "targetedBy",
    backstageType: "targets",
    backstageInverse: "targetedBy",
    isWellKnown: false,
    placement: "spec-field",
    specField: "targets",
    description: "Transition artifact targets a future state.",
  },
];

// ─── Combined Registry ──────────────────────────────────────────────────────────

export const RELATION_MAPPING_REGISTRY: readonly RelationMappingEntry[] = [
  ...WELL_KNOWN_RELATIONS,
  ...CUSTOM_RELATIONS,
] as const;

// ─── Lookup Indexes ─────────────────────────────────────────────────────────────

/** Lookup by legacy type (forward). */
const byLegacyType = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.map((e) => [e.legacyType, e]),
);

/** Lookup by legacy inverse type. */
const byLegacyInverse = new Map<string, RelationMappingEntry>(
  RELATION_MAPPING_REGISTRY.map((e) => [e.legacyInverse, e]),
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
 * Map a legacy relation type to its Backstage equivalent.
 * Handles both forward and inverse types.
 */
export function mapLegacyRelation(legacyType: string): RelationMappingEntry | undefined {
  return byLegacyType.get(legacyType) ?? byLegacyInverse.get(legacyType);
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
 * Convert a legacy relation (type + target artifact ID) to Backstage format.
 *
 * Returns the spec field name and the entity ref to add to it, or
 * null if the relation isn't mapped.
 */
export function legacyRelationToSpecEntry(
  legacyType: string,
  targetEntityRef: string,
): { specField: string; targetRef: string } | null {
  const entry = byLegacyType.get(legacyType);
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
 * returns them as legacy-style relation objects: { type, target }.
 */
export function extractRelationsFromSpec(
  spec: Record<string, unknown>,
): Array<{ legacyType: string; backstageType: string; targets: string[] }> {
  const results: Array<{ legacyType: string; backstageType: string; targets: string[] }> = [];

  for (const entry of RELATION_MAPPING_REGISTRY) {
    if (!entry.specField) continue;

    const value = spec[entry.specField];
    if (!value) continue;

    // `owner` is a single string, all others are string arrays
    if (entry.specField === "owner") {
      if (typeof value === "string") {
        results.push({
          legacyType: entry.legacyType,
          backstageType: entry.backstageType,
          targets: [value],
        });
      }
    } else if (Array.isArray(value)) {
      const targets = value.filter((v): v is string => typeof v === "string");
      if (targets.length > 0) {
        results.push({
          legacyType: entry.legacyType,
          backstageType: entry.backstageType,
          targets,
        });
      }
    }
  }

  return results;
}
