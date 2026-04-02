/**
 * EA Version Policy Enforcement
 *
 * Declares compatibility policies per-artifact, per-schema, or globally,
 * then enforces them against compatibility assessments from the compat module.
 *
 * Design reference: plan.md §S4
 */

import type { CompatibilityReport, CompatibilityLevel, CompatibilityReason } from "./compat.js";
import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityId,
  getEntityDescriptor,
  getEntitySchema,
  getSpec,
} from "./backstage/accessors.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Compatibility mode for an artifact or group. */
export type CompatibilityMode = "backward-only" | "full" | "breaking-allowed" | "frozen";

/** Policy for a single artifact or group. */
export interface VersionPolicy {
  compatibility: CompatibilityMode;
  approvers?: string[];
  deprecationWindow?: string; // duration: "30d", "90d", "6m"
}

/** Global version policy config (from .anchored-spec/config.json). */
export interface VersionPolicyConfig {
  defaultCompatibility?: CompatibilityMode;
  perSchema?: Record<string, Partial<VersionPolicy>>;
  perDomain?: Record<string, Partial<VersionPolicy>>;
}

/** A single policy violation. */
export interface PolicyViolation {
  artifactId: string;
  kind: string;
  schema: string;
  domain: string;
  policy: VersionPolicy;
  compatLevel: CompatibilityLevel;
  reasons: CompatibilityReason[];
  message: string;
}

/** Full policy enforcement report. */
export interface PolicyEnforcementReport {
  generatedAt: string;
  baseRef: string;
  headRef: string;
  passed: boolean;
  violations: PolicyViolation[];
  summary: {
    artifactsChecked: number;
    violations: number;
    byPolicy: Record<CompatibilityMode, number>;
  };
  compatReport: CompatibilityReport;
}

// ─── Default Policy ─────────────────────────────────────────────────────────────

const DEFAULT_POLICY: VersionPolicy = {
  compatibility: "breaking-allowed",
};

// ─── Policy Resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the effective version policy for an artifact.
 * Priority: artifact-level > schema-level > domain-level > global default > breaking-allowed
 */
export function resolveVersionPolicy(
  entity: BackstageEntity,
  config?: VersionPolicyConfig,
): VersionPolicy {
  const entityPolicy = getSpec(entity).versionPolicy as Partial<VersionPolicy> | undefined;
  if (entityPolicy?.compatibility) {
    return {
      ...DEFAULT_POLICY,
      ...entityPolicy,
      compatibility: entityPolicy.compatibility,
    };
  }

  if (!config) return DEFAULT_POLICY;

  // 2. Schema-level
  const schemaPolicy = config.perSchema?.[getEntitySchema(entity)];
  if (schemaPolicy?.compatibility) {
    return {
      ...DEFAULT_POLICY,
      ...schemaPolicy,
      compatibility: schemaPolicy.compatibility,
    };
  }

  // 3. Domain-level
  const domain = getEntityDescriptor(entity)?.domain ?? "unknown";
  const domainPolicy = config.perDomain?.[domain];
  if (domainPolicy?.compatibility) {
    return {
      ...DEFAULT_POLICY,
      ...domainPolicy,
      compatibility: domainPolicy.compatibility,
    };
  }

  // 4. Global default
  if (config.defaultCompatibility) {
    return {
      ...DEFAULT_POLICY,
      compatibility: config.defaultCompatibility,
    };
  }

  return DEFAULT_POLICY;
}

// ─── Policy Enforcement ─────────────────────────────────────────────────────────

/**
 * Check if a compatibility level violates a policy.
 * For frozen: any change (including metadata-only) is a violation.
 */
function violatesPolicy(
  compatLevel: CompatibilityLevel,
  mode: CompatibilityMode,
  hasChanges: boolean,
): boolean {
  switch (mode) {
    case "frozen":
      // Any change is a violation, even metadata-only (level "none")
      return hasChanges;
    case "full":
      return compatLevel === "breaking" || compatLevel === "ambiguous";
    case "backward-only":
      return compatLevel === "breaking";
    case "breaking-allowed":
      return false;
  }
}

/**
 * Enforce version policies against a compatibility report.
 */
export function enforceVersionPolicies(
  compatReport: CompatibilityReport,
  entities: { base: BackstageEntity[]; head: BackstageEntity[] },
  config?: VersionPolicyConfig,
): PolicyEnforcementReport {
  const headMap = new Map(entities.head.map((entity) => [getEntityId(entity), entity]));
  const baseMap = new Map(entities.base.map((entity) => [getEntityId(entity), entity]));
  const violations: PolicyViolation[] = [];

  const byPolicy: Record<CompatibilityMode, number> = {
    "backward-only": 0,
    "full": 0,
    "breaking-allowed": 0,
    "frozen": 0,
  };

  for (const assessment of compatReport.assessments) {
    // Resolve policy from the head artifact (or base if removed)
    const entity = headMap.get(assessment.artifactId) ?? baseMap.get(assessment.artifactId);
    if (!entity) continue;

    const policy = resolveVersionPolicy(entity, config);
    byPolicy[policy.compatibility]++;

    if (violatesPolicy(assessment.level, policy.compatibility, true)) {
      const breakingReasons = assessment.reasons.filter((r) =>
        isViolatingReason(r.level, policy.compatibility),
      );

      violations.push({
        artifactId: assessment.artifactId,
        kind: assessment.kind,
        schema: assessment.schema,
        domain: assessment.domain,
        policy,
        compatLevel: assessment.level,
        reasons: breakingReasons,
        message: buildViolationMessage(assessment.artifactId, assessment.level, policy),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    baseRef: compatReport.baseRef,
    headRef: compatReport.headRef,
    passed: violations.length === 0,
    violations,
    summary: {
      artifactsChecked: compatReport.assessments.length,
      violations: violations.length,
      byPolicy,
    },
    compatReport,
  };
}

function isViolatingReason(level: CompatibilityLevel, mode: CompatibilityMode): boolean {
  switch (mode) {
    case "frozen": return true; // all reasons are violations for frozen
    case "full": return level === "breaking" || level === "ambiguous";
    case "backward-only": return level === "breaking";
    default: return false;
  }
}

function buildViolationMessage(
  artifactId: string,
  compatLevel: CompatibilityLevel,
  policy: VersionPolicy,
): string {
  return `${artifactId}: ${compatLevel} change violates ${policy.compatibility} policy`;
}

// ─── Rendering ──────────────────────────────────────────────────────────────────

/** One-line policy enforcement summary. */
export function renderPolicySummary(report: PolicyEnforcementReport): string {
  if (report.passed) {
    return `PASSED: ${report.summary.artifactsChecked} artifacts checked, 0 violations`;
  }
  return `FAILED: ${report.summary.violations} violation(s) across ${report.summary.artifactsChecked} artifacts`;
}

/** Full markdown policy enforcement report. */
export function renderPolicyMarkdown(report: PolicyEnforcementReport): string {
  const lines: string[] = [];
  const icon = report.passed ? "✅" : "⛔";

  lines.push(`# Version Policy Enforcement: ${report.baseRef}..${report.headRef}`);
  lines.push("");
  lines.push(`## ${icon} ${renderPolicySummary(report)}`);
  lines.push("");

  // Policy distribution
  const policyParts: string[] = [];
  for (const [mode, count] of Object.entries(report.summary.byPolicy)) {
    if (count > 0) policyParts.push(`${count} ${mode}`);
  }
  if (policyParts.length > 0) {
    lines.push(`**Policy distribution:** ${policyParts.join(", ")}`);
    lines.push("");
  }

  if (report.violations.length > 0) {
    lines.push("## Violations");
    lines.push("");
    lines.push("| Artifact | Kind | Schema | Domain | Compat Level | Policy | Reason |");
    lines.push("|----------|------|--------|--------|--------------|--------|--------|");
    for (const v of report.violations) {
      const reason = v.reasons.length > 0
        ? v.reasons.map((r) => r.message).join("; ")
        : v.message;
      lines.push(
        `| ${v.artifactId} | ${v.kind} | ${v.schema} | ${v.domain} | ${v.compatLevel} | ${v.policy.compatibility} | ${reason} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
