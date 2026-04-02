/**
 * Anchored Spec — EA Relation Registry
 *
 * Single source of truth for relation type semantics: canonical directions,
 * computed inverses, valid source/target schema constraints, and cycle policies.
 *
 * Design reference: docs/systems/entity-model.md
 */

import {
  RELATION_DEPENDS_ON,
  RELATION_OWNED_BY,
  RELATION_OWNER_OF,
} from "@backstage/catalog-model";

// ─── Registry Entry ─────────────────────────────────────────────────────────────

export interface RelationRegistryEntry {
  /** The canonical relation type name. */
  type: string;

  /** The computed inverse type name (used in virtual inverse generation). */
  inverse: string;

  /** Which schema profiles can be the source of this relation ("*" = any). */
  validSourceSchemas: string[] | "*";

  /** Which schema profiles can be the target of this relation ("*" = any). */
  validTargetSchemas: string[] | "*";

  /** Whether cycles are allowed in this relation type. */
  allowCycles: boolean;

  /** Whether the target entity can store an explicit inverse override. */
  allowExplicitInverse: boolean;

  /** Which drift resolver strategy applies to this relation family. */
  driftStrategy?: "anchor-resolution" | "graph-integrity" | "external-topology" | "none";

  /** Human-readable description. */
  description: string;
}

// ─── Registry Class ─────────────────────────────────────────────────────────────

export class RelationRegistry {
  private readonly entries = new Map<string, RelationRegistryEntry>();
  private readonly inverseMap = new Map<string, string>();

  /** Register a relation type. */
  register(entry: RelationRegistryEntry): void {
    this.entries.set(entry.type, entry);
    this.inverseMap.set(entry.type, entry.inverse);
    // Also map inverse name back to canonical type for lookups
    this.inverseMap.set(entry.inverse, entry.type);
  }

  /** Get registry entry by canonical type name. */
  get(type: string): RelationRegistryEntry | undefined {
    return this.entries.get(type);
  }

  /** Get the inverse type name for a relation type. */
  getInverse(type: string): string | undefined {
    const entry = this.entries.get(type);
    return entry?.inverse;
  }

  /**
   * Get the canonical entry for an inverse type name.
   * If `type` is itself canonical, returns that entry.
   * If `type` is an inverse name, returns the canonical entry it belongs to.
   */
  getCanonicalEntry(type: string): RelationRegistryEntry | undefined {
    // Direct canonical lookup
    const direct = this.entries.get(type);
    if (direct) return direct;

    // Might be an inverse name → find its canonical
    const canonical = this.inverseMap.get(type);
    if (canonical) return this.entries.get(canonical);

    return undefined;
  }

  /** Check if a source schema is valid for a relation type. */
  isValidSourceSchema(type: string, sourceSchema: string): boolean {
    const entry = this.entries.get(type);
    if (!entry) return false;
    if (entry.validSourceSchemas === "*") return true;
    return entry.validSourceSchemas.includes(sourceSchema);
  }

  /** Check if a target schema is valid for a relation type. */
  isValidTargetSchema(type: string, targetSchema: string): boolean {
    const entry = this.entries.get(type);
    if (!entry) return false;
    if (entry.validTargetSchemas === "*") return true;
    return entry.validTargetSchemas.includes(targetSchema);
  }

  /** Check if a type is registered (canonical or inverse). */
  isRegistered(type: string): boolean {
    return this.entries.has(type) || this.inverseMap.has(type);
  }

  /** Get all registered canonical type names. */
  allTypes(): string[] {
    return Array.from(this.entries.keys());
  }

  /** Get all registered entries. */
  allEntries(): RelationRegistryEntry[] {
    return Array.from(this.entries.values());
  }
}

// ─── Phase A Relations ──────────────────────────────────────────────────────────

const PHASE_A_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "realizes",
    inverse: "realizedBy",
    validSourceSchemas: ["application", "service", "integration", "business-service", "decision"],
    validTargetSchemas: ["capability", "business-service", "requirement", "security-requirement", "data-requirement", "technical-requirement", "information-requirement", "mission"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source system or business service realizes a capability, mission, or requirement.",
  },
  {
    type: "uses",
    inverse: "usedBy",
    validSourceSchemas: ["application", "service", "integration"],
    validTargetSchemas: ["data-store", "data-product", "application", "service", "api-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system uses a data store or another system.",
  },
  {
    type: "exposes",
    inverse: "exposedBy",
    validSourceSchemas: ["application", "service"],
    validTargetSchemas: ["api-contract", "event-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system exposes an API or event contract.",
  },
  {
    type: "consumes",
    inverse: "consumedBy",
    validSourceSchemas: ["application", "service", "consumer"],
    validTargetSchemas: ["api-contract", "event-contract", "system-interface"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "external-topology",
    description: "Source system consumes an API, event contract, or system interface.",
  },
  {
    type: RELATION_DEPENDS_ON,
    inverse: "dependedOnBy",
    validSourceSchemas: "*",
    validTargetSchemas: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source entity depends on target entity for functionality.",
  },
  {
    type: "deploys",
    inverse: "deployedBy",
    validSourceSchemas: ["deployment"],
    validTargetSchemas: ["application", "service"],
    allowCycles: false,
    allowExplicitInverse: true,
    driftStrategy: "anchor-resolution",
    description: "Deployment entity deploys an application or service.",
  },
  {
    type: "runsOn",
    inverse: "runs",
    validSourceSchemas: ["deployment", "application", "service", "data-store"],
    validTargetSchemas: ["platform", "runtime-cluster", "cloud-resource"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source runs on a platform or cluster.",
  },
  {
    type: "boundedBy",
    inverse: "bounds",
    validSourceSchemas: ["deployment", "application", "service", "data-store", "cloud-resource", "environment"],
    validTargetSchemas: ["network-zone", "identity-boundary"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source is bounded by a network zone or identity boundary.",
  },
  {
    type: "authenticatedBy",
    inverse: "authenticates",
    validSourceSchemas: ["deployment", "application", "service"],
    validTargetSchemas: ["identity-boundary"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source is authenticated by an identity boundary.",
  },
  {
    type: "deployedTo",
    inverse: "hosts",
    validSourceSchemas: ["application", "service"],
    validTargetSchemas: ["platform", "environment", "runtime-cluster"],
    allowCycles: false,
    allowExplicitInverse: true,
    driftStrategy: "anchor-resolution",
    description: "Application or service is deployed to a platform or environment.",
  },
];

// ─── Phase 2A Relations ─────────────────────────────────────────────────────────

const PHASE_2A_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "interfacesWith",
    inverse: "interfacedBy",
    validSourceSchemas: ["application", "service", "integration"],
    validTargetSchemas: ["system-interface"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system interfaces with an external system boundary.",
  },
  {
    type: "standardizes",
    inverse: "standardizedBy",
    validSourceSchemas: ["technology-standard"],
    validTargetSchemas: ["application", "service", "data-store", "cloud-resource", "platform"],
    allowCycles: false,
    allowExplicitInverse: true,
    driftStrategy: "graph-integrity",
    description: "Technology standard governs the technology choices of target entities.",
  },
  {
    type: "providedBy",
    inverse: "provides",
    validSourceSchemas: ["cloud-resource"],
    validTargetSchemas: ["platform"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Cloud resource is provided by a platform.",
  },
];

// ─── Phase 2B Relations (Data Layer) ────────────────────────────────────────────

const PHASE_2B_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "stores",
    inverse: "storedIn",
    validSourceSchemas: ["data-store"],
    validTargetSchemas: ["logical-data-model", "physical-schema", "canonical-entity"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Data store stores a logical data model, physical schema, or canonical entity.",
  },
  {
    type: "hostedOn",
    inverse: "hostsData",
    validSourceSchemas: ["data-store"],
    validTargetSchemas: ["platform", "cloud-resource", "runtime-cluster"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Data store is hosted on a platform, cloud resource, or cluster.",
  },
  {
    type: "lineageFrom",
    inverse: "lineageTo",
    validSourceSchemas: ["lineage", "data-product"],
    validTargetSchemas: ["data-store", "logical-data-model", "data-product"],
    allowCycles: true,
    allowExplicitInverse: false,
    driftStrategy: "external-topology",
    description: "Lineage or data product traces data flow from a source.",
  },
  {
    type: "implementedBy",
    inverse: "implements",
    validSourceSchemas: ["logical-data-model", "information-concept", "change", "information-exchange", "canonical-entity"],
    validTargetSchemas: ["physical-schema", "data-store", "application", "canonical-entity", "decision", "requirement", "security-requirement", "data-requirement", "technical-requirement", "information-requirement", "api-contract", "event-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Logical data model or information concept is implemented by a physical entity.",
  },
];

// ─── Phase 2C Relations (Information Layer) ─────────────────────────────────────

const PHASE_2C_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "classifiedAs",
    inverse: "classifies",
    validSourceSchemas: [
      "canonical-entity", "logical-data-model", "data-store",
      "information-exchange", "information-concept", "physical-schema",
      "data-product",
    ],
    validTargetSchemas: ["classification"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source data entity is classified under a data classification category.",
  },
  {
    type: "exchangedVia",
    inverse: "exchanges",
    validSourceSchemas: ["canonical-entity", "information-concept"],
    validTargetSchemas: ["information-exchange", "api-contract", "event-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Information is exchanged via a contract or exchange pattern.",
  },
  {
    type: "retainedUnder",
    inverse: "retains",
    validSourceSchemas: ["data-store", "data-product", "physical-schema"],
    validTargetSchemas: ["retention-policy"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Data in the source entity is subject to the target retention policy.",
  },
];

// ─── Phase 2D Relations (Business Layer) ────────────────────────────────────────

const PHASE_2D_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "supports",
    inverse: "supportedBy",
    validSourceSchemas: ["application", "service", "process", "business-service", "capability", "mission"],
    validTargetSchemas: ["capability", "mission", "value-stream"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source supports a capability, mission, or value stream.",
  },
  {
    type: "performedBy",
    inverse: "performs",
    validSourceSchemas: ["capability", "business-service", "process"],
    validTargetSchemas: ["process", "org-unit"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source capability or service is performed by a process or org unit.",
  },
  {
    type: "governedBy",
    inverse: "governs",
    validSourceSchemas: "*",
    validTargetSchemas: ["policy-objective", "control"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source entity is governed by a policy objective or control.",
  },
  {
    type: RELATION_OWNED_BY,
    inverse: RELATION_OWNER_OF,
    validSourceSchemas: "*",
    validTargetSchemas: ["org-unit", "user"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "none",
    description: "Entity is owned by the target organization unit or user.",
  },
];

// ─── Phase 2E: Transition Relations ─────────────────────────────────────────────

const PHASE_2E_RELATIONS: RelationRegistryEntry[] = [
  {
    type: "supersedes",
    inverse: "supersededBy",
    validSourceSchemas: "*",
    validTargetSchemas: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "none",
    description: "Source entity supersedes target (newer version or replacement).",
  },
  {
    type: "generates",
    inverse: "generatedBy",
    validSourceSchemas: ["transition-plan", "migration-wave"],
    validTargetSchemas: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Transition plan or migration wave generates change records.",
  },
  {
    type: "mitigates",
    inverse: "mitigatedBy",
    validSourceSchemas: ["exception"],
    validTargetSchemas: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "none",
    description: "Exception mitigates (suppresses) drift findings for target entities.",
  },
  {
    type: "targets",
    inverse: "targetedBy",
    validSourceSchemas: ["transition-plan", "migration-wave", "baseline", "target", "change", "decision", "exception"],
    validTargetSchemas: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Transition entity targets a future-state entity or goal.",
  },
];

// ─── Traversal Profiles ─────────────────────────────────────────────────────────

export type TraversalProfileName = "strict" | "broad" | "contract";

export interface TraversalProfile {
  name: TraversalProfileName;
  description: string;
  /** The edge types included in this profile. Empty means all edges. */
  edgeTypes: string[];
}

/**
 * Named traversal profiles derived from relation drift strategies.
 * - strict: Hard dependency edges (driftStrategy ≠ "none")
 * - broad: All 27 edge types
 * - contract: API-facing subset
 */
export const TRAVERSAL_PROFILES: Record<TraversalProfileName, TraversalProfile> = {
  strict: {
    name: "strict",
    description: "Hard dependency edges only (driftStrategy ≠ none)",
    edgeTypes: [
      "realizes", "uses", "exposes", "consumes", "dependsOn",
      "deploys", "runsOn", "boundedBy", "authenticatedBy", "deployedTo",
      "interfacesWith", "standardizes", "providedBy",
      "stores", "hostedOn", "lineageFrom", "implementedBy",
      "classifiedAs", "exchangedVia", "retainedUnder",
      "supports", "performedBy", "governedBy",
      "generates", "targets",
    ],
  },
  broad: {
    name: "broad",
    description: "All edge types (current default behavior)",
    edgeTypes: [], // empty = no filter = all edges
  },
  contract: {
    name: "contract",
    description: "API-facing subset for contract impact analysis",
    edgeTypes: ["consumes", "exposes", "interfacesWith", "dependsOn", "realizes"],
  },
};

/** Get a traversal profile by name. */
export function getTraversalProfile(name: TraversalProfileName): TraversalProfile {
  return TRAVERSAL_PROFILES[name];
}

/** Create a registry pre-loaded with all current relations (Phase A + 2A + 2B + 2C + 2D + 2E). */
export function createDefaultRegistry(): RelationRegistry {
  const registry = new RelationRegistry();
  for (const entry of [...PHASE_A_RELATIONS, ...PHASE_2A_RELATIONS, ...PHASE_2B_RELATIONS, ...PHASE_2C_RELATIONS, ...PHASE_2D_RELATIONS, ...PHASE_2E_RELATIONS]) {
    registry.register(entry);
  }
  return registry;
}
