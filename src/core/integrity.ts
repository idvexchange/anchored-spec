/**
 * Anchored Spec — Integrity Checks
 *
 * Cross-reference validation, lifecycle rule enforcement, and
 * dependency analysis for spec artifacts. Extracted from verify
 * for programmatic reuse.
 */

import type {
  Requirement,
  Change,
  ValidationError,
} from "./types.js";

// ─── Cross-Reference Checks ────────────────────────────────────────────────────

export function checkCrossReferences(
  requirements: Requirement[],
  changes: Change[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check: CHG references REQ → REQ should exist
  for (const chg of changes) {
    if (chg.status !== "active") continue;
    for (const reqId of chg.requirements ?? []) {
      const req = requirements.find((r) => r.id === reqId);
      if (!req) {
        errors.push({
          path: chg.id,
          message: `References non-existent requirement ${reqId}`,
          severity: "warning",
          rule: "cross-ref:change-to-requirement",
        });
      }
    }
  }

  // Check: Active REQ with activeChanges → CHG should exist and be active
  for (const req of requirements) {
    for (const chgId of req.implementation?.activeChanges ?? []) {
      const chg = changes.find((c) => c.id === chgId);
      if (!chg) {
        errors.push({
          path: req.id,
          message: `References non-existent change ${chgId}`,
          severity: "warning",
          rule: "cross-ref:requirement-to-change",
        });
      }
    }
  }

  // Bidirectional consistency: if CHG-X references REQ-Y,
  // REQ-Y.implementation.activeChanges should include CHG-X
  for (const chg of changes) {
    if (chg.status !== "active") continue;
    for (const reqId of chg.requirements ?? []) {
      const req = requirements.find((r) => r.id === reqId);
      if (!req) continue;
      const activeChanges = req.implementation?.activeChanges ?? [];
      if (!activeChanges.includes(chg.id)) {
        errors.push({
          path: reqId,
          message: `${chg.id} references this requirement, but it is not listed in implementation.activeChanges`,
          severity: "warning",
          rule: "cross-ref:bidirectional-consistency",
          suggestion: `Add "${chg.id}" to ${reqId}'s implementation.activeChanges array`,
        });
      }
    }
  }

  // Reverse: if REQ-Y.activeChanges includes CHG-X,
  // CHG-X.requirements should include REQ-Y
  for (const req of requirements) {
    for (const chgId of req.implementation?.activeChanges ?? []) {
      const chg = changes.find((c) => c.id === chgId);
      if (!chg) continue;
      const chgReqs = chg.requirements ?? [];
      if (!chgReqs.includes(req.id)) {
        errors.push({
          path: chgId,
          message: `${req.id} lists this change in activeChanges, but the change does not reference it in requirements`,
          severity: "warning",
          rule: "cross-ref:bidirectional-consistency",
          suggestion: `Add "${req.id}" to ${chgId}'s requirements array`,
        });
      }
    }
  }

  return errors;
}

// ─── Lifecycle Rule Checks ─────────────────────────────────────────────────────

export interface LifecyclePolicy {
  lifecycleRules: {
    plannedToActiveRequiresChange?: boolean;
    activeToShippedRequiresCoverage?: boolean;
    deprecatedRequiresReason?: boolean;
  };
}

export function checkLifecycleRules(
  requirements: Requirement[],
  changes: Change[],
  policy: LifecyclePolicy,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const rules = policy.lifecycleRules;

  for (const req of requirements) {
    // Active requires a change
    if (rules.plannedToActiveRequiresChange && req.status === "active") {
      const hasActiveChange =
        (req.implementation?.activeChanges?.length ?? 0) > 0 ||
        changes.some((c) => c.requirements?.includes(req.id) && c.status === "active");
      if (!hasActiveChange) {
        errors.push({
          path: req.id,
          message: `Active requirement has no active change record`,
          severity: "error",
          rule: "lifecycle:active-requires-change",
          suggestion: `Run 'anchored-spec create change --type feature' and add ${req.id} to its requirements array`,
        });
      }
    }

    // Shipped requires coverage
    if (rules.activeToShippedRequiresCoverage && req.status === "shipped") {
      if (req.verification?.coverageStatus === "none" || !req.verification?.coverageStatus) {
        errors.push({
          path: req.id,
          message: `Shipped requirement has no test coverage`,
          severity: "error",
          rule: "lifecycle:shipped-requires-coverage",
          suggestion: `Set verification.coverageStatus to 'partial' or 'full', or add testRefs entries`,
        });
      }
    }

    // Deprecated requires reason
    if (rules.deprecatedRequiresReason && req.status === "deprecated") {
      if (!req.statusReason && !req.supersededBy) {
        errors.push({
          path: req.id,
          message: `Deprecated requirement has no reason or replacement`,
          severity: "error",
          rule: "lifecycle:deprecated-requires-reason",
          suggestion: `Add a 'statusReason' explaining why it was deprecated, or set 'supersededBy' to the replacement requirement ID`,
        });
      }
    }
  }

  return errors;
}

// ─── Dependency Checks ─────────────────────────────────────────────────────────

export function checkDependencies(requirements: Requirement[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const reqMap = new Map(requirements.map((r) => [r.id, r]));

  for (const req of requirements) {
    for (const depId of req.dependsOn ?? []) {
      if (!reqMap.has(depId)) {
        errors.push({
          path: req.id,
          message: `Depends on non-existent requirement "${depId}"`,
          severity: "error",
          rule: "dependency:missing-ref",
        });
      }
    }
  }

  const cycles = detectCycles(requirements);
  for (const cycle of cycles) {
    errors.push({
      path: cycle[0]!,
      message: `Circular dependency detected: ${cycle.join(" → ")} → ${cycle[0]}`,
      severity: "error",
      rule: "dependency:cycle",
    });
  }

  for (const req of requirements) {
    if (req.status !== "active" && req.status !== "shipped") continue;
    for (const depId of req.dependsOn ?? []) {
      const dep = reqMap.get(depId);
      if (!dep) continue;
      if (dep.status === "draft" || dep.status === "deferred") {
        errors.push({
          path: req.id,
          message: `Active/shipped requirement depends on ${dep.status} requirement "${depId}"`,
          severity: "warning",
          rule: "dependency:blocked",
        });
      }
    }
  }

  return errors;
}

/**
 * Detect circular dependencies. Returns deduplicated cycles.
 */
export function detectCycles(requirements: Requirement[]): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];
  const reqMap = new Map(requirements.map((r) => [r.id, r]));
  const seen = new Set<string>(); // dedup key

  function dfs(id: string): void {
    if (inStack.has(id)) {
      const cycleStart = path.indexOf(id);
      if (cycleStart !== -1) {
        const cycle = path.slice(cycleStart);
        // Normalize: rotate so the smallest ID is first
        const minIdx = cycle.indexOf(cycle.slice().sort()[0]!);
        const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
        const key = normalized.join(",");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(normalized);
        }
      }
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    inStack.add(id);
    path.push(id);
    const req = reqMap.get(id);
    if (req) {
      for (const depId of req.dependsOn ?? []) {
        dfs(depId);
      }
    }
    path.pop();
    inStack.delete(id);
  }

  for (const req of requirements) {
    dfs(req.id);
  }
  return cycles;
}
