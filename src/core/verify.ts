/**
 * Anchored Spec — Verification Engine
 *
 * Pure library function that runs all spec validation checks.
 * No chalk, no process.exit — returns structured results.
 * Used by both the CLI verify command and the programmatic API.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  validateRequirement,
  validateChange,
  validateDecision,
  validateWorkflowPolicy,
  checkFilePaths,
} from "./validate.js";
import { checkCrossReferences, checkLifecycleRules, checkDependencies } from "./integrity.js";
import { checkTestLinking } from "./test-linking.js";
import { validateEvidence } from "./evidence.js";
import { SpecRoot } from "./loader.js";
import type { ValidationError } from "./types.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface VerificationOptions {
  strict?: boolean;
  ruleOverrides?: Record<string, "error" | "warn" | "off">;
}

export interface VerificationSummary {
  totalChecks: number;
  passed: number;
  warnings: number;
  errors: number;
  artifacts: {
    requirements: number;
    changes: number;
    decisions: number;
  };
}

export interface VerificationResult {
  passed: boolean;
  summary: VerificationSummary;
  findings: ValidationError[];
}

// ─── Rule Severity Application ─────────────────────────────────────────────────

function applyRuleOverrides(
  findings: ValidationError[],
  overrides: Record<string, "error" | "warn" | "off">,
  strict: boolean,
): ValidationError[] {
  const result: ValidationError[] = [];
  for (const f of findings) {
    const override = overrides[f.rule];
    if (override === "off") continue;
    if (override === "warn") {
      result.push({ ...f, severity: "warning" });
    } else if (override === "error") {
      result.push({ ...f, severity: "error" });
    } else {
      result.push(f);
    }
  }
  if (strict) {
    return result.map((f) => (f.severity === "warning" ? { ...f, severity: "error" } : f));
  }
  return result;
}

// ─── Main Verification Engine ──────────────────────────────────────────────────

/**
 * Run all spec validation checks and return structured results.
 * Pure function — no side effects, no chalk, no process.exit.
 */
export async function runAllChecks(
  spec: SpecRoot,
  options?: VerificationOptions,
): Promise<VerificationResult> {
  const config = spec.config;
  const cwd = spec.projectRoot;
  const strict = options?.strict ?? false;
  const configOverrides = config.quality?.rules ?? {};
  const ruleOverrides = { ...configOverrides, ...options?.ruleOverrides };

  let totalChecks = 0;
  let passedChecks = 0;
  const allFindings: ValidationError[] = [];

  // ─── 1. Validate Requirements ───────────────────────────────────────────

  const requirements = spec.loadRequirements();
  if (requirements.length > 0) {
    for (const req of requirements) {
      totalChecks++;
      const result = validateRequirement(req);
      if (result.valid && result.warnings.length === 0) {
        passedChecks++;
      } else {
        for (const err of result.errors) {
          allFindings.push({ ...err, path: `${req.id}${err.path}` });
        }
        for (const warn of result.warnings) {
          allFindings.push({ ...warn, path: `${req.id}${warn.path}` });
        }
        if (result.valid) passedChecks++;
      }
    }
  }

  // ─── 2. Validate Changes ────────────────────────────────────────────────

  const changes = spec.loadChanges();
  if (changes.length > 0) {
    for (const chg of changes) {
      totalChecks++;
      const result = validateChange(chg);
      if (result.valid) {
        passedChecks++;
      } else {
        for (const err of result.errors) {
          allFindings.push({ ...err, path: `${chg.id}${err.path}` });
        }
      }
    }
  }

  // ─── 3. Validate Decisions ──────────────────────────────────────────────

  const decisions = spec.loadDecisions();
  if (decisions.length > 0) {
    for (const dec of decisions) {
      totalChecks++;
      const result = validateDecision(dec);
      if (result.valid) {
        passedChecks++;
      } else {
        for (const err of result.errors) {
          allFindings.push({ ...err, path: `${dec.id}${err.path}` });
        }
      }
    }
  }

  // ─── 4. Validate Workflow Policy ────────────────────────────────────────

  const policy = spec.loadWorkflowPolicy();
  if (policy) {
    totalChecks++;
    const result = validateWorkflowPolicy(policy);
    if (result.valid) {
      passedChecks++;
    } else {
      for (const err of result.errors) {
        allFindings.push({ ...err, path: `workflow-policy${err.path}` });
      }
    }
  }

  // ─── 5. Cross-Reference Integrity ───────────────────────────────────────

  if (requirements.length > 0 && changes.length > 0) {
    totalChecks++;
    const crossRefErrors = checkCrossReferences(requirements, changes);
    if (crossRefErrors.length === 0) {
      passedChecks++;
    } else {
      allFindings.push(...crossRefErrors);
    }
  }

  // ─── 6. Lifecycle Rules ─────────────────────────────────────────────────

  if (policy && requirements.length > 0) {
    totalChecks++;
    const lifecycleErrors = checkLifecycleRules(requirements, changes, policy);
    if (lifecycleErrors.length === 0) {
      passedChecks++;
    } else {
      allFindings.push(...lifecycleErrors);
    }
  }

  // ─── 7. Requirement Dependencies ────────────────────────────────────────

  if (requirements.length > 0) {
    totalChecks++;
    const depErrors = checkDependencies(requirements);
    if (depErrors.length === 0) {
      passedChecks++;
    } else {
      allFindings.push(...depErrors);
      if (depErrors.every((e) => e.severity === "warning")) passedChecks++;
    }
  }

  // ─── 8. File Path Existence ─────────────────────────────────────────────

  if (config.quality?.validateFilePaths !== false && requirements.length > 0) {
    totalChecks++;
    const fpErrors = checkFilePaths(requirements, cwd);
    if (fpErrors.length === 0) {
      passedChecks++;
    } else {
      allFindings.push(...fpErrors);
    }
  }

  // ─── 9. Bidirectional Test Linking ──────────────────────────────────────

  if (requirements.length > 0) {
    totalChecks++;
    const tlReport = checkTestLinking(requirements, cwd, config.testMetadata);
    const orphans = tlReport.findings.filter((f) => f.status === "orphan");
    if (orphans.length === 0) {
      passedChecks++;
    } else {
      for (const o of orphans) {
        allFindings.push({
          path: o.reqId,
          message: o.message,
          severity: "warning",
          rule: "quality:test-linking",
          suggestion: `Add "${o.testFile}" to ${o.reqId}'s verification.testRefs or verification.testFiles`,
        });
      }
    }

    // ─── 9b. Missing Test References (C2) ─────────────────────────────────
    for (const req of requirements) {
      if (req.status !== "active" && req.status !== "shipped") continue;
      if ((req.verification?.coverageStatus as string) === "not-applicable") continue;
      const hasTestRefs = (req.verification?.testRefs?.length ?? 0) > 0;
      const hasTestFiles = (req.verification?.testFiles?.length ?? 0) > 0;
      if (!hasTestRefs && !hasTestFiles) {
        allFindings.push({
          path: req.id,
          message: `Active/shipped requirement has no test references (testRefs or testFiles).`,
          severity: "warning",
          rule: "quality:missing-test-refs",
          suggestion: `Add testRefs entries or testFiles paths to ${req.id}'s verification object`,
        });
      }
    }
  }

  // ─── 10. Evidence Validation ────────────────────────────────────────────

  const evidencePath = join(spec.specRoot, "generated", "evidence.json");
  if (existsSync(evidencePath)) {
    totalChecks++;
    const evidenceErrors = validateEvidence(evidencePath, requirements);
    if (evidenceErrors.length === 0) {
      passedChecks++;
    } else {
      allFindings.push(...evidenceErrors);
    }
  }

  // ─── Apply Rule Overrides ───────────────────────────────────────────────

  const findings = applyRuleOverrides(allFindings, ruleOverrides, strict);
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  return {
    passed: errors.length === 0,
    summary: {
      totalChecks,
      passed: passedChecks,
      warnings: warnings.length,
      errors: errors.length,
      artifacts: {
        requirements: requirements.length,
        changes: changes.length,
        decisions: decisions.length,
      },
    },
    findings,
  };
}
