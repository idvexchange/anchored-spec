/**
 * Anchored Spec — Check (Programmatic API)
 *
 * Evaluates whether changed paths comply with the workflow policy.
 * This is the programmatic equivalent of `anchored-spec check --paths`.
 */

import type { Change, WorkflowPolicy, PolicyEvaluationResult } from "./types.js";
import { evaluatePolicy, isPathCoveredByChange } from "./policy.js";

export interface CheckResult {
  valid: boolean;
  paths: string[];
  evaluation: PolicyEvaluationResult["summary"];
  uncoveredPaths: string[];
}

/**
 * Check whether a list of changed paths complies with the workflow policy.
 * Governed paths must be covered by at least one active change.
 */
export function checkPaths(
  changedPaths: string[],
  policy: WorkflowPolicy,
  activeChanges: Change[],
): CheckResult {
  const evaluation = evaluatePolicy(changedPaths, policy);
  const uncoveredPaths: string[] = [];

  for (const result of evaluation.paths) {
    if (!result.requiresChange) continue;
    const covered = activeChanges.some(
      (c) => c.status === "active" && isPathCoveredByChange(result.path, c),
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
