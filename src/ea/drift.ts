/**
 * Anchored Spec — EA Drift Rules
 *
 * Static-analysis drift rules that detect architectural inconsistencies
 * by examining EA artifacts without external resolvers.
 *
 * Resolver-dependent drift rules (e.g., comparing Terraform state to models)
 * are planned for Phase 2F when the resolver framework is built.
 */

import type {
  EaArtifactBase,
  ConsumerArtifact,
  CloudResourceArtifact,
  EnvironmentArtifact,
  TechnologyStandardArtifact,
  LineageArtifact,
  DataStoreArtifact,
  DataProductArtifact,
  MasterDataDomainArtifact,
  InformationExchangeArtifact,
  CanonicalEntityArtifact,
  ClassificationArtifact,
  RetentionPolicyArtifact,
  CapabilityArtifact,
  ValueStreamArtifact,
  ProcessArtifact,
  PolicyObjectiveArtifact,
  ControlArtifact,
  MissionArtifact,
  BaselineArtifact,
  TargetArtifact,
  TransitionPlanArtifact,
  MigrationWaveArtifact,
  ExceptionArtifact,
} from "./types.js";
import { getDomainForKind } from "./types.js";
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
  /** All loaded artifacts indexed by ID. */
  artifactMap: Map<string, EaArtifactBase>;
  /** All loaded artifacts as an array. */
  artifacts: EaArtifactBase[];
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
    const apiContracts = ctx.artifacts.filter((a) => a.kind === "api-contract");

    for (const a of ctx.artifacts) {
      if (a.kind !== "consumer") continue;
      const consumer = a as unknown as ConsumerArtifact;
      if (!consumer.contractVersion) continue;

      for (const contractId of consumer.consumesContracts) {
        const contract = ctx.artifactMap.get(contractId);
        if (!contract) continue; // target-missing is caught by relation validation
        if (
          contract.kind === "api-contract" &&
          contract.schemaVersion &&
          contract.schemaVersion !== consumer.contractVersion
        ) {
          results.push({
            path: a.id,
            message: `Consumer "${a.id}" declares contractVersion "${consumer.contractVersion}" but contract "${contractId}" has schemaVersion "${contract.schemaVersion}"`,
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
        a.kind === "technology-standard" &&
        (a.status === "active" || a.status === "shipped"),
    ) as unknown as TechnologyStandardArtifact[];

    if (standards.length === 0) return results;

    // Build a set of approved technologies (lowercase for case-insensitive matching)
    const approvedTechs = new Set<string>();
    for (const std of standards) {
      approvedTechs.add(std.technology.toLowerCase());
    }

    // Check cloud resources with declared technology
    for (const a of ctx.artifacts) {
      if (a.kind !== "cloud-resource") continue;
      const cloud = a as unknown as CloudResourceArtifact;
      if (!cloud.technology?.engine) continue;

      const engine = cloud.technology.engine.toLowerCase();
      if (!approvedTechs.has(engine)) {
        results.push({
          path: a.id,
          message: `Cloud resource "${a.id}" uses technology "${cloud.technology.engine}" which is not covered by any active technology standard`,
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
      (a) => a.kind === "technology-standard",
    ) as unknown as TechnologyStandardArtifact[];

    // Build a map: technology name → deprecated versions
    const deprecatedMap = new Map<string, Set<string>>();
    for (const std of standards) {
      if (std.deprecatedVersions && std.deprecatedVersions.length > 0) {
        const key = std.technology.toLowerCase();
        const existing = deprecatedMap.get(key) ?? new Set();
        for (const v of std.deprecatedVersions) {
          existing.add(v);
        }
        deprecatedMap.set(key, existing);
      }
    }

    if (deprecatedMap.size === 0) return results;

    for (const a of ctx.artifacts) {
      if (a.kind !== "cloud-resource") continue;
      const cloud = a as unknown as CloudResourceArtifact;
      if (!cloud.technology?.engine || !cloud.technology?.version) continue;

      const engine = cloud.technology.engine.toLowerCase();
      const deprecated = deprecatedMap.get(engine);
      if (deprecated && deprecated.has(cloud.technology.version)) {
        results.push({
          path: a.id,
          message: `Cloud resource "${a.id}" uses deprecated version "${cloud.technology.version}" of "${cloud.technology.engine}"`,
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
      ctx.artifacts.filter((a) => a.kind === "environment").map((a) => a.id),
    );

    for (const a of ctx.artifacts) {
      if (a.kind !== "environment") continue;
      const env = a as unknown as EnvironmentArtifact;

      if (env.promotesFrom && !envIds.has(env.promotesFrom)) {
        results.push({
          path: a.id,
          message: `Environment "${a.id}" promotesFrom "${env.promotesFrom}" which does not exist`,
          severity: "warning",
          rule: this.id,
        });
      }
      if (env.promotesTo && !envIds.has(env.promotesTo)) {
        results.push({
          path: a.id,
          message: `Environment "${a.id}" promotesTo "${env.promotesTo}" which does not exist`,
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
      if (a.kind !== "lineage") continue;
      const lin = a as unknown as LineageArtifact;

      for (const endpoint of [
        { ref: lin.source?.artifactId, label: "source" },
        { ref: lin.destination?.artifactId, label: "destination" },
      ]) {
        if (!endpoint.ref) continue;
        const target = ctx.artifactMap.get(endpoint.ref);
        if (!target) {
          results.push({
            path: a.id,
            message: `Lineage "${a.id}" ${endpoint.label} "${endpoint.ref}" does not exist`,
            severity: "warning",
            rule: this.id,
          });
        } else if (target.status === "retired") {
          results.push({
            path: a.id,
            message: `Lineage "${a.id}" ${endpoint.label} "${endpoint.ref}" is retired`,
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
      if (a.relations) {
        for (const r of a.relations) {
          allTargets.add(r.target);
        }
      }
    }

    for (const a of ctx.artifacts) {
      if (a.kind !== "data-store") continue;
      const hasOwnRelations = (a.relations?.length ?? 0) > 0;
      const isTargeted = allTargets.has(a.id);

      // Also check if any lineage references this store
      const isLineageEndpoint = ctx.artifacts.some((other) => {
        if (other.kind !== "lineage") return false;
        const lin = other as unknown as LineageArtifact;
        return lin.source?.artifactId === a.id || lin.destination?.artifactId === a.id;
      });

      if (!hasOwnRelations && !isTargeted && !isLineageEndpoint) {
        results.push({
          path: a.id,
          message: `Data store "${a.id}" is disconnected — no relations, not referenced, not in any lineage`,
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
      if (a.kind !== "master-data-domain") continue;
      const mdm = a as unknown as MasterDataDomainArtifact;
      if (mdm.goldenSource) stewardedStores.add(mdm.goldenSource);
      // Also check relations targeting data stores
      if (a.relations) {
        for (const r of a.relations) {
          stewardedStores.add(r.target);
        }
      }
    }

    for (const a of ctx.artifacts) {
      if (a.kind !== "data-store") continue;
      const ds = a as unknown as DataStoreArtifact;
      if (ds.isShared && !stewardedStores.has(a.id)) {
        results.push({
          path: a.id,
          message: `Shared data store "${a.id}" has no master-data-domain steward`,
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
      if (a.kind !== "data-product") continue;
      if (a.status !== "active" && a.status !== "shipped") continue;
      const dp = a as unknown as DataProductArtifact;
      if (!dp.sla) {
        results.push({
          path: a.id,
          message: `Active data product "${a.id}" has no SLA defined`,
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
      if (a.kind !== "data-product") continue;
      if (a.status !== "active" && a.status !== "shipped") continue;
      const dp = a as unknown as DataProductArtifact;
      if (!dp.qualityRules || dp.qualityRules.length === 0) {
        results.push({
          path: a.id,
          message: `Active data product "${a.id}" has no quality rules`,
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
      if (a.kind !== "canonical-entity") continue;
      const hasImpl = a.relations?.some((r) => r.type === "implementedBy") ?? false;
      // Also check if any artifact has an implements relation targeting this entity
      const isImplemented = ctx.artifacts.some((other) =>
        other.relations?.some((r) => r.type === "implementedBy" && r.target === a.id)
      );
      if (!hasImpl && !isImplemented) {
        results.push({
          path: a.id,
          message: `Canonical entity "${a.id}" has no implementedBy relation to any data artifact`,
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
      if (a.kind !== "information-exchange") continue;
      const exch = a as unknown as InformationExchangeArtifact;
      const hasContracts = (exch.implementingContracts?.length ?? 0) > 0;
      // Also check for exchangedVia relations pointing to contracts
      const hasExchangedVia = ctx.artifacts.some((other) =>
        other.relations?.some((r) => r.type === "exchangedVia" && r.target === a.id)
      );
      if (!hasContracts && !hasExchangedVia) {
        results.push({
          path: a.id,
          message: `Information exchange "${a.id}" has no implementing contracts (no API or event contract)`,
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
      if (a.kind !== "canonical-entity") continue;

      // Find all classifications this entity has
      const entityClassifications = (a.relations ?? [])
        .filter((r) => r.type === "classifiedAs")
        .map((r) => r.target);

      if (entityClassifications.length === 0) continue;

      // Find all data artifacts that implement this entity (via implementedBy)
      const implementors: string[] = [];
      // Check entity's own implementedBy relations
      for (const r of a.relations ?? []) {
        if (r.type === "implementedBy") implementors.push(r.target);
      }
      // Also check stores that reference this entity via stores relation
      for (const other of ctx.artifacts) {
        if (other.relations) {
          for (const r of other.relations) {
            if (r.type === "stores" && r.target === a.id) {
              implementors.push(other.id);
            }
          }
        }
      }

      // For each downstream artifact, check if it carries the same classification
      for (const implId of implementors) {
        const implArtifact = ctx.artifactMap.get(implId);
        if (!implArtifact) continue;

        const implClassifications = new Set(
          (implArtifact.relations ?? [])
            .filter((r) => r.type === "classifiedAs")
            .map((r) => r.target)
        );

        for (const classId of entityClassifications) {
          if (!implClassifications.has(classId)) {
            results.push({
              path: implId,
              message: `"${implId}" stores/implements "${a.id}" which is classifiedAs "${classId}" but does not carry the same classification`,
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
      if (a.kind !== "retention-policy") continue;
      const ret = a as unknown as RetentionPolicyArtifact;

      for (const targetId of ret.appliesTo ?? []) {
        const target = ctx.artifactMap.get(targetId);
        if (!target) continue;

        // Check if target has a retainedUnder relation pointing back to this policy
        const hasRetainedUnder = target.relations?.some(
          (r) => r.type === "retainedUnder" && r.target === a.id
        ) ?? false;

        // Check if the disposal has automation
        const hasAutomation = !!ret.disposal?.automatedBy;

        if (!hasRetainedUnder && !hasAutomation) {
          results.push({
            path: a.id,
            message: `Retention policy "${a.id}" covers "${targetId}" but no enforcement evidence (no retainedUnder relation or automated disposal)`,
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
      if (a.kind !== "information-concept") continue;

      const hasImplementedBy = a.relations?.some((r) => r.type === "implementedBy") ?? false;
      // Check if any CE or LDM references this concept
      const isReferenced = ctx.artifacts.some((other) => {
        if (other.kind === "canonical-entity") {
          const ce = other as unknown as CanonicalEntityArtifact;
          return ce.conceptRef === a.id;
        }
        return other.relations?.some((r) => r.type === "implementedBy" && r.target === a.id) ?? false;
      });

      if (!hasImplementedBy && !isReferenced) {
        results.push({
          path: a.id,
          message: `Information concept "${a.id}" has no canonical entity or logical data model`,
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
      if (a.relations) {
        for (const r of a.relations) {
          if (r.type === "classifiedAs") {
            referencedClassifications.add(r.target);
          }
        }
      }
      // Also check classificationLevel on information-exchange
      if (a.kind === "information-exchange") {
        const exch = a as unknown as InformationExchangeArtifact;
        if (exch.classificationLevel) {
          referencedClassifications.add(exch.classificationLevel);
        }
      }
    }

    for (const a of ctx.artifacts) {
      if (a.kind !== "classification") continue;
      if (!referencedClassifications.has(a.id)) {
        results.push({
          path: a.id,
          message: `Classification "${a.id}" is not referenced by any artifact`,
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
    const entities = ctx.artifacts.filter((a) => a.kind === "canonical-entity");

    for (const a of ctx.artifacts) {
      if (a.kind !== "glossary-term") continue;
      // Check if any CE references this term via relatedConcepts or glossaryTerms
      // Find canonical entities whose conceptRef links to the same information-concept
      // that this glossary term is related to
      for (const entity of entities) {
        const ce = entity as unknown as CanonicalEntityArtifact;
        // Check if entity title matches glossary term title (case-insensitive)
        const termTitle = a.title.toLowerCase();
        const entityTitle = entity.title.toLowerCase();
        if (entityTitle.includes(termTitle) || termTitle.includes(entityTitle)) {
          // They refer to the same concept — check if summary and definition share content
          const gt = a as unknown as { definition: string };
          if (gt.definition && entity.summary) {
            // Simple heuristic: if neither mentions the other's key words, flag it
            const defWords = new Set(gt.definition.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
            const summaryWords = new Set(entity.summary.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
            const overlap = [...defWords].filter((w) => summaryWords.has(w));
            if (overlap.length === 0 && defWords.size > 0 && summaryWords.size > 0) {
              results.push({
                path: a.id,
                message: `Glossary term "${a.id}" and canonical entity "${entity.id}" appear related but have no overlapping terminology in their descriptions`,
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
      if (a.kind !== "information-exchange") continue;
      const exch = a as unknown as InformationExchangeArtifact;

      if (!exch.exchangedEntities || exch.exchangedEntities.length === 0) continue;

      // Check if any exchanged entity has a classification
      for (const entityId of exch.exchangedEntities) {
        const entity = ctx.artifactMap.get(entityId);
        if (!entity) continue;

        const entityClassifications = (entity.relations ?? [])
          .filter((r) => r.type === "classifiedAs")
          .map((r) => r.target);

        if (entityClassifications.length > 0 && !exch.classificationLevel) {
          results.push({
            path: a.id,
            message: `Information exchange "${a.id}" carries entity "${entityId}" classified as "${entityClassifications.join(", ")}" but does not declare a classificationLevel`,
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
      if (a.kind !== "capability") continue;
      if (a.status !== "active" && a.status !== "shipped") continue;

      // Check if any artifact has realizes/supports → this capability
      const isRealized = ctx.artifacts.some((other) =>
        other.relations?.some(
          (r) => (r.type === "realizes" || r.type === "supports") && r.target === a.id
        )
      );

      if (!isRealized) {
        results.push({
          path: a.id,
          message: `Active capability "${a.id}" has no realizing or supporting application/service`,
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
      if (a.kind !== "process") continue;

      const proc = a as unknown as ProcessArtifact;
      const hasProcessOwner = !!proc.processOwner;
      const hasPerformedBy = a.relations?.some((r) => r.type === "performedBy") ?? false;
      // Check if any org-unit owns this process
      const isOwned = ctx.artifacts.some((other) =>
        other.relations?.some((r) => r.type === "owns" && r.target === a.id)
      );

      if (!hasProcessOwner && !hasPerformedBy && !isOwned) {
        results.push({
          path: a.id,
          message: `Process "${a.id}" has no owner (no processOwner, performedBy, or owns relation)`,
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
      if (a.kind !== "control") continue;
      const ctrl = a as unknown as ControlArtifact;
      if (ctrl.implementation === "automated" && !ctrl.producesEvidence) {
        results.push({
          path: a.id,
          message: `Automated control "${a.id}" has no producesEvidence reference`,
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
      if (a.kind !== "capability") continue;
      if (a.status !== "active" && a.status !== "shipped") continue;

      // Find all systems that realize this capability
      for (const other of ctx.artifacts) {
        if (!other.relations) continue;
        for (const r of other.relations) {
          if ((r.type === "realizes" || r.type === "supports") && r.target === a.id) {
            if (other.status === "retired") {
              results.push({
                path: a.id,
                message: `Active capability "${a.id}" is realized/supported by retired "${other.id}"`,
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

    const capIds = new Set(ctx.artifacts.filter((a) => a.kind === "capability").map((a) => a.id));

    for (const a of ctx.artifacts) {
      if (a.kind !== "capability") continue;
      const cap = a as unknown as CapabilityArtifact;

      const hasParent = !!cap.parentCapability && capIds.has(cap.parentCapability);
      const hasChildren = ctx.artifacts.some(
        (other) => other.kind === "capability" && (other as unknown as CapabilityArtifact).parentCapability === a.id
      );
      const isRealized = ctx.artifacts.some((other) =>
        other.relations?.some((r) => (r.type === "realizes" || r.type === "supports") && r.target === a.id)
      );

      if (!hasParent && !hasChildren && !isRealized) {
        results.push({
          path: a.id,
          message: `Capability "${a.id}" is orphaned — no parent, no children, no realizing systems`,
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
      if (a.kind !== "mission") continue;

      const hasSupport = ctx.artifacts.some((other) =>
        other.relations?.some((r) => (r.type === "supports" || r.type === "realizes") && r.target === a.id)
      );

      if (!hasSupport) {
        results.push({
          path: a.id,
          message: `Mission "${a.id}" has no supporting capabilities or systems`,
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
      if (a.kind !== "policy-objective") continue;
      const pol = a as unknown as PolicyObjectiveArtifact;

      const hasEnforcedBy = (pol.enforcedBy?.length ?? 0) > 0;
      const hasGovernedBy = ctx.artifacts.some((other) =>
        other.relations?.some((r) => r.type === "governedBy" && r.target === a.id)
      );

      if (!hasEnforcedBy && !hasGovernedBy) {
        results.push({
          path: a.id,
          message: `Policy objective "${a.id}" has no enforcing controls`,
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
      if (a.kind !== "control") continue;
      const ctrl = a as unknown as ControlArtifact;
      if (!ctrl.lastExecutedAt || !ctrl.frequency) continue;

      const maxInterval = frequencyMs[ctrl.frequency];
      if (!maxInterval) continue; // on-demand / event-triggered — skip

      const lastExec = new Date(ctrl.lastExecutedAt).getTime();
      if (isNaN(lastExec)) continue;

      if (now - lastExec > maxInterval) {
        results.push({
          path: a.id,
          message: `Control "${a.id}" last executed at ${ctrl.lastExecutedAt} — overdue for "${ctrl.frequency}" frequency`,
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
      if (a.kind !== "value-stream") continue;
      const vs = a as unknown as ValueStreamArtifact;
      if (!vs.stages) continue;

      const bottlenecks = vs.stages.filter((s) => s.bottleneck);
      for (const bn of bottlenecks) {
        results.push({
          path: a.id,
          message: `Value stream "${a.id}" stage "${bn.name}" is marked as a bottleneck`,
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
      if (a.kind !== "org-unit") continue;
      if (a.relations) {
        for (const r of a.relations) {
          if (r.type === "owns") ownedArtifacts.add(r.target);
        }
      }
    }

    for (const a of ctx.artifacts) {
      if (a.kind !== "application" && a.kind !== "service") continue;
      if (a.status !== "active" && a.status !== "shipped") continue;

      // Check if this system has significant relations (>= 3) indicating criticality
      const relationCount = (a.relations?.length ?? 0);
      const isTargeted = ctx.artifacts.some((other) =>
        other.relations?.some((r) => r.target === a.id)
      );

      if ((relationCount >= 3 || isTargeted) && !ownedArtifacts.has(a.id)) {
        results.push({
          path: a.id,
          message: `Active ${a.kind} "${a.id}" has significant relations but no org-unit ownership`,
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
      if (a.kind === "system-interface") {
        const iface = a as unknown as { endpoint?: string; url?: string };
        if (iface.endpoint) modeledUrls.add(iface.endpoint);
        if (iface.url) modeledUrls.add(iface.url);
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
      if (a.kind === "cloud-resource") {
        const cr = a as unknown as CloudResourceArtifact;
        modeledResources.add(a.id);
        modeledResources.add(a.title.toLowerCase());
        if (cr.resourceId) modeledResources.add(cr.resourceId);
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
      if (a.kind === "canonical-entity") {
        const ce = a as unknown as CanonicalEntityArtifact;
        const attrs = new Set<string>();
        for (const attr of ce.attributes ?? []) {
          attrs.add(attr.name);
        }
        entityAttrs.set(a.title.toLowerCase(), attrs);
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
      if (a.kind === "canonical-entity") {
        declaredNames.add(a.title.toLowerCase());
        declaredNames.add(a.id.toLowerCase());
      }
      if (a.kind === "data-store") {
        declaredNames.add(a.title.toLowerCase());
        declaredNames.add(a.id.toLowerCase());
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
      if (a.kind !== "quality-attribute") continue;
      const qa = a as unknown as { qualityRules?: Array<{ id: string }> };
      for (const rule of qa.qualityRules ?? []) {
        if (!enforcedIds.has(rule.id)) {
          results.push({
            path: a.id,
            message: `Quality rule "${rule.id}" on "${a.id}" is declared but no enforcement evidence found`,
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
      if (a.kind !== "baseline") continue;
      const bl = a as unknown as BaselineArtifact;
      for (const ref of bl.artifactRefs ?? []) {
        if (!ctx.artifactMap.has(ref)) {
          results.push({
            path: a.id,
            message: `Baseline "${a.id}" references artifact "${ref}" which does not exist`,
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
      if (a.kind !== "baseline") continue;
      const bl = a as unknown as BaselineArtifact;
      if (!bl.capturedAt) continue;
      const capturedDate = new Date(bl.capturedAt).getTime();
      if (!isNaN(capturedDate) && now - capturedDate > ninetyDays) {
        results.push({
          path: a.id,
          message: `Baseline "${a.id}" was captured more than 90 days ago (${bl.capturedAt})`,
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
      if (a.kind !== "target") continue;
      const tgt = a as unknown as TargetArtifact;
      for (const ref of tgt.artifactRefs ?? []) {
        const target = ctx.artifactMap.get(ref);
        if (!target) {
          results.push({
            path: a.id,
            message: `Target "${a.id}" references artifact "${ref}" which does not exist`,
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
      if (a.kind !== "target" || a.status === "retired") continue;
      const tgt = a as unknown as TargetArtifact;
      if (!tgt.effectiveBy) continue;
      const effectiveDate = new Date(tgt.effectiveBy).getTime();
      if (!isNaN(effectiveDate) && effectiveDate < now) {
        results.push({
          path: a.id,
          message: `Target "${a.id}" has expired (effectiveBy: ${tgt.effectiveBy})`,
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
      if (a.kind !== "transition-plan") continue;
      const plan = a as unknown as TransitionPlanArtifact;
      if (plan.baseline && !ctx.artifactMap.has(plan.baseline)) {
        results.push({
          path: a.id,
          message: `Transition plan "${a.id}" references baseline "${plan.baseline}" which does not exist`,
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
      if (a.kind !== "transition-plan") continue;
      const plan = a as unknown as TransitionPlanArtifact;
      if (plan.target && !ctx.artifactMap.has(plan.target)) {
        results.push({
          path: a.id,
          message: `Transition plan "${a.id}" references target "${plan.target}" which does not exist`,
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
      if (a.kind !== "transition-plan") continue;
      const plan = a as unknown as TransitionPlanArtifact;
      for (const ms of plan.milestones ?? []) {
        for (const deliverable of ms.deliverables ?? []) {
          const target = ctx.artifactMap.get(deliverable);
          if (target && target.status === "retired") {
            results.push({
              path: a.id,
              message: `Milestone "${ms.id}" in plan "${a.id}" delivers retired artifact "${deliverable}"`,
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
    const plans = ctx.artifacts.filter((a) => a.kind === "transition-plan") as unknown as TransitionPlanArtifact[];
    const referencedWaves = new Set<string>();
    for (const plan of plans) {
      if (plan.relations) {
        for (const rel of plan.relations) {
          if (rel.type === "generates") referencedWaves.add(rel.target);
        }
      }
    }
    // Also check waves that reference plans via transitionPlan field
    for (const a of ctx.artifacts) {
      if (a.kind !== "migration-wave") continue;
      const wave = a as unknown as MigrationWaveArtifact;
      if (wave.transitionPlan && ctx.artifactMap.has(wave.transitionPlan)) {
        referencedWaves.add(a.id);
      }
    }
    for (const a of ctx.artifacts) {
      if (a.kind !== "migration-wave") continue;
      if (!referencedWaves.has(a.id)) {
        results.push({
          path: a.id,
          message: `Migration wave "${a.id}" is not referenced by any transition plan`,
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
      if (a.kind !== "exception" || a.status === "retired") continue;
      const exc = a as unknown as ExceptionArtifact;
      if (!exc.expiresAt) continue;
      const expiryDate = new Date(exc.expiresAt).getTime();
      if (!isNaN(expiryDate) && expiryDate < now) {
        results.push({
          path: a.id,
          message: `Exception "${a.id}" has expired (expiresAt: ${exc.expiresAt})`,
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
      if (a.kind !== "exception") continue;
      const exc = a as unknown as ExceptionArtifact;
      const hasScope = (exc.scope?.artifactIds?.length ?? 0) > 0 ||
        (exc.scope?.rules?.length ?? 0) > 0 ||
        (exc.scope?.domains?.length ?? 0) > 0;
      if (!hasScope) {
        results.push({
          path: a.id,
          message: `Exception "${a.id}" has empty scope (would suppress everything)`,
          severity: "error",
          rule: "ea:exception/missing-scope",
        });
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
  // Resolver-dependent stubs (Phase 2F)
  unmodeledExternalDependency,
  unmodeledCloudResource,
  logicalPhysicalMismatch,
  storeUndeclaredEntity,
  qualityRuleNotEnforced,
];

/**
 * Run all EA drift rules against loaded artifacts.
 * Resolver-dependent rules are skipped unless `includeResolverRules` is true
 * (for future use when resolvers are available).
 */
export function evaluateEaDrift(
  artifacts: EaArtifactBase[],
  options?: { includeResolverRules?: boolean; resolverData?: EaResolverObservedState },
): EaDriftResult {
  const artifactMap = new Map<string, EaArtifactBase>();
  for (const a of artifacts) {
    artifactMap.set(a.id, a);
  }

  const ctx: EaDriftContext = { artifactMap, artifacts, resolverData: options?.resolverData };
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
  /** All loaded artifacts. */
  artifacts: EaArtifactBase[];
  /** Active exceptions for suppression. */
  exceptions?: ExceptionArtifact[];
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
  artifacts: EaArtifactBase[],
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
function inferDomainFromArtifact(artifactId: string, artifacts: EaArtifactBase[]): string {
  const artifact = artifacts.find((a) => a.id === artifactId);
  if (!artifact) return "unknown";
  return getDomainForKind(artifact.kind) ?? "unknown";
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
  exceptions: ExceptionArtifact[],
): EaDriftFinding[] {
  const now = Date.now();

  // Filter to active, non-expired exceptions
  const activeExceptions = exceptions.filter((exc) => {
    const expiresMs = new Date(exc.expiresAt).getTime();
    return !isNaN(expiresMs) && expiresMs > now;
  });

  return findings.map((f) => {
    for (const exc of activeExceptions) {
      const matchesArtifact =
        !exc.scope.artifactIds || exc.scope.artifactIds.length === 0 || exc.scope.artifactIds.includes(f.artifactId);
      const matchesRule =
        !exc.scope.rules || exc.scope.rules.length === 0 || exc.scope.rules.includes(f.rule);
      const matchesDomain =
        !exc.scope.domains || exc.scope.domains.length === 0 || exc.scope.domains.includes(f.domain as any);

      if (matchesArtifact && matchesRule && matchesDomain) {
        return { ...f, suppressed: true, suppressedBy: exc.id };
      }
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
