/**
 * Anchored Spec — EA Drift Rules
 *
 * Drift rules that detect architectural inconsistencies by examining
 * EA artifacts. Includes both static-analysis rules and resolver-dependent
 * rules that compare declared state against live infrastructure.
 */

import { RELATION_OWNED_BY } from "@backstage/catalog-model";
import type { BackstageEntity } from "./backstage/types.js";
import { normalizeKnownEntityRef } from "./backstage/ref-utils.js";
import {
  getEntityDomain,
  getEntityId,
  getEntitySpecRelations,
  getEntityStatus,
  getEntityTitle,
  getEntityDescription,
  getEntityTraceRefs,
} from "./backstage/accessors.js";
import { hasEntitySchema } from "./backstage/predicates.js";
import type { EaDomain } from "./types.js";
import type { EaValidationError } from "./validate.js";

// ─── Drift Rule Types ───────────────────────────────────────────────────────────

/** Observed state collected from resolvers or loaded from a snapshot. */
export interface EaResolverObservedState {
  /** External API endpoints discovered by OpenAPI resolver. */
  externalEndpoints?: Array<{ url: string; method?: string; operationId?: string }>;
  /** Cloud resources discovered by Terraform/K8s resolvers. */
  cloudResources?: Array<{ type: string; name: string; provider?: string }>;
  /** Physical schema tables/columns discovered by DDL resolver. */
  physicalSchemas?: Array<{
    table: string;
    columns: string[];
    store?: string;
  }>;
  /** Data quality rules found enforced by dbt/GE resolver. */
  enforcedQualityRules?: Array<{ ruleId: string; source: string }>;
}

export interface EaDriftContext {
  /** All loaded entities indexed by ID. */
  artifactMap: Map<string, BackstageEntity>;
  /** All loaded entities as an array. */
  artifacts: BackstageEntity[];
  /** Observed state from resolvers (available for resolver-dependent rules). */
  resolverData?: EaResolverObservedState;
}

export interface EaDriftRule {
  /** Unique rule identifier. */
  id: string;
  /** Default severity. */
  severity: "error" | "warning";
  /** Human-readable description. */
  description: string;
  /** Whether this rule requires external resolver data (deferred to Phase 2F). */
  requiresResolver: boolean;
  /** Evaluate the rule against loaded artifacts. */
  evaluate(ctx: EaDriftContext): EaValidationError[];
}

export interface EaDriftResult {
  errors: EaValidationError[];
  warnings: EaValidationError[];
  rulesEvaluated: number;
  rulesSkipped: number;
}

interface LegacyRelationRecord {
  type: string;
  target: string;
}

function normalizeTransitionRef(value: string): string {
  return normalizeKnownEntityRef(value, { defaultNamespace: "default" }) ?? value;
}

function getLegacyRelations(entity: BackstageEntity): LegacyRelationRecord[] {
  const relations = new Map<string, LegacyRelationRecord>();

  for (const { legacyType, targets } of getEntitySpecRelations(entity)) {
    for (const target of targets) {
      relations.set(`${legacyType}::${target}`, { type: legacyType, target });
    }
  }

  const specRelations = entity.spec?.relations;
  if (Array.isArray(specRelations)) {
    for (const relation of specRelations) {
      if (
        relation &&
        typeof relation === "object" &&
        typeof (relation as { type?: unknown }).type === "string" &&
        typeof (relation as { target?: unknown }).target === "string"
      ) {
        const legacyRelation = relation as { type: string; target: string };
        relations.set(`${legacyRelation.type}::${legacyRelation.target}`, legacyRelation);
      }
    }
  }

  for (const relation of entity.relations ?? []) {
    relations.set(`${relation.type}::${relation.targetRef}`, {
      type: relation.type,
      target: relation.targetRef,
    });
  }

  return [...relations.values()];
}

// ─── Static-Analysis Drift Rules ────────────────────────────────────────────────

/**
 * ea:systems/consumer-contract-version-mismatch
 *
 * Detects when a consumer declares a contractVersion that doesn't match
 * any api-contract artifact's schemaVersion.
 */
const consumerContractVersionMismatch: EaDriftRule = {
  id: "ea:systems/consumer-contract-version-mismatch",
  severity: "warning",
  description:
    "Consumer's contractVersion doesn't match the latest api-contract schemaVersion",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const _apiContracts = ctx.artifacts.filter((a) => hasEntitySchema(a, "api-contract"));

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "consumer")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const contractVersion = spec?.contractVersion as string | undefined;
      if (!contractVersion) continue;

      const consumesContracts = spec?.consumesContracts as string[] | undefined;
      for (const contractId of consumesContracts ?? []) {
        const contract = ctx.artifactMap.get(contractId);
        if (!contract) continue; // target-missing is caught by relation validation
        const contractSpec = contract.spec as Record<string, unknown> | undefined;
        const contractSchemaVersion = contractSpec?.schemaVersion as string | undefined;
        if (
          hasEntitySchema(contract, "api-contract") &&
          contractSchemaVersion &&
          contractSchemaVersion !== contractVersion
        ) {
          results.push({
            path: getEntityId(a),
            message: `Consumer "${getEntityId(a)}" declares contractVersion "${contractVersion}" but contract "${contractId}" has schemaVersion "${contractSchemaVersion}"`,
            severity: "warning",
            rule: this.id,
          });
        }
      }
    }

    return results;
  },
};

/**
 * ea:systems/technology-standard-violation
 *
 * Detects when a cloud-resource uses a technology not covered by any active
 * technology standard.
 */
const technologyStandardViolation: EaDriftRule = {
  id: "ea:systems/technology-standard-violation",
  severity: "error",
  description:
    "Cloud resource or deployment uses technology not covered by an active standard",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    // Collect all active technology standards
    const standards = ctx.artifacts.filter(
      (a) =>
        hasEntitySchema(a, "technology-standard") &&
        (getEntityStatus(a) === "active" || getEntityStatus(a) === "shipped"),
    );

    if (standards.length === 0) return results;

    // Build a set of approved technologies (lowercase for case-insensitive matching)
    const approvedTechs = new Set<string>();
    for (const std of standards) {
      const tech = std.spec?.technology as string | undefined;
      if (tech) approvedTechs.add(tech.toLowerCase());
    }

    // Check cloud resources with declared technology
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "cloud-resource")) continue;
      const tech = a.spec?.technology as { engine?: string; version?: string } | undefined;
      if (!tech?.engine) continue;

      const engine = tech.engine.toLowerCase();
      if (!approvedTechs.has(engine)) {
        results.push({
          path: getEntityId(a),
          message: `Cloud resource "${getEntityId(a)}" uses technology "${tech.engine}" which is not covered by any active technology standard`,
          severity: "error",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:systems/deprecated-version-in-use
 *
 * Detects when a cloud resource uses a version listed in a technology standard's
 * deprecatedVersions.
 */
const deprecatedVersionInUse: EaDriftRule = {
  id: "ea:systems/deprecated-version-in-use",
  severity: "warning",
  description:
    "Cloud resource uses a version in a technology standard's deprecatedVersions",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    const standards = ctx.artifacts.filter(
      (a) => hasEntitySchema(a, "technology-standard"),
    );

    // Build a map: technology name → deprecated versions
    const deprecatedMap = new Map<string, Set<string>>();
    for (const std of standards) {
      const spec = std.spec as Record<string, unknown> | undefined;
      const tech = spec?.technology as string | undefined;
      const deprecatedVersions = spec?.deprecatedVersions as string[] | undefined;
      if (tech && deprecatedVersions && deprecatedVersions.length > 0) {
        const key = tech.toLowerCase();
        const existing = deprecatedMap.get(key) ?? new Set();
        for (const v of deprecatedVersions) {
          existing.add(v);
        }
        deprecatedMap.set(key, existing);
      }
    }

    if (deprecatedMap.size === 0) return results;

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "cloud-resource")) continue;
      const tech = a.spec?.technology as { engine?: string; version?: string } | undefined;
      if (!tech?.engine || !tech?.version) continue;

      const engine = tech.engine.toLowerCase();
      const deprecated = deprecatedMap.get(engine);
      if (deprecated && deprecated.has(tech.version)) {
        results.push({
          path: getEntityId(a),
          message: `Cloud resource "${getEntityId(a)}" uses deprecated version "${tech.version}" of "${tech.engine}"`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:systems/environment-promotion-gap
 *
 * Detects when an environment's promotesFrom or promotesTo references
 * a non-existent environment.
 */
const environmentPromotionGap: EaDriftRule = {
  id: "ea:systems/environment-promotion-gap",
  severity: "warning",
  description:
    "Environment promotesFrom/promotesTo references a non-existent environment",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    const envIds = new Set(
      ctx.artifacts.filter((a) => hasEntitySchema(a, "environment")).map((a) => getEntityId(a)),
    );

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "environment")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const promotesFrom = spec?.promotesFrom as string | undefined;
      const promotesTo = spec?.promotesTo as string | undefined;

      if (promotesFrom && !envIds.has(promotesFrom)) {
        results.push({
          path: getEntityId(a),
          message: `Environment "${getEntityId(a)}" promotesFrom "${promotesFrom}" which does not exist`,
          severity: "warning",
          rule: this.id,
        });
      }
      if (promotesTo && !envIds.has(promotesTo)) {
        results.push({
          path: getEntityId(a),
          message: `Environment "${getEntityId(a)}" promotesTo "${promotesTo}" which does not exist`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

// ─── Phase 2B: Data Layer Drift Rules ───────────────────────────────────────────

/**
 * ea:data/lineage-stale
 *
 * Detects when a lineage artifact references a source or destination
 * that is retired or doesn't exist.
 */
const lineageStale: EaDriftRule = {
  id: "ea:data/lineage-stale",
  severity: "warning",
  description:
    "Lineage references source or destination artifact that is retired or missing",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "lineage")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const source = spec?.source as { artifactId?: string } | undefined;
      const destination = spec?.destination as { artifactId?: string } | undefined;

      for (const endpoint of [
        { ref: source?.artifactId, label: "source" },
        { ref: destination?.artifactId, label: "destination" },
      ]) {
        if (!endpoint.ref) continue;
        const target = ctx.artifactMap.get(endpoint.ref);
        if (!target) {
          results.push({
            path: getEntityId(a),
            message: `Lineage "${getEntityId(a)}" ${endpoint.label} "${endpoint.ref}" does not exist`,
            severity: "warning",
            rule: this.id,
          });
        } else if (getEntityStatus(target) === "retired") {
          results.push({
            path: getEntityId(a),
            message: `Lineage "${getEntityId(a)}" ${endpoint.label} "${endpoint.ref}" is retired`,
            severity: "warning",
            rule: this.id,
          });
        }
      }
    }

    return results;
  },
};

/**
 * ea:data/orphan-store
 *
 * Detects data stores with no uses, lineageFrom, or lineageTo edges.
 */
const orphanStore: EaDriftRule = {
  id: "ea:data/orphan-store",
  severity: "warning",
  description:
    "Data store with no relations (disconnected from applications and pipelines)",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    // Build set of all artifacts that are relation targets
    const allTargets = new Set<string>();
    for (const a of ctx.artifacts) {
      for (const r of getLegacyRelations(a).filter((relation) => relation.type !== RELATION_OWNED_BY)) {
        allTargets.add(r.target);
      }
    }

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "data-store")) continue;
      const hasOwnRelations = getLegacyRelations(a).some((relation) => relation.type !== RELATION_OWNED_BY);
      const isTargeted = allTargets.has(getEntityId(a));

      // Also check if any lineage references this store
      const entityId = getEntityId(a);
      const isLineageEndpoint = ctx.artifacts.some((other) => {
        if (!hasEntitySchema(other, "lineage")) return false;
        const spec = other.spec as Record<string, unknown> | undefined;
        const source = spec?.source as { artifactId?: string } | undefined;
        const destination = spec?.destination as { artifactId?: string } | undefined;
        return source?.artifactId === entityId || destination?.artifactId === entityId;
      });

      if (!hasOwnRelations && !isTargeted && !isLineageEndpoint) {
        results.push({
          path: getEntityId(a),
          message: `Data store "${getEntityId(a)}" is disconnected — no relations, not referenced, not in any lineage`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:data/shared-store-no-steward
 *
 * Detects shared data stores without a master-data-domain or steward.
 */
const sharedStoreNoSteward: EaDriftRule = {
  id: "ea:data/shared-store-no-steward",
  severity: "warning",
  description:
    "Shared data store without a master-data-domain steward",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    // Collect all entity references from master-data-domains
    const stewardedStores = new Set<string>();
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "master-data-domain")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const goldenSource = spec?.goldenSource as string | undefined;
      if (goldenSource) stewardedStores.add(goldenSource);
      // Also check relations targeting data stores
      for (const r of getLegacyRelations(a)) {
        stewardedStores.add(r.target);
      }
    }

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "data-store")) continue;
      const isShared = a.spec?.isShared as boolean | undefined;
      if (isShared && !stewardedStores.has(getEntityId(a))) {
        results.push({
          path: getEntityId(a),
          message: `Shared data store "${getEntityId(a)}" has no master-data-domain steward`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:data/product-missing-sla
 *
 * Detects active data products without an SLA definition.
 */
const productMissingSla: EaDriftRule = {
  id: "ea:data/product-missing-sla",
  severity: "warning",
  description: "Active data product without SLA definition",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "data-product")) continue;
      if (getEntityStatus(a) !== "active" && getEntityStatus(a) !== "shipped") continue;
      const sla = a.spec?.sla as Record<string, unknown> | undefined;
      if (!sla) {
        results.push({
          path: getEntityId(a),
          message: `Active data product "${getEntityId(a)}" has no SLA defined`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:data/product-missing-quality-rules
 *
 * Detects active data products with no quality rules.
 */
const productMissingQualityRules: EaDriftRule = {
  id: "ea:data/product-missing-quality-rules",
  severity: "warning",
  description: "Active data product with no quality rules",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "data-product")) continue;
      if (getEntityStatus(a) !== "active" && getEntityStatus(a) !== "shipped") continue;
      const qualityRules = a.spec?.qualityRules as unknown[] | undefined;
      if (!qualityRules || qualityRules.length === 0) {
        results.push({
          path: getEntityId(a),
          message: `Active data product "${getEntityId(a)}" has no quality rules`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

// ─── Phase 2C: Information Layer Drift Rules ────────────────────────────────────

/**
 * ea:information/entity-missing-implementation
 *
 * Canonical entity has no implementedBy relation to any data artifact.
 */
const entityMissingImplementation: EaDriftRule = {
  id: "ea:information/entity-missing-implementation",
  severity: "warning",
  description: "Canonical entity has no implementedBy relation to any data artifact",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "canonical-entity")) continue;
      const specRelations = getLegacyRelations(a);
      const hasImpl = specRelations?.some((r) => r.type === "implementedBy") ?? false;
      // Also check if any artifact has an implements relation targeting this entity
      const entityId = getEntityId(a);
      const isImplemented = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => r.type === "implementedBy" && r.target === entityId);
      });
      if (!hasImpl && !isImplemented) {
        results.push({
          path: getEntityId(a),
          message: `Canonical entity "${getEntityId(a)}" has no implementedBy relation to any data artifact`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:information/exchange-missing-contract
 *
 * Information exchange has no implementing contracts.
 */
const exchangeMissingContract: EaDriftRule = {
  id: "ea:information/exchange-missing-contract",
  severity: "error",
  description: "Information exchange has no implementing contracts",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "information-exchange")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const implementingContracts = spec?.implementingContracts as string[] | undefined;
      const hasContracts = (implementingContracts?.length ?? 0) > 0;
      // Check for implementedBy relations from the exchange to contracts
      const specRelations = getLegacyRelations(a);
      const hasImplementedBy = specRelations?.some(
        (r) =>
          r.type === "implementedBy" &&
          ctx.artifacts.some(
            (t) =>
              getEntityId(t) === r.target &&
              (hasEntitySchema(t, "api-contract") || hasEntitySchema(t, "event-contract"))
          )
      );
      // Check for exchangedVia relations from entities pointing to this exchange
      const entityId = getEntityId(a);
      const hasExchangedVia = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => r.type === "exchangedVia" && r.target === entityId);
      });
      if (!hasContracts && !hasImplementedBy && !hasExchangedVia) {
        results.push({
          path: getEntityId(a),
          message: `Information exchange "${getEntityId(a)}" has no implementing contracts — add implementedBy relations to api-contract/event-contract, or populate implementingContracts`,
          severity: "error",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:information/classification-not-propagated
 *
 * Classification applied to canonical entity but not to downstream data stores.
 * Implements graph traversal: entity → implementedBy → data artifact → check classifiedAs.
 */
const classificationNotPropagated: EaDriftRule = {
  id: "ea:information/classification-not-propagated",
  severity: "warning",
  description: "Classification applied to entity but not propagated to downstream stores",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "canonical-entity")) continue;

      // Find all classifications this entity has
      const specRelations = getLegacyRelations(a);
      const entityClassifications = (specRelations ?? [])
        .filter((r) => r.type === "classifiedAs")
        .map((r) => r.target);

      if (entityClassifications.length === 0) continue;

      // Find all data artifacts that implement this entity (via implementedBy)
      const implementors: string[] = [];
      // Check entity's own implementedBy relations
      for (const r of specRelations ?? []) {
        if (r.type === "implementedBy") implementors.push(r.target);
      }
      // Also check stores that reference this entity via stores relation
      const entityId = getEntityId(a);
      for (const other of ctx.artifacts) {
        const otherRels = getLegacyRelations(other);
        for (const r of otherRels) {
          if (r.type === "stores" && r.target === entityId) {
            implementors.push(getEntityId(other));
          }
        }
      }

      // For each downstream artifact, check if it carries the same classification
      for (const implId of implementors) {
        const implArtifact = ctx.artifactMap.get(implId);
        if (!implArtifact) continue;

        const implRels = getLegacyRelations(implArtifact);
        const implClassifications = new Set(
          (implRels ?? [])
            .filter((r) => r.type === "classifiedAs")
            .map((r) => r.target)
        );

        for (const classId of entityClassifications) {
          if (!implClassifications.has(classId)) {
            results.push({
              path: implId,
              message: `"${implId}" stores/implements "${getEntityId(a)}" which is classifiedAs "${classId}" but does not carry the same classification`,
              severity: "warning",
              rule: this.id,
            });
          }
        }
      }
    }

    return results;
  },
};

/**
 * ea:information/retention-not-enforced
 *
 * Retention policy covers a store but no evidence of enforcement exists.
 */
const retentionNotEnforced: EaDriftRule = {
  id: "ea:information/retention-not-enforced",
  severity: "warning",
  description: "Retention policy covers a store but no enforcement evidence",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "retention-policy")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const appliesTo = spec?.appliesTo as string[] | undefined;
      const disposal = spec?.disposal as { automatedBy?: string } | undefined;

      for (const targetId of appliesTo ?? []) {
        const target = ctx.artifactMap.get(targetId);
        if (!target) continue;

        // Check if target has a retainedUnder relation pointing back to this policy
        const entityId = getEntityId(a);
        const targetRels = getLegacyRelations(target);
        const hasRetainedUnder = targetRels.some((r) => r.type === "retainedUnder" && r.target === entityId);

        // Check if the disposal has automation
        const hasAutomation = !!disposal?.automatedBy;

        if (!hasRetainedUnder && !hasAutomation) {
          results.push({
            path: getEntityId(a),
            message: `Retention policy "${getEntityId(a)}" covers "${targetId}" but no enforcement evidence (no retainedUnder relation or automated disposal)`,
            severity: "warning",
            rule: this.id,
          });
        }
      }
    }

    return results;
  },
};

/**
 * ea:information/concept-not-materialized
 *
 * Information concept has no canonical entity or logical data model.
 */
const conceptNotMaterialized: EaDriftRule = {
  id: "ea:information/concept-not-materialized",
  severity: "warning",
  description: "Information concept has no canonical entity or logical data model",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "information-concept")) continue;

      const specRelations = getLegacyRelations(a);
      const hasImplementedBy = specRelations?.some((r) => r.type === "implementedBy") ?? false;
      // Check if any CE or LDM references this concept
      const entityId = getEntityId(a);
      const isReferenced = ctx.artifacts.some((other) => {
        if (hasEntitySchema(other, "canonical-entity")) {
          const conceptRef = other.spec?.conceptRef as string | undefined;
          return conceptRef === entityId;
        }
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => r.type === "implementedBy" && r.target === entityId);
      });

      if (!hasImplementedBy && !isReferenced) {
        results.push({
          path: getEntityId(a),
          message: `Information concept "${getEntityId(a)}" has no canonical entity or logical data model`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:information/orphan-classification
 *
 * Classification not referenced by any entity, store, or exchange.
 */
const orphanClassification: EaDriftRule = {
  id: "ea:information/orphan-classification",
  severity: "warning",
  description: "Classification not referenced by any artifact",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    // Build set of all classification targets
    const referencedClassifications = new Set<string>();
    for (const a of ctx.artifacts) {
      for (const r of getLegacyRelations(a)) {
        if (r.type === "classifiedAs") {
          referencedClassifications.add(r.target);
        }
      }
      // Also check classificationLevel on information-exchange
      if (hasEntitySchema(a, "information-exchange")) {
        const classificationLevel = a.spec?.classificationLevel as string | undefined;
        if (classificationLevel) {
          referencedClassifications.add(classificationLevel);
        }
      }
    }

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "classification")) continue;
      if (!referencedClassifications.has(getEntityId(a))) {
        results.push({
          path: getEntityId(a),
          message: `Classification "${getEntityId(a)}" is not referenced by any artifact`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:information/glossary-inconsistency
 *
 * Glossary term's definition conflicts with canonical entity summary.
 * (Static heuristic: checks if term title appears in an entity title but definitions don't overlap.)
 */
const glossaryInconsistency: EaDriftRule = {
  id: "ea:information/glossary-inconsistency",
  severity: "warning",
  description: "Glossary term definition may conflict with canonical entity summary",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    // Build map of CE titles (lowercase) to their IDs for matching
    const entities = ctx.artifacts.filter((a) => hasEntitySchema(a, "canonical-entity"));

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "glossary-term")) continue;
      // Check if any CE references this term via relatedConcepts or glossaryTerms
      // Find canonical entities whose conceptRef links to the same information-concept
      // that this glossary term is related to
      for (const entity of entities) {
        // Check if entity title matches glossary term title (case-insensitive)
        const termTitle = getEntityTitle(a).toLowerCase();
        const entityTitle = getEntityTitle(entity).toLowerCase();
        if (entityTitle.includes(termTitle) || termTitle.includes(entityTitle)) {
          // They refer to the same concept — check if summary and definition share content
          const definition = a.spec?.definition as string | undefined;
          const entitySummary = getEntityDescription(entity);
          if (definition && entitySummary) {
            // Simple heuristic: if neither mentions the other's key words, flag it
            const defWords = new Set(definition.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
            const summaryWords = new Set(entitySummary.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
            const overlap = [...defWords].filter((w) => summaryWords.has(w));
            if (overlap.length === 0 && defWords.size > 0 && summaryWords.size > 0) {
              results.push({
                path: getEntityId(a),
                message: `Glossary term "${getEntityId(a)}" and canonical entity "${getEntityId(entity)}" appear related but have no overlapping terminology in their descriptions`,
                severity: "warning",
                rule: this.id,
              });
            }
          }
        }
      }
    }

    return results;
  },
};

/**
 * ea:information/exchange-classification-mismatch
 *
 * Information exchange carries classified entities but does not declare the classification.
 */
const exchangeClassificationMismatch: EaDriftRule = {
  id: "ea:information/exchange-classification-mismatch",
  severity: "error",
  description: "Information exchange carries classified entities but does not declare classification",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "information-exchange")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const exchangedEntities = spec?.exchangedEntities as string[] | undefined;
      const classificationLevel = spec?.classificationLevel as string | undefined;

      if (!exchangedEntities || exchangedEntities.length === 0) continue;

      // Check if any exchanged entity has a classification
      for (const entityId of exchangedEntities) {
        const entity = ctx.artifactMap.get(entityId);
        if (!entity) continue;

        const entityRels = getLegacyRelations(entity);
        const entityClassifications = (entityRels ?? [])
          .filter((r) => r.type === "classifiedAs")
          .map((r) => r.target);

        if (entityClassifications.length > 0 && !classificationLevel) {
          results.push({
            path: getEntityId(a),
            message: `Information exchange "${getEntityId(a)}" carries entity "${entityId}" classified as "${entityClassifications.join(", ")}" but does not declare a classificationLevel`,
            severity: "error",
            rule: this.id,
          });
          break; // One finding per exchange is enough
        }
      }
    }

    return results;
  },
};

// ─── Phase 2D: Business Layer Drift Rules ───────────────────────────────────────

/**
 * ea:business/no-realizing-systems
 *
 * Active capability has no realizes or supports relation from any system.
 */
const noRealizingSystems: EaDriftRule = {
  id: "ea:business/no-realizing-systems",
  severity: "warning",
  description: "Active capability has no realizing application or service",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "capability")) continue;
      if (getEntityStatus(a) !== "active" && getEntityStatus(a) !== "shipped") continue;

      // Check if any artifact has realizes/supports → this capability
      const entityId = getEntityId(a);
      const isRealized = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some(
          (r) => (r.type === "realizes" || r.type === "supports") && r.target === entityId
        );
      });

      if (!isRealized) {
        results.push({
          path: getEntityId(a),
          message: `Active capability "${getEntityId(a)}" has no realizing or supporting application/service`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/process-missing-owner
 *
 * Process has no performedBy relation to an org-unit.
 */
const processMissingOwner: EaDriftRule = {
  id: "ea:business/process-missing-owner",
  severity: "warning",
  description: "Process has no performedBy relation to an org-unit",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "process")) continue;

      const processOwner = a.spec?.processOwner as string | undefined;
      const hasProcessOwner = !!processOwner;
      const specRelations = getLegacyRelations(a);
      const hasPerformedBy = specRelations?.some((r) => r.type === "performedBy") ?? false;
      const hasOwnedBy = specRelations?.some((r) => r.type === RELATION_OWNED_BY) ?? false;

      if (!hasProcessOwner && !hasPerformedBy && !hasOwnedBy) {
        results.push({
          path: getEntityId(a),
          message: `Process "${getEntityId(a)}" has no owner (no processOwner, performedBy, or ownedBy relation)`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/control-missing-evidence
 *
 * Automated control with no evidence record.
 */
const controlMissingEvidence: EaDriftRule = {
  id: "ea:business/control-missing-evidence",
  severity: "warning",
  description: "Automated control has no evidence record",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "control")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const implementation = spec?.implementation as string | undefined;
      const producesEvidence = spec?.producesEvidence as string | undefined;
      if (implementation === "automated" && !producesEvidence) {
        results.push({
          path: getEntityId(a),
          message: `Automated control "${getEntityId(a)}" has no producesEvidence reference`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/retired-system-dependency
 *
 * Active capability depends on (via realizes) a retired application or service.
 */
const retiredSystemDependency: EaDriftRule = {
  id: "ea:business/retired-system-dependency",
  severity: "error",
  description: "Active capability depends on a retired system",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "capability")) continue;
      if (getEntityStatus(a) !== "active" && getEntityStatus(a) !== "shipped") continue;

      // Find all systems that realize this capability
      const entityId = getEntityId(a);
      for (const other of ctx.artifacts) {
        const otherRels = getLegacyRelations(other);
        for (const r of otherRels) {
          if ((r.type === "realizes" || r.type === "supports") && r.target === entityId) {
            if (getEntityStatus(other) === "retired") {
              results.push({
                path: getEntityId(a),
                message: `Active capability "${getEntityId(a)}" is realized/supported by retired "${getEntityId(other)}"`,
                severity: "error",
                rule: this.id,
              });
            }
          }
        }
      }
    }

    return results;
  },
};

/**
 * ea:business/orphan-capability
 *
 * Capability with no parent, no children, and no realizing systems.
 */
const orphanCapability: EaDriftRule = {
  id: "ea:business/orphan-capability",
  severity: "warning",
  description: "Capability with no parent, no children, and no realizing systems",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    const capIds = new Set(ctx.artifacts.filter((a) => hasEntitySchema(a, "capability")).map((a) => getEntityId(a)));

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "capability")) continue;
      const parentCapability = a.spec?.parentCapability as string | undefined;

      const hasParent = !!parentCapability && capIds.has(parentCapability);
      const entityId = getEntityId(a);
      const hasChildren = ctx.artifacts.some(
        (other) => hasEntitySchema(other, "capability") && (other.spec?.parentCapability as string | undefined) === entityId
      );
      const isRealized = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => (r.type === "realizes" || r.type === "supports") && r.target === entityId);
      });

      if (!hasParent && !hasChildren && !isRealized) {
        results.push({
          path: getEntityId(a),
          message: `Capability "${getEntityId(a)}" is orphaned — no parent, no children, no realizing systems`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/mission-no-capabilities
 *
 * Mission with no supportedBy capabilities.
 */
const missionNoCapabilities: EaDriftRule = {
  id: "ea:business/mission-no-capabilities",
  severity: "warning",
  description: "Mission with no supporting capabilities",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "mission")) continue;

      const entityId = getEntityId(a);
      const hasSupport = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => (r.type === "supports" || r.type === "realizes") && r.target === entityId);
      });

      if (!hasSupport) {
        results.push({
          path: getEntityId(a),
          message: `Mission "${getEntityId(a)}" has no supporting capabilities or systems`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/policy-no-controls
 *
 * Policy objective with no enforcing controls.
 */
const policyNoControls: EaDriftRule = {
  id: "ea:business/policy-no-controls",
  severity: "warning",
  description: "Policy objective with no enforcing controls",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "policy-objective")) continue;
      const enforcedBy = a.spec?.enforcedBy as string[] | undefined;

      const hasEnforcedBy = (enforcedBy?.length ?? 0) > 0;
      const entityId = getEntityId(a);
      const hasGovernedBy = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => r.type === "governedBy" && r.target === entityId);
      });

      if (!hasEnforcedBy && !hasGovernedBy) {
        results.push({
          path: getEntityId(a),
          message: `Policy objective "${getEntityId(a)}" has no enforcing controls`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/control-overdue
 *
 * Control has lastExecutedAt older than its declared frequency.
 */
const controlOverdue: EaDriftRule = {
  id: "ea:business/control-overdue",
  severity: "warning",
  description: "Control execution is overdue based on its declared frequency",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    const frequencyMs: Record<string, number> = {
      "continuous": 60 * 60 * 1000,      // 1 hour grace
      "hourly": 2 * 60 * 60 * 1000,       // 2 hours
      "daily": 2 * 24 * 60 * 60 * 1000,   // 2 days
      "weekly": 10 * 24 * 60 * 60 * 1000,  // 10 days
      "monthly": 45 * 24 * 60 * 60 * 1000, // 45 days
    };

    const now = Date.now();

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "control")) continue;
      const spec = a.spec as Record<string, unknown> | undefined;
      const lastExecutedAt = spec?.lastExecutedAt as string | undefined;
      const frequency = spec?.frequency as string | undefined;
      if (!lastExecutedAt || !frequency) continue;

      const maxInterval = frequencyMs[frequency];
      if (!maxInterval) continue; // on-demand / event-triggered — skip

      const lastExec = new Date(lastExecutedAt).getTime();
      if (isNaN(lastExec)) continue;

      if (now - lastExec > maxInterval) {
        results.push({
          path: getEntityId(a),
          message: `Control "${getEntityId(a)}" last executed at ${lastExecutedAt} — overdue for "${frequency}" frequency`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/value-stream-bottleneck
 *
 * Value stream stage marked as bottleneck.
 */
const valueStreamBottleneck: EaDriftRule = {
  id: "ea:business/value-stream-bottleneck",
  severity: "warning",
  description: "Value stream has stages marked as bottleneck",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "value-stream")) continue;
      const stages = a.spec?.stages as Array<{ name?: string; bottleneck?: boolean }> | undefined;
      if (!stages) continue;

      const bottlenecks = stages.filter((s) => s.bottleneck);
      for (const bn of bottlenecks) {
        results.push({
          path: getEntityId(a),
          message: `Value stream "${getEntityId(a)}" stage "${bn.name}" is marked as a bottleneck`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

/**
 * ea:business/unowned-critical-system
 *
 * Application/service with high relations but no org-unit ownership.
 */
const unownedCriticalSystem: EaDriftRule = {
  id: "ea:business/unowned-critical-system",
  severity: "warning",
  description: "Application or service with many relations but no org-unit ownership",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];

    // Build set of artifacts owned by org-units
    const ownedArtifacts = new Set<string>();
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "org-unit")) continue;
      const specRelations = a.spec?.relations as Array<{ type: string; target: string }> | undefined;
      if (specRelations) {
        for (const r of specRelations) {
          if (r.type === RELATION_OWNED_BY) ownedArtifacts.add(getEntityId(a));
        }
      }
    }

    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "application") && !hasEntitySchema(a, "service")) continue;
      if (getEntityStatus(a) !== "active" && getEntityStatus(a) !== "shipped") continue;

      // Check if this system has significant relations (>= 3) indicating criticality
      const specRelations = getLegacyRelations(a);
      const relationCount = specRelations.length;
      const entityId = getEntityId(a);
      const schemaLabel = hasEntitySchema(a, "application") ? "application" : "service";
      const isTargeted = ctx.artifacts.some((other) => {
        const otherRels = getLegacyRelations(other);
        return otherRels.some((r) => r.target === entityId);
      });

      if ((relationCount >= 3 || isTargeted) && !ownedArtifacts.has(entityId)) {
        results.push({
          path: getEntityId(a),
          message: `Active ${schemaLabel} "${getEntityId(a)}" has significant relations but no org-unit ownership`,
          severity: "warning",
          rule: this.id,
        });
      }
    }

    return results;
  },
};

// ─── Resolver-Dependent Rules ────────────────────────────────────────────────────

/**
 * ea:systems/unmodeled-external-dependency
 *
 * Detects external API endpoints found by OpenAPI resolver that are not
 * modeled as system-interface artifacts.
 */
const unmodeledExternalDependency: EaDriftRule = {
  id: "ea:systems/unmodeled-external-dependency",
  severity: "warning",
  description:
    "Application consumes external API not modeled as system-interface (requires resolver)",
  requiresResolver: true,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const endpoints = ctx.resolverData?.externalEndpoints;
    if (!endpoints || endpoints.length === 0) return results;

    // Collect all modeled interface endpoints
    const modeledUrls = new Set<string>();
    for (const a of ctx.artifacts) {
      if (hasEntitySchema(a, "system-interface")) {
        const spec = a.spec as Record<string, unknown> | undefined;
        const endpoint = spec?.endpoint as string | undefined;
        const url = spec?.url as string | undefined;
        if (endpoint) modeledUrls.add(endpoint);
        if (url) modeledUrls.add(url);
      }
    }

    for (const ep of endpoints) {
      if (!modeledUrls.has(ep.url)) {
        results.push({
          path: ep.url,
          message: `External endpoint "${ep.url}" discovered but not modeled as a system-interface artifact`,
          severity: "warning",
          rule: "ea:systems/unmodeled-external-dependency",
        });
      }
    }
    return results;
  },
};

/**
 * ea:systems/unmodeled-cloud-resource
 *
 * Detects cloud resources found by Terraform/K8s resolvers that are not
 * modeled as cloud-resource artifacts.
 */
const unmodeledCloudResource: EaDriftRule = {
  id: "ea:systems/unmodeled-cloud-resource",
  severity: "warning",
  description:
    "Cloud resource found by resolver but not modeled (requires resolver)",
  requiresResolver: true,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const resources = ctx.resolverData?.cloudResources;
    if (!resources || resources.length === 0) return results;

    // Collect all modeled cloud resource identifiers
    const modeledResources = new Set<string>();
    for (const a of ctx.artifacts) {
      if (hasEntitySchema(a, "cloud-resource")) {
        const resourceId = a.spec?.resourceId as string | undefined;
        modeledResources.add(getEntityId(a));
        modeledResources.add(getEntityTitle(a).toLowerCase());
        if (resourceId) modeledResources.add(resourceId);
      }
    }

    for (const res of resources) {
      const resLower = res.name.toLowerCase();
      if (!modeledResources.has(res.name) && !modeledResources.has(resLower)) {
        results.push({
          path: res.name,
          message: `Cloud resource "${res.name}" (${res.type}) discovered but not modeled as a cloud-resource artifact`,
          severity: "warning",
          rule: "ea:systems/unmodeled-cloud-resource",
        });
      }
    }
    return results;
  },
};

/**
 * ea:data/logical-physical-mismatch
 *
 * Detects when physical schema columns diverge from logical data model
 * attributes declared in canonical-entity artifacts.
 */
const logicalPhysicalMismatch: EaDriftRule = {
  id: "ea:data/logical-physical-mismatch",
  severity: "error",
  description:
    "Physical schema diverges from logical data model attributes (requires DDL resolver)",
  requiresResolver: true,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const schemas = ctx.resolverData?.physicalSchemas;
    if (!schemas || schemas.length === 0) return results;

    // Build map of canonical entity titles → their attribute names
    const entityAttrs = new Map<string, Set<string>>();
    for (const a of ctx.artifacts) {
      if (hasEntitySchema(a, "canonical-entity")) {
        const attributes = a.spec?.attributes as Array<{ name: string }> | undefined;
        const attrs = new Set<string>();
        for (const attr of attributes ?? []) {
          attrs.add(attr.name);
        }
        entityAttrs.set(getEntityTitle(a).toLowerCase(), attrs);
      }
    }

    // Compare physical columns to logical attributes
    for (const schema of schemas) {
      const tableLower = schema.table.toLowerCase();
      const logicalAttrs = entityAttrs.get(tableLower);
      if (!logicalAttrs) continue; // No matching entity, covered by store-undeclared-entity

      for (const col of schema.columns) {
        if (!logicalAttrs.has(col)) {
          results.push({
            path: `${schema.table}.${col}`,
            message: `Physical column "${col}" in table "${schema.table}" has no matching logical attribute in canonical entity`,
            severity: "error",
            rule: "ea:data/logical-physical-mismatch",
          });
        }
      }
    }
    return results;
  },
};

/**
 * ea:data/store-undeclared-entity
 *
 * Detects tables/collections discovered by DDL resolver that are not
 * declared in any canonical-entity or data-store artifact.
 */
const storeUndeclaredEntity: EaDriftRule = {
  id: "ea:data/store-undeclared-entity",
  severity: "warning",
  description:
    "Data store contains tables/collections not declared in any model (requires DDL resolver)",
  requiresResolver: true,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const schemas = ctx.resolverData?.physicalSchemas;
    if (!schemas || schemas.length === 0) return results;

    // Collect all declared entity/table identifiers
    const declaredNames = new Set<string>();
    for (const a of ctx.artifacts) {
      if (hasEntitySchema(a, "canonical-entity")) {
        declaredNames.add(getEntityTitle(a).toLowerCase());
        declaredNames.add(getEntityId(a).toLowerCase());
      }
      if (hasEntitySchema(a, "data-store")) {
        declaredNames.add(getEntityTitle(a).toLowerCase());
        declaredNames.add(getEntityId(a).toLowerCase());
      }
    }

    for (const schema of schemas) {
      if (!declaredNames.has(schema.table.toLowerCase())) {
        results.push({
          path: schema.table,
          message: `Table "${schema.table}" found in physical schema but not declared in any canonical-entity or data-store artifact`,
          severity: "warning",
          rule: "ea:data/store-undeclared-entity",
        });
      }
    }
    return results;
  },
};

/**
 * ea:data/quality-rule-not-enforced
 *
 * Detects data quality rules declared in quality-attribute artifacts
 * that have no matching enforcement evidence from dbt/GE resolvers.
 */
const qualityRuleNotEnforced: EaDriftRule = {
  id: "ea:data/quality-rule-not-enforced",
  severity: "warning",
  description:
    "Data quality rule declared but no execution evidence found (requires dbt/GE resolver)",
  requiresResolver: true,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const enforced = ctx.resolverData?.enforcedQualityRules;
    if (!enforced) return results; // No resolver data — skip

    const enforcedIds = new Set(enforced.map((r) => r.ruleId));

    // Check all quality-attribute artifacts for enforcement
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "quality-attribute")) continue;
      const qualityRules = a.spec?.qualityRules as Array<{ id: string }> | undefined;
      for (const rule of qualityRules ?? []) {
        if (!enforcedIds.has(rule.id)) {
          results.push({
            path: getEntityId(a),
            message: `Quality rule "${rule.id}" on "${getEntityId(a)}" is declared but no enforcement evidence found`,
            severity: "warning",
            rule: "ea:data/quality-rule-not-enforced",
          });
        }
      }
    }
    return results;
  },
};

// ─── Phase 2E: Transition Drift Rules ───────────────────────────────────────────

const baselineMissingArtifacts: EaDriftRule = {
  id: "ea:transition/baseline-missing-artifacts",
  severity: "warning",
  description: "Baseline artifactRefs references artifacts that don't exist.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "baseline")) continue;
      const artifactRefs = a.spec?.artifactRefs as string[] | undefined;
      for (const ref of artifactRefs ?? []) {
        const normalizedRef = normalizeTransitionRef(ref);
        if (!ctx.artifactMap.has(normalizedRef)) {
          results.push({
            path: getEntityId(a),
            message: `Baseline "${getEntityId(a)}" references artifact "${ref}" which does not exist`,
            severity: "warning",
            rule: "ea:transition/baseline-missing-artifacts",
          });
        }
      }
    }
    return results;
  },
};

const baselineStale: EaDriftRule = {
  id: "ea:transition/baseline-stale",
  severity: "warning",
  description: "Baseline capturedAt is more than 90 days old.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "baseline")) continue;
      const capturedAt = a.spec?.capturedAt as string | undefined;
      if (!capturedAt) continue;
      const capturedDate = new Date(capturedAt).getTime();
      if (!isNaN(capturedDate) && now - capturedDate > ninetyDays) {
        results.push({
          path: getEntityId(a),
          message: `Baseline "${getEntityId(a)}" was captured more than 90 days ago (${capturedAt})`,
          severity: "warning",
          rule: "ea:transition/baseline-stale",
        });
      }
    }
    return results;
  },
};

const invalidTargetReference: EaDriftRule = {
  id: "ea:transition/invalid-target-reference",
  severity: "error",
  description: "Target artifactRefs references non-existent artifact.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "target")) continue;
      const artifactRefs = a.spec?.artifactRefs as string[] | undefined;
      for (const ref of artifactRefs ?? []) {
        const target = ctx.artifactMap.get(normalizeTransitionRef(ref));
        if (!target) {
          results.push({
            path: getEntityId(a),
            message: `Target "${getEntityId(a)}" references artifact "${ref}" which does not exist`,
            severity: "error",
            rule: "ea:transition/invalid-target-reference",
          });
        }
      }
    }
    return results;
  },
};

const expiredTarget: EaDriftRule = {
  id: "ea:transition/expired-target",
  severity: "warning",
  description: "Target effectiveBy date is in the past.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const now = Date.now();
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "target") || getEntityStatus(a) === "retired") continue;
      const effectiveBy = a.spec?.effectiveBy as string | undefined;
      if (!effectiveBy) continue;
      const effectiveDate = new Date(effectiveBy).getTime();
      if (!isNaN(effectiveDate) && effectiveDate < now) {
        results.push({
          path: getEntityId(a),
          message: `Target "${getEntityId(a)}" has expired (effectiveBy: ${effectiveBy})`,
          severity: "warning",
          rule: "ea:transition/expired-target",
        });
      }
    }
    return results;
  },
};

const missingBaseline: EaDriftRule = {
  id: "ea:transition/missing-baseline",
  severity: "error",
  description: "Transition plan references non-existent baseline.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "transition-plan")) continue;
      const baseline = a.spec?.baseline as string | undefined;
      if (baseline && !ctx.artifactMap.has(normalizeTransitionRef(baseline))) {
        results.push({
          path: getEntityId(a),
          message: `Transition plan "${getEntityId(a)}" references baseline "${baseline}" which does not exist`,
          severity: "error",
          rule: "ea:transition/missing-baseline",
        });
      }
    }
    return results;
  },
};

const missingTarget: EaDriftRule = {
  id: "ea:transition/missing-target",
  severity: "error",
  description: "Transition plan references non-existent target.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "transition-plan")) continue;
      const target = a.spec?.target as string | undefined;
      if (target && !ctx.artifactMap.has(normalizeTransitionRef(target))) {
        results.push({
          path: getEntityId(a),
          message: `Transition plan "${getEntityId(a)}" references target "${target}" which does not exist`,
          severity: "error",
          rule: "ea:transition/missing-target",
        });
      }
    }
    return results;
  },
};

const milestoneOnRetiredArtifact: EaDriftRule = {
  id: "ea:transition/milestone-on-retired-artifact",
  severity: "error",
  description: "Milestone deliverable is a retired artifact.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "transition-plan")) continue;
      const milestones = a.spec?.milestones as Array<{ id: string; deliverables?: string[] }> | undefined;
      for (const ms of milestones ?? []) {
        for (const deliverable of ms.deliverables ?? []) {
          const target = ctx.artifactMap.get(normalizeTransitionRef(deliverable));
          if (target && getEntityStatus(target) === "retired") {
            results.push({
              path: getEntityId(a),
              message: `Milestone "${ms.id}" in plan "${getEntityId(a)}" delivers retired artifact "${deliverable}"`,
              severity: "error",
              rule: "ea:transition/milestone-on-retired-artifact",
            });
          }
        }
      }
    }
    return results;
  },
};

const orphanWave: EaDriftRule = {
  id: "ea:transition/orphan-wave",
  severity: "warning",
  description: "Migration wave not referenced by any transition plan.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const plans = ctx.artifacts.filter((a) => hasEntitySchema(a, "transition-plan"));
    const referencedWaves = new Set<string>();
    for (const plan of plans) {
      const specRelations = plan.spec?.relations as Array<{ type: string; target: string }> | undefined;
      if (specRelations) {
        for (const rel of specRelations) {
          if (rel.type === "generates") referencedWaves.add(rel.target);
        }
      }
    }
    // Also check waves that reference plans via transitionPlan field
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "migration-wave")) continue;
      const transitionPlan = a.spec?.transitionPlan as string | undefined;
      if (transitionPlan && ctx.artifactMap.has(normalizeTransitionRef(transitionPlan))) {
        referencedWaves.add(getEntityId(a));
      }
    }
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "migration-wave")) continue;
      if (!referencedWaves.has(getEntityId(a))) {
        results.push({
          path: getEntityId(a),
          message: `Migration wave "${getEntityId(a)}" is not referenced by any transition plan`,
          severity: "warning",
          rule: "ea:transition/orphan-wave",
        });
      }
    }
    return results;
  },
};

const exceptionExpired: EaDriftRule = {
  id: "ea:exception/expired",
  severity: "warning",
  description: "Exception expiresAt is in the past.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    const now = Date.now();
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "exception") || getEntityStatus(a) === "retired") continue;
      const expiresAt = a.spec?.expiresAt as string | undefined;
      if (!expiresAt) continue;
      const expiryDate = new Date(expiresAt).getTime();
      if (!isNaN(expiryDate) && expiryDate < now) {
        results.push({
          path: getEntityId(a),
          message: `Exception "${getEntityId(a)}" has expired (expiresAt: ${expiresAt})`,
          severity: "warning",
          rule: "ea:exception/expired",
        });
      }
    }
    return results;
  },
};

const exceptionMissingScope: EaDriftRule = {
  id: "ea:exception/missing-scope",
  severity: "error",
  description: "Exception with empty scope would suppress everything.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      if (!hasEntitySchema(a, "exception")) continue;
      const scope = a.spec?.scope as { artifactIds?: string[]; rules?: string[]; domains?: string[] } | undefined;
      const hasScope = (scope?.artifactIds?.length ?? 0) > 0 ||
        (scope?.rules?.length ?? 0) > 0 ||
        (scope?.domains?.length ?? 0) > 0;
      if (!hasScope) {
        results.push({
          path: getEntityId(a),
          message: `Exception "${getEntityId(a)}" has empty scope (would suppress everything)`,
          severity: "error",
          rule: "ea:exception/missing-scope",
        });
      }
    }
    return results;
  },
};

// ─── Phase 2F — Traceability Rules ──────────────────────────────────────────────

/**
 * traceRef targets a path that looks like a local file but the referenced
 * artifact has an empty or missing path.  URL traceRefs are ignored.
 */
const traceRefTargetExists: EaDriftRule = {
  id: "ea:trace/ref-target-exists",
  severity: "warning",
  description: "Every traceRefs[].path that looks like a file path should reference a valid artifact ID or a plausible file path.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      for (const ref of getEntityTraceRefs(a)) {
        if (!ref.path || ref.path.startsWith("http://") || ref.path.startsWith("https://")) continue;
        // Check if path references another artifact
        if (ctx.artifactMap.has(ref.path)) continue;
        // File existence cannot be checked in pure drift (no fs access in rules).
        // Instead, warn when the path has no extension (likely typo).
        if (!ref.path.includes(".") && !ref.path.includes("/")) {
          results.push({
            path: getEntityId(a),
            message: `Artifact "${getEntityId(a)}" traceRef "${ref.path}" looks like neither a file path nor a valid artifact ID`,
            severity: "warning",
            rule: this.id,
          });
        }
      }
    }
    return results;
  },
};

/**
 * Detect duplicate traceRef entries within a single artifact.
 */
const traceRefDuplicate: EaDriftRule = {
  id: "ea:trace/duplicate-ref",
  severity: "warning",
  description: "An artifact should not have duplicate traceRef paths.",
  requiresResolver: false,
  evaluate(ctx) {
    const results: EaValidationError[] = [];
    for (const a of ctx.artifacts) {
      const refs = getEntityTraceRefs(a);
      const seen = new Set<string>();
      for (const ref of refs) {
        if (seen.has(ref.path)) {
          results.push({
            path: getEntityId(a),
            message: `Artifact "${getEntityId(a)}" has duplicate traceRef "${ref.path}"`,
            severity: "warning",
            rule: this.id,
          });
        }
        seen.add(ref.path);
      }
    }
    return results;
  },
};

// ─── Rule Registry & Runner ─────────────────────────────────────────────────────

/** All registered EA drift rules. */
export const EA_DRIFT_RULES: EaDriftRule[] = [
  // Phase 2A — Systems & Delivery
  consumerContractVersionMismatch,
  technologyStandardViolation,
  deprecatedVersionInUse,
  environmentPromotionGap,
  // Phase 2B — Data Layer
  lineageStale,
  orphanStore,
  sharedStoreNoSteward,
  productMissingSla,
  productMissingQualityRules,
  // Phase 2C — Information Layer
  entityMissingImplementation,
  exchangeMissingContract,
  classificationNotPropagated,
  retentionNotEnforced,
  conceptNotMaterialized,
  orphanClassification,
  glossaryInconsistency,
  exchangeClassificationMismatch,
  // Phase 2D — Business Layer
  noRealizingSystems,
  processMissingOwner,
  controlMissingEvidence,
  retiredSystemDependency,
  orphanCapability,
  missionNoCapabilities,
  policyNoControls,
  controlOverdue,
  valueStreamBottleneck,
  unownedCriticalSystem,
  // Phase 2E — Transitions
  baselineMissingArtifacts,
  baselineStale,
  invalidTargetReference,
  expiredTarget,
  missingBaseline,
  missingTarget,
  milestoneOnRetiredArtifact,
  orphanWave,
  exceptionExpired,
  exceptionMissingScope,
  // Resolver-dependent rules (require EaResolverObservedState data)
  unmodeledExternalDependency,
  unmodeledCloudResource,
  logicalPhysicalMismatch,
  storeUndeclaredEntity,
  qualityRuleNotEnforced,
  // Phase 2F — Traceability
  traceRefTargetExists,
  traceRefDuplicate,
];

/**
 * Run all EA drift rules against loaded artifacts.
 * Resolver-dependent rules are skipped unless `includeResolverRules` is true
 * (for future use when resolvers are available).
 */
export function evaluateEaDrift(
  entities: BackstageEntity[],
  options?: { includeResolverRules?: boolean; resolverData?: EaResolverObservedState },
): EaDriftResult {
  const artifactMap = new Map<string, BackstageEntity>();
  for (const entity of entities) {
    artifactMap.set(getEntityId(entity), entity);
  }

  const ctx: EaDriftContext = { artifactMap, artifacts: entities, resolverData: options?.resolverData };
  const errors: EaValidationError[] = [];
  const warnings: EaValidationError[] = [];
  let rulesEvaluated = 0;
  let rulesSkipped = 0;

  for (const rule of EA_DRIFT_RULES) {
    if (rule.requiresResolver && !options?.includeResolverRules) {
      rulesSkipped++;
      continue;
    }

    rulesEvaluated++;
    const findings = rule.evaluate(ctx);
    for (const f of findings) {
      if (f.severity === "error") {
        errors.push(f);
      } else {
        warnings.push(f);
      }
    }
  }

  return { errors, warnings, rulesEvaluated, rulesSkipped };
}

// ─── Full Drift Engine ──────────────────────────────────────────────────────────

/** A drift finding enriched with artifact context and suppression status. */
export interface EaDriftFinding {
  /** The drift rule that triggered this finding. */
  rule: string;
  /** Severity (may be overridden from default). */
  severity: "error" | "warning" | "info";
  /** The artifact that triggered this finding. */
  artifactId: string;
  /** Path within the artifact (e.g., field name). */
  path: string;
  /** EA domain of the affected artifact. */
  domain: string;
  /** Human-readable message. */
  message: string;
  /** Suggested fix. */
  suggestion?: string;
  /** Whether this finding is suppressed by an exception. */
  suppressed: boolean;
  /** ID of the exception that suppresses this finding. */
  suppressedBy?: string;
}

/** Severity counts per domain for heatmap reporting. */
export interface DomainDriftSummary {
  errors: number;
  warnings: number;
  info: number;
}

/** Full drift report with heatmap data. */
export interface EaDriftReport {
  /** Whether the check passed (no unsuppressed errors). */
  passed: boolean;
  /** Aggregate counts. */
  summary: {
    errors: number;
    warnings: number;
    info: number;
    suppressed: number;
    rulesEvaluated: number;
  };
  /** Per-domain breakdown for heatmap. */
  byDomain: Record<string, DomainDriftSummary>;
  /** Top rules by finding frequency. */
  topRules: Array<{ rule: string; count: number }>;
  /** All findings. */
  findings: EaDriftFinding[];
  /** ISO 8601 timestamp of this check. */
  checkedAt: string;
}

/** Options for the full drift engine. */
export interface EaDriftOptions {
  /** All loaded entities. */
  artifacts: BackstageEntity[];
  /** Active exceptions for suppression. */
  exceptions?: BackstageEntity[];
  /** Severity overrides: rule ID → severity or "off". */
  ruleOverrides?: Record<string, "error" | "warning" | "info" | "off">;
  /** Filter to specific domains. */
  domains?: string[];
  /** Include resolver-dependent rules. */
  includeResolverRules?: boolean;
  /** Resolver cache for caching observed state. */
  cache?: import("./cache.js").ResolverCache;
  /** Pre-collected resolver snapshot (from --from-snapshot or live resolvers). */
  snapshot?: EaResolverObservedState | Record<string, unknown>;
}

/**
 * Full EA drift detection pipeline:
 * 1. Run all graph-integrity rules (existing EA_DRIFT_RULES)
 * 2. Convert findings to EaDriftFinding with domain context
 * 3. Apply domain filter (if specified)
 * 4. Apply exception suppression
 * 5. Apply severity overrides
 * 6. Build report with heatmap
 */
export function detectEaDrift(options: EaDriftOptions): EaDriftReport {
  const { artifacts, exceptions, ruleOverrides, domains, includeResolverRules, snapshot } = options;

  // Step 1: Run existing graph-integrity rules (with resolver data if available)
  const resolverData = snapshot as EaResolverObservedState | undefined;
  const rawResult = evaluateEaDrift(artifacts, { includeResolverRules, resolverData });

  // Step 2: Convert EaValidationError[] → EaDriftFinding[]
  const allErrors = rawResult.errors.map((e) => validationErrorToFinding(e, "error", artifacts));
  const allWarnings = rawResult.warnings.map((w) => validationErrorToFinding(w, "warning", artifacts));
  let findings = [...allErrors, ...allWarnings];

  // Step 3: Apply domain filter
  if (domains && domains.length > 0) {
    findings = findings.filter((f) => domains.includes(f.domain));
  }

  // Step 4: Apply exception suppression
  if (exceptions && exceptions.length > 0) {
    findings = applySuppression(findings, exceptions);
  }

  // Step 4b: Apply inline per-artifact drift suppression (spec.driftSuppress)
  findings = applyInlineSuppression(findings, artifacts);

  // Step 5: Apply severity overrides
  if (ruleOverrides) {
    findings = applySeverityOverrides(findings, ruleOverrides);
  }

  // Step 6: Build report
  return buildDriftReport(findings, rawResult.rulesEvaluated);
}

/**
 * Convert an EaValidationError to an EaDriftFinding, enriching with
 * artifact domain context.
 */
function validationErrorToFinding(
  error: EaValidationError,
  severity: "error" | "warning",
  artifacts: BackstageEntity[],
): EaDriftFinding {
  // Extract artifact ID from the error path (typically the first segment)
  const artifactId = error.path ?? "";
  const domain = inferDomainFromArtifact(artifactId, artifacts);
  const rule = error.rule ?? error.message.split(":")[0] ?? "unknown";

  return {
    rule,
    severity,
    artifactId,
    path: error.path ?? "",
    domain,
    message: error.message,
    suppressed: false,
  };
}

/**
 * Infer domain from an artifact ID by looking up in the kind registry.
 */
function inferDomainFromArtifact(artifactId: string, artifacts: BackstageEntity[]): string {
  const artifact = artifacts.find((a) => getEntityId(a) === artifactId);
  if (!artifact) return "unknown";
  return getEntityDomain(artifact) ?? "unknown";
}

/**
 * Apply exception suppression to findings.
 *
 * A finding is suppressed if an active, non-expired exception matches:
 * - scope.artifactIds includes the finding's artifactId (or artifactIds is empty/undefined)
 * - scope.rules includes the finding's rule (or rules is empty/undefined)
 * - scope.domains includes the finding's domain (or domains is empty/undefined)
 */
function applySuppression(
  findings: EaDriftFinding[],
  exceptions: BackstageEntity[],
): EaDriftFinding[] {
  const now = Date.now();

  // Filter to active, non-expired exceptions
  const activeExceptions = exceptions.filter((exc) => {
    const expiresAt = exc.spec?.expiresAt as string | undefined;
    if (!expiresAt) return false;
    const expiresMs = new Date(expiresAt).getTime();
    return !isNaN(expiresMs) && expiresMs > now;
  });

  return findings.map((f) => {
    for (const exc of activeExceptions) {
      const scope = exc.spec?.scope as { artifactIds?: string[]; rules?: string[]; domains?: string[] } | undefined;
      const matchesArtifact =
        !scope?.artifactIds || scope.artifactIds.length === 0 || scope.artifactIds.includes(f.artifactId);
      const matchesRule =
        !scope?.rules || scope.rules.length === 0 || scope.rules.includes(f.rule);
      const matchesDomain =
        !scope?.domains || scope.domains.length === 0 || scope.domains.includes(f.domain as EaDomain);

      if (matchesArtifact && matchesRule && matchesDomain) {
        return { ...f, suppressed: true, suppressedBy: getEntityId(exc) };
      }
    }
    return f;
  });
}

/**
 * Apply inline per-artifact drift suppression.
 *
 * Artifacts can declare `extensions.driftSuppress: string[]` — an array
 * of drift rule IDs to suppress for that artifact. Example:
 *
 *   extensions:
 *     driftSuppress:
 *       - "ea:business/unowned-critical-system"
 *       - "ea:information/exchange-missing-contract"
 */
function applyInlineSuppression(
  findings: EaDriftFinding[],
  artifacts: BackstageEntity[],
): EaDriftFinding[] {
  // Build a map: artifactId → Set<suppressed rule IDs>
  const suppressMap = new Map<string, Set<string>>();
  for (const a of artifacts) {
    const suppress = a.spec?.driftSuppress as unknown;
    if (Array.isArray(suppress) && suppress.length > 0) {
      suppressMap.set(getEntityId(a), new Set(suppress.map(String)));
    }
  }

  if (suppressMap.size === 0) return findings;

  return findings.map((f) => {
    if (f.suppressed) return f;
    const rules = suppressMap.get(f.artifactId);
    if (rules && rules.has(f.rule)) {
      return { ...f, suppressed: true, suppressedBy: `${f.artifactId}:inline` };
    }
    return f;
  });
}

/**
 * Apply severity overrides from configuration.
 * "off" removes the finding entirely.
 */
function applySeverityOverrides(
  findings: EaDriftFinding[],
  overrides: Record<string, "error" | "warning" | "info" | "off">,
): EaDriftFinding[] {
  return findings
    .filter((f) => overrides[f.rule] !== "off")
    .map((f) => {
      const override = overrides[f.rule];
      if (override && override !== "off") {
        return { ...f, severity: override };
      }
      return f;
    });
}

/**
 * Build the final drift report from processed findings.
 */
function buildDriftReport(findings: EaDriftFinding[], rulesEvaluated: number): EaDriftReport {
  const byDomain: Record<string, DomainDriftSummary> = {};
  const ruleCount: Record<string, number> = {};

  let errors = 0;
  let warnings = 0;
  let info = 0;
  let suppressed = 0;

  for (const f of findings) {
    if (f.suppressed) {
      suppressed++;
      continue;
    }

    // Count by severity
    if (f.severity === "error") errors++;
    else if (f.severity === "warning") warnings++;
    else info++;

    // Count by domain
    if (!byDomain[f.domain]) {
      byDomain[f.domain] = { errors: 0, warnings: 0, info: 0 };
    }
    const domainEntry = byDomain[f.domain]!;
    if (f.severity === "error") domainEntry.errors++;
    else if (f.severity === "warning") domainEntry.warnings++;
    else domainEntry.info++;

    // Count by rule
    ruleCount[f.rule] = (ruleCount[f.rule] ?? 0) + 1;
  }

  // Top rules sorted by frequency
  const topRules = Object.entries(ruleCount)
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count);

  return {
    passed: errors === 0,
    summary: { errors, warnings, info, suppressed, rulesEvaluated },
    byDomain,
    topRules,
    findings,
    checkedAt: new Date().toISOString(),
  };
}
