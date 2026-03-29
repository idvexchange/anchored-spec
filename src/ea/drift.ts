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

// ─── Resolver-Dependent Rules (stubs for Phase 2F) ──────────────────────────────

/**
 * ea:drift:unmodeled-external-dependency (requires OpenAPI resolver)
 * ea:drift:unmodeled-cloud-resource (requires Terraform/K8s resolver)
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

// ─── Rule Registry & Runner ─────────────────────────────────────────────────────

/** All registered EA drift rules. */
export const EA_DRIFT_RULES: EaDriftRule[] = [
  consumerContractVersionMismatch,
  technologyStandardViolation,
  deprecatedVersionInUse,
  environmentPromotionGap,
  unmodeledExternalDependency,
  unmodeledCloudResource,
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
