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
} from "./types.js";
import type { EaValidationError } from "./validate.js";

// ─── Drift Rule Types ───────────────────────────────────────────────────────────

export interface EaDriftContext {
  /** All loaded artifacts indexed by ID. */
  artifactMap: Map<string, EaArtifactBase>;
  /** All loaded artifacts as an array. */
  artifacts: EaArtifactBase[];
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
 * ea:drift:consumer-contract-version-mismatch
 *
 * Detects when a consumer declares a contractVersion that doesn't match
 * any api-contract artifact's schemaVersion.
 */
const consumerContractVersionMismatch: EaDriftRule = {
  id: "ea:drift:consumer-contract-version-mismatch",
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
 * ea:drift:technology-standard-violation
 *
 * Detects when a cloud-resource uses a technology not covered by any active
 * technology standard.
 */
const technologyStandardViolation: EaDriftRule = {
  id: "ea:drift:technology-standard-violation",
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
 * ea:drift:deprecated-version-in-use
 *
 * Detects when a cloud resource uses a version listed in a technology standard's
 * deprecatedVersions.
 */
const deprecatedVersionInUse: EaDriftRule = {
  id: "ea:drift:deprecated-version-in-use",
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
 * ea:drift:environment-promotion-gap
 *
 * Detects when an environment's promotesFrom or promotesTo references
 * a non-existent environment.
 */
const environmentPromotionGap: EaDriftRule = {
  id: "ea:drift:environment-promotion-gap",
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
 * ea:drift:lineage-stale
 *
 * Detects when a lineage artifact references a source or destination
 * that is retired or doesn't exist.
 */
const lineageStale: EaDriftRule = {
  id: "ea:drift:lineage-stale",
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
 * ea:drift:orphan-store
 *
 * Detects data stores with no uses, lineageFrom, or lineageTo edges.
 */
const orphanStore: EaDriftRule = {
  id: "ea:drift:orphan-store",
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
 * ea:drift:shared-store-no-steward
 *
 * Detects shared data stores without a master-data-domain or steward.
 */
const sharedStoreNoSteward: EaDriftRule = {
  id: "ea:drift:shared-store-no-steward",
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
 * ea:drift:product-missing-sla
 *
 * Detects active data products without an SLA definition.
 */
const productMissingSla: EaDriftRule = {
  id: "ea:drift:product-missing-sla",
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
 * ea:drift:product-missing-quality-rules
 *
 * Detects active data products with no quality rules.
 */
const productMissingQualityRules: EaDriftRule = {
  id: "ea:drift:product-missing-quality-rules",
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

// ─── Resolver-Dependent Rules (stubs for Phase 2F) ──────────────────────────────

/**
 * ea:drift:unmodeled-external-dependency (requires OpenAPI resolver)
 * ea:drift:unmodeled-cloud-resource (requires Terraform/K8s resolver)
 * ea:drift:logical-physical-mismatch (requires DDL resolver)
 * ea:drift:store-undeclared-entity (requires DDL resolver)
 * ea:drift:quality-rule-not-enforced (requires dbt/GE resolver)
 *
 * These rules need resolver data and will be implemented in Phase 2F.
 */
const unmodeledExternalDependency: EaDriftRule = {
  id: "ea:drift:unmodeled-external-dependency",
  severity: "warning",
  description:
    "Application consumes external API not modeled as system-interface (requires resolver)",
  requiresResolver: true,
  evaluate() {
    return [];
  },
};

const unmodeledCloudResource: EaDriftRule = {
  id: "ea:drift:unmodeled-cloud-resource",
  severity: "warning",
  description:
    "Cloud resource found by resolver but not modeled (requires resolver)",
  requiresResolver: true,
  evaluate() {
    return [];
  },
};

const logicalPhysicalMismatch: EaDriftRule = {
  id: "ea:drift:logical-physical-mismatch",
  severity: "error",
  description:
    "Physical schema diverges from logical data model attributes (requires DDL resolver)",
  requiresResolver: true,
  evaluate() {
    return [];
  },
};

const storeUndeclaredEntity: EaDriftRule = {
  id: "ea:drift:store-undeclared-entity",
  severity: "warning",
  description:
    "Data store contains tables/collections not declared in any model (requires DDL resolver)",
  requiresResolver: true,
  evaluate() {
    return [];
  },
};

const qualityRuleNotEnforced: EaDriftRule = {
  id: "ea:drift:quality-rule-not-enforced",
  severity: "warning",
  description:
    "Data quality rule declared but no execution evidence found (requires dbt/GE resolver)",
  requiresResolver: true,
  evaluate() {
    return [];
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
  options?: { includeResolverRules?: boolean },
): EaDriftResult {
  const artifactMap = new Map<string, EaArtifactBase>();
  for (const a of artifacts) {
    artifactMap.set(a.id, a);
  }

  const ctx: EaDriftContext = { artifactMap, artifacts };
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
