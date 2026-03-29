/**
 * Anchored Spec — EA Relation Registry
 *
 * Single source of truth for relation type semantics: canonical directions,
 * computed inverses, valid source/target kind constraints, and cycle policies.
 *
 * Design reference: docs/ea-relationship-model.md
 */

// ─── Registry Entry ─────────────────────────────────────────────────────────────

export interface RelationRegistryEntry {
  /** The canonical relation type name. */
  type: string;

  /** The computed inverse type name (used in virtual inverse generation). */
  inverse: string;

  /** Which artifact kinds can be the source of this relation ("*" = any). */
  validSourceKinds: string[] | "*";

  /** Which artifact kinds can be the target of this relation ("*" = any). */
  validTargetKinds: string[] | "*";

  /** Whether cycles are allowed in this relation type. */
  allowCycles: boolean;

  /** Whether the target artifact can store an explicit inverse override. */
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

  /** Check if a source kind is valid for a relation type. */
  isValidSource(type: string, sourceKind: string): boolean {
    const entry = this.entries.get(type);
    if (!entry) return false;
    if (entry.validSourceKinds === "*") return true;
    return entry.validSourceKinds.includes(sourceKind);
  }

  /** Check if a target kind is valid for a relation type. */
  isValidTarget(type: string, targetKind: string): boolean {
    const entry = this.entries.get(type);
    if (!entry) return false;
    if (entry.validTargetKinds === "*") return true;
    return entry.validTargetKinds.includes(targetKind);
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
    validSourceKinds: ["application", "service", "integration"],
    validTargetKinds: ["capability", "business-service", "requirement"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source system realizes a business capability or requirement.",
  },
  {
    type: "uses",
    inverse: "usedBy",
    validSourceKinds: ["application", "service", "integration"],
    validTargetKinds: ["data-store", "data-product", "application", "service", "api-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system uses a data store or another system.",
  },
  {
    type: "exposes",
    inverse: "exposedBy",
    validSourceKinds: ["application", "service"],
    validTargetKinds: ["api-contract", "event-contract"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system exposes an API or event contract.",
  },
  {
    type: "consumes",
    inverse: "consumedBy",
    validSourceKinds: ["application", "service", "consumer"],
    validTargetKinds: ["api-contract", "event-contract", "system-interface"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "external-topology",
    description: "Source system consumes an API, event contract, or system interface.",
  },
  {
    type: "dependsOn",
    inverse: "dependedOnBy",
    validSourceKinds: "*",
    validTargetKinds: "*",
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "graph-integrity",
    description: "Source artifact depends on target artifact for functionality.",
  },
  {
    type: "deploys",
    inverse: "deployedBy",
    validSourceKinds: ["deployment"],
    validTargetKinds: ["application", "service"],
    allowCycles: false,
    allowExplicitInverse: true,
    driftStrategy: "anchor-resolution",
    description: "Deployment artifact deploys an application or service.",
  },
  {
    type: "runsOn",
    inverse: "runs",
    validSourceKinds: ["deployment", "application", "service", "data-store"],
    validTargetKinds: ["platform", "runtime-cluster", "cloud-resource"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source runs on a platform or cluster.",
  },
  {
    type: "boundedBy",
    inverse: "bounds",
    validSourceKinds: ["deployment", "application", "service", "data-store", "cloud-resource", "environment"],
    validTargetKinds: ["network-zone", "identity-boundary"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source is bounded by a network zone or identity boundary.",
  },
  {
    type: "authenticatedBy",
    inverse: "authenticates",
    validSourceKinds: ["deployment", "application", "service"],
    validTargetKinds: ["identity-boundary"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source is authenticated by an identity boundary.",
  },
  {
    type: "deployedTo",
    inverse: "hosts",
    validSourceKinds: ["application", "service"],
    validTargetKinds: ["platform", "environment", "runtime-cluster"],
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
    validSourceKinds: ["application", "service", "integration"],
    validTargetKinds: ["system-interface"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Source system interfaces with an external system boundary.",
  },
  {
    type: "standardizes",
    inverse: "standardizedBy",
    validSourceKinds: ["technology-standard"],
    validTargetKinds: ["application", "service", "data-store", "cloud-resource", "platform"],
    allowCycles: false,
    allowExplicitInverse: true,
    driftStrategy: "graph-integrity",
    description: "Technology standard governs the technology choices of target artifacts.",
  },
  {
    type: "providedBy",
    inverse: "provides",
    validSourceKinds: ["cloud-resource"],
    validTargetKinds: ["platform"],
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
    validSourceKinds: ["data-store"],
    validTargetKinds: ["logical-data-model", "physical-schema", "canonical-entity"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Data store stores a logical data model, physical schema, or canonical entity.",
  },
  {
    type: "hostedOn",
    inverse: "hostsData",
    validSourceKinds: ["data-store"],
    validTargetKinds: ["platform", "cloud-resource", "runtime-cluster"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Data store is hosted on a platform, cloud resource, or cluster.",
  },
  {
    type: "lineageFrom",
    inverse: "lineageTo",
    validSourceKinds: ["lineage", "data-product"],
    validTargetKinds: ["data-store", "logical-data-model", "data-product"],
    allowCycles: true,
    allowExplicitInverse: false,
    driftStrategy: "external-topology",
    description: "Lineage or data product traces data flow from a source.",
  },
  {
    type: "implementedBy",
    inverse: "implements",
    validSourceKinds: ["logical-data-model", "information-concept"],
    validTargetKinds: ["physical-schema", "data-store", "application", "canonical-entity"],
    allowCycles: false,
    allowExplicitInverse: false,
    driftStrategy: "anchor-resolution",
    description: "Logical data model or information concept is implemented by a physical artifact.",
  },
];

/** Create a registry pre-loaded with all current relations (Phase A + 2A + 2B). */
export function createDefaultRegistry(): RelationRegistry {
  const registry = new RelationRegistry();
  for (const entry of [...PHASE_A_RELATIONS, ...PHASE_2A_RELATIONS, ...PHASE_2B_RELATIONS]) {
    registry.register(entry);
  }
  return registry;
}
