/**
 * Anchored Spec — EA Workflow Policy Engine
 *
 * EA-native wrapper around the core policy engine. Loads workflow policy
 * from EaRoot (JSON or YAML), evaluates path-based rules, validates
 * workflow entry against active change entities.
 *
 * This is the EA EA-native workflow policy engine and src/core/check.ts.
 */

import { minimatch } from "minimatch";
import type { EaRoot } from "./loader.js";
import type { BackstageEntity } from "./backstage/types.js";
import { getEntityStatus, getSpecField } from "./backstage/accessors.js";

// ─── Policy Types ───────────────────────────────────────────────────────────────

export interface EaChangeRequiredRule {
  id: string;
  description?: string;
  include: string[];
  exclude?: string[];
  requiredEntities?: string[];
  requiredDriftChecks?: string[];
  commands?: string[];
}

export interface EaWorkflowVariant {
  id: string;
  name: string;
  defaultTypes: string[];
  requiredSchemas: string[];
  skipSkillSequence?: boolean;
  verificationFocus?: string[];
}

export interface EaLifecycleRules {
  plannedToActiveRequiresChange?: boolean;
  activeToShippedRequiresCoverage?: boolean;
  deprecatedRequiresReason?: boolean;
}

export interface EaWorkflowPolicy {
  workflowVariants: EaWorkflowVariant[];
  changeRequiredRules: EaChangeRequiredRule[];
  trivialExemptions: string[];
  choreEligibility?: {
    conditions?: string[];
    escalationRule?: string;
  };
  lifecycleRules: EaLifecycleRules;
}

export interface EaPolicyMatchResult {
  path: string;
  matchedRules: EaChangeRequiredRule[];
  isTrivial: boolean;
  requiresChange: boolean;
}

export interface EaPolicyEvaluationResult {
  paths: EaPolicyMatchResult[];
  summary: {
    totalPaths: number;
    trivialPaths: number;
    governedPaths: number;
    ungoverned: number;
    matchedRules: string[];
  };
}

export interface EaCheckResult {
  valid: boolean;
  paths: string[];
  evaluation: EaPolicyEvaluationResult["summary"];
  uncoveredPaths: string[];
}

// ─── Path Matching ──────────────────────────────────────────────────────────────

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(path, pattern));
}

/** Check if a path is trivially exempt from governance. */
export function isTrivialPath(path: string, policy: EaWorkflowPolicy): boolean {
  return matchesAny(path, policy.trivialExemptions);
}

/** Find all rules that match a given path. */
export function matchRules(
  path: string,
  rules: EaChangeRequiredRule[],
): EaChangeRequiredRule[] {
  return rules.filter((rule) => {
    const included = matchesAny(path, rule.include);
    const excluded = rule.exclude ? matchesAny(path, rule.exclude) : false;
    return included && !excluded;
  });
}

// ─── Policy Evaluation ──────────────────────────────────────────────────────────

/** Evaluate changed paths against the workflow policy. */
export function evaluateEaPolicy(
  changedPaths: string[],
  policy: EaWorkflowPolicy,
): EaPolicyEvaluationResult {
  const results: EaPolicyMatchResult[] = [];
  const allMatchedRuleIds = new Set<string>();

  for (const path of changedPaths) {
    const trivial = isTrivialPath(path, policy);
    if (trivial) {
      results.push({ path, matchedRules: [], isTrivial: true, requiresChange: false });
      continue;
    }

    const matched = matchRules(path, policy.changeRequiredRules);
    for (const rule of matched) {
      allMatchedRuleIds.add(rule.id);
    }

    results.push({
      path,
      matchedRules: matched,
      isTrivial: false,
      requiresChange: matched.length > 0,
    });
  }

  const governedPaths = results.filter((r) => r.requiresChange).length;
  const trivialPaths = results.filter((r) => r.isTrivial).length;

  return {
    paths: results,
    summary: {
      totalPaths: changedPaths.length,
      trivialPaths,
      governedPaths,
      ungoverned: changedPaths.length - trivialPaths - governedPaths,
      matchedRules: [...allMatchedRuleIds],
    },
  };
}

// ─── Change Coverage ────────────────────────────────────────────────────────────

/** Check if a path is covered by an active change entity's scope. */
export function isPathCoveredByChangeEntity(
  path: string,
  entity: BackstageEntity,
): boolean {
  const scope = getSpecField<{
    include?: string[];
    exclude?: string[];
  }>(entity, "scope");
  const typedScope = scope as
    | { include?: string[]; exclude?: string[] }
    | undefined;
  if (!typedScope?.include) return false;

  const included = matchesAny(path, typedScope.include);
  const excluded = typedScope.exclude ? matchesAny(path, typedScope.exclude) : false;
  return included && !excluded;
}

/**
 * Check whether governed paths are covered by active change entities.
 */
export function checkEaPaths(
  changedPaths: string[],
  policy: EaWorkflowPolicy,
  activeChanges: BackstageEntity[],
): EaCheckResult {
  const evaluation = evaluateEaPolicy(changedPaths, policy);
  const uncoveredPaths: string[] = [];

  for (const result of evaluation.paths) {
    if (!result.requiresChange) continue;
    const covered = activeChanges.some(
      (entity) => getEntityStatus(entity) === "active" && isPathCoveredByChangeEntity(result.path, entity),
    );
    if (!covered) {
      uncoveredPaths.push(result.path);
    }
  }

  return {
    valid: uncoveredPaths.length === 0,
    paths: changedPaths,
    evaluation: evaluation.summary,
    uncoveredPaths,
  };
}

// ─── Workflow Variant Resolution ────────────────────────────────────────────────

/** Resolve the default workflow variant for a change type. */
export function resolveEaWorkflowVariant(
  changeType: string,
  policy: EaWorkflowPolicy,
): EaWorkflowVariant | null {
  return policy.workflowVariants.find((v) => v.defaultTypes.includes(changeType)) ?? null;
}

/** Check chore eligibility. */
export function isEaChoreEligible(
  policy: EaWorkflowPolicy,
): { eligible: boolean; conditions: string[]; escalationRule?: string } {
  const eligibility = policy.choreEligibility;
  if (!eligibility) return { eligible: false, conditions: [] };
  return {
    eligible: true,
    conditions: eligibility.conditions ?? [],
    escalationRule: eligibility.escalationRule,
  };
}

// ─── Policy Loading ─────────────────────────────────────────────────────────────

/** Load and parse workflow policy from EaRoot. Returns null if not found. */
export function loadEaWorkflowPolicy(eaRoot: EaRoot): EaWorkflowPolicy | null {
  const raw = eaRoot.loadPolicy();
  if (!raw) return null;
  return raw as unknown as EaWorkflowPolicy;
}
