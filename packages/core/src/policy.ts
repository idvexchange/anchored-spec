/**
 * Anchored Spec — Workflow Policy Engine
 *
 * Path-based rule matching, trivial exemption filtering, and workflow variant resolution.
 * This is the enforcement engine that answers: "Does this file change require a change record?"
 */

import { minimatch } from "minimatch";
import type {
  WorkflowPolicy,
  ChangeRequiredRule,
  PolicyMatchResult,
  PolicyEvaluationResult,
  Change,
  ChangeType,
  WorkflowVariant,
} from "./types.js";

// ─── Path Matching ─────────────────────────────────────────────────────────────

/**
 * Check if a path matches any pattern in a glob list.
 */
function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(path, pattern));
}

/**
 * Check if a path is trivially exempt from governance.
 */
export function isTrivialPath(
  path: string,
  policy: WorkflowPolicy
): boolean {
  return matchesAny(path, policy.trivialExemptions);
}

/**
 * Find all rules that match a given path.
 */
export function matchRules(
  path: string,
  rules: ChangeRequiredRule[]
): ChangeRequiredRule[] {
  return rules.filter((rule) => {
    const included = matchesAny(path, rule.include);
    const excluded = rule.exclude ? matchesAny(path, rule.exclude) : false;
    return included && !excluded;
  });
}

// ─── Policy Evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a list of changed paths against the workflow policy.
 * Returns which paths are trivial, which require change records, and which rules matched.
 */
export function evaluatePolicy(
  changedPaths: string[],
  policy: WorkflowPolicy
): PolicyEvaluationResult {
  const results: PolicyMatchResult[] = [];
  const allMatchedRuleIds = new Set<string>();

  for (const path of changedPaths) {
    const trivial = isTrivialPath(path, policy);
    if (trivial) {
      results.push({
        path,
        matchedRules: [],
        isTrivial: true,
        requiresChange: false,
      });
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

// ─── Change Coverage Check ─────────────────────────────────────────────────────

/**
 * Check if a changed path is covered by an active change record's scope.
 */
export function isPathCoveredByChange(
  path: string,
  change: Change
): boolean {
  const included = matchesAny(path, change.scope.include);
  const excluded = change.scope.exclude
    ? matchesAny(path, change.scope.exclude)
    : false;
  return included && !excluded;
}

/**
 * Validate that all governed paths are covered by at least one active change.
 * This is the core workflow-entry enforcement check.
 */
export function validateWorkflowEntry(
  changedPaths: string[],
  policy: WorkflowPolicy,
  activeChanges: Change[]
): { valid: boolean; uncoveredPaths: string[]; details: PolicyEvaluationResult } {
  const evaluation = evaluatePolicy(changedPaths, policy);
  const uncoveredPaths: string[] = [];

  for (const result of evaluation.paths) {
    if (!result.requiresChange) continue;

    const covered = activeChanges.some(
      (change) =>
        change.status === "active" && isPathCoveredByChange(result.path, change)
    );

    if (!covered) {
      uncoveredPaths.push(result.path);
    }
  }

  return {
    valid: uncoveredPaths.length === 0,
    uncoveredPaths,
    details: evaluation,
  };
}

// ─── Workflow Variant Resolution ───────────────────────────────────────────────

/**
 * Resolve the default workflow variant for a change type.
 */
export function resolveWorkflowVariant(
  changeType: ChangeType,
  policy: WorkflowPolicy
): WorkflowVariant | null {
  return (
    policy.workflowVariants.find((v) =>
      v.defaultTypes.includes(changeType)
    ) ?? null
  );
}

/**
 * Check if a change qualifies as a chore (lightweight workflow).
 */
export function isChoreEligible(
  policy: WorkflowPolicy
): { eligible: boolean; conditions: string[]; escalationRule?: string } {
  const eligibility = policy.choreEligibility;
  if (!eligibility) {
    return { eligible: false, conditions: [] };
  }

  return {
    eligible: true,
    conditions: eligibility.conditions ?? [],
    escalationRule: eligibility.escalationRule,
  };
}
