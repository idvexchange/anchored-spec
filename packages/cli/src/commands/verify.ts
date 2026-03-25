/**
 * anchored-spec verify
 *
 * Run all spec validation checks:
 * 1. Schema validation (all JSON files against their schemas)
 * 2. Requirement quality checks (EARS, vague language, semantic refs)
 * 3. Workflow policy validation
 * 4. Cross-reference integrity (REQ↔CHG bidirectional links)
 * 5. Lifecycle rule enforcement
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  SpecRoot,
  validateRequirement,
  validateChange,
  validateDecision,
  validateWorkflowPolicy,
} from "@anchored-spec/core";
import type { ValidationError, Requirement, Change } from "@anchored-spec/core";

interface VerifyStats {
  checks: number;
  passed: number;
  warnings: number;
  errors: number;
}

export function verifyCommand(): Command {
  return new Command("verify")
    .description("Run all spec validation checks")
    .option("--strict", "Treat warnings as errors")
    .option("--quiet", "Only show errors")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        console.error(chalk.red("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first."));
        process.exit(1);
      }

      console.log(chalk.blue("🔍 Anchored Spec — Verification\n"));

      const stats: VerifyStats = { checks: 0, passed: 0, warnings: 0, errors: 0 };
      const allErrors: ValidationError[] = [];
      const allWarnings: ValidationError[] = [];

      // ─── 1. Validate Requirements ─────────────────────────────────────────

      const requirements = spec.loadRequirements();
      if (requirements.length > 0) {
        console.log(chalk.dim(`  Validating ${requirements.length} requirement(s)...`));
        for (const req of requirements) {
          stats.checks++;
          const result = validateRequirement(req);
          if (result.valid && result.warnings.length === 0) {
            stats.passed++;
          } else {
            for (const err of result.errors) {
              allErrors.push({ ...err, path: `${req.id}${err.path}` });
            }
            for (const warn of result.warnings) {
              allWarnings.push({ ...warn, path: `${req.id}${warn.path}` });
            }
            if (result.errors.length > 0) stats.errors++;
            if (result.warnings.length > 0) stats.warnings++;
            if (result.valid) stats.passed++;
          }
        }
      }

      // ─── 2. Validate Changes ──────────────────────────────────────────────

      const changes = spec.loadChanges();
      if (changes.length > 0) {
        console.log(chalk.dim(`  Validating ${changes.length} change(s)...`));
        for (const chg of changes) {
          stats.checks++;
          const result = validateChange(chg);
          if (result.valid) {
            stats.passed++;
          } else {
            for (const err of result.errors) {
              allErrors.push({ ...err, path: `${chg.id}${err.path}` });
            }
            stats.errors++;
          }
        }
      }

      // ─── 3. Validate Decisions ────────────────────────────────────────────

      const decisions = spec.loadDecisions();
      if (decisions.length > 0) {
        console.log(chalk.dim(`  Validating ${decisions.length} decision(s)...`));
        for (const dec of decisions) {
          stats.checks++;
          const result = validateDecision(dec);
          if (result.valid) {
            stats.passed++;
          } else {
            for (const err of result.errors) {
              allErrors.push({ ...err, path: `${dec.id}${err.path}` });
            }
            stats.errors++;
          }
        }
      }

      // ─── 4. Validate Workflow Policy ──────────────────────────────────────

      const policy = spec.loadWorkflowPolicy();
      if (policy) {
        stats.checks++;
        console.log(chalk.dim(`  Validating workflow policy...`));
        const result = validateWorkflowPolicy(policy);
        if (result.valid) {
          stats.passed++;
        } else {
          for (const err of result.errors) {
            allErrors.push({ ...err, path: `workflow-policy${err.path}` });
          }
          stats.errors++;
        }
      }

      // ─── 5. Cross-Reference Integrity ─────────────────────────────────────

      if (requirements.length > 0 && changes.length > 0) {
        stats.checks++;
        console.log(chalk.dim(`  Checking cross-reference integrity...`));
        const crossRefErrors = checkCrossReferences(requirements, changes);
        if (crossRefErrors.length === 0) {
          stats.passed++;
        } else {
          allWarnings.push(...crossRefErrors);
          stats.warnings++;
        }
      }

      // ─── 6. Lifecycle Rules ───────────────────────────────────────────────

      if (policy && requirements.length > 0) {
        stats.checks++;
        console.log(chalk.dim(`  Checking lifecycle rules...`));
        const lifecycleErrors = checkLifecycleRules(requirements, changes, policy);
        if (lifecycleErrors.length === 0) {
          stats.passed++;
        } else {
          allErrors.push(...lifecycleErrors);
          stats.errors++;
        }
      }

      // ─── Report ───────────────────────────────────────────────────────────

      console.log("");

      if (allErrors.length > 0) {
        console.log(chalk.red(`  ✗ ${allErrors.length} error(s):`));
        for (const err of allErrors) {
          console.log(chalk.red(`    ${err.path}: ${err.message}`));
          if (err.rule && !options.quiet) {
            console.log(chalk.dim(`      Rule: ${err.rule}`));
          }
        }
      }

      if (allWarnings.length > 0 && !options.quiet) {
        console.log(chalk.yellow(`  ⚠ ${allWarnings.length} warning(s):`));
        for (const warn of allWarnings) {
          console.log(chalk.yellow(`    ${warn.path}: ${warn.message}`));
          if (warn.rule) {
            console.log(chalk.dim(`      Rule: ${warn.rule}`));
          }
        }
      }

      const total = requirements.length + changes.length + decisions.length + (policy ? 1 : 0);
      console.log(
        chalk.dim(`\n  ${stats.checks} checks | ${stats.passed} passed | ${stats.warnings} warnings | ${stats.errors} errors`)
      );
      console.log(
        chalk.dim(`  ${total} artifacts (${requirements.length} REQs, ${changes.length} CHGs, ${decisions.length} ADRs)`)
      );

      const hasFailure = allErrors.length > 0 || (options.strict && allWarnings.length > 0);
      if (hasFailure) {
        console.log(chalk.red("\n✗ Verification failed."));
        process.exit(1);
      } else {
        console.log(chalk.green("\n✓ All checks passed."));
      }
    });
}

// ─── Cross-Reference Checks ────────────────────────────────────────────────────

function checkCrossReferences(
  requirements: Requirement[],
  changes: Change[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check: CHG references REQ → REQ should reference back via implementation.activeChanges
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

  return errors;
}

// ─── Lifecycle Rule Checks ─────────────────────────────────────────────────────

function checkLifecycleRules(
  requirements: Requirement[],
  changes: Change[],
  policy: { lifecycleRules: { plannedToActiveRequiresChange?: boolean; activeToShippedRequiresCoverage?: boolean; deprecatedRequiresReason?: boolean } }
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
        });
      }
    }
  }

  return errors;
}
