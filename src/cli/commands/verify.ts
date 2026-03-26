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
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  SpecRoot,
  validateRequirement,
  validateChange,
  validateDecision,
  validateWorkflowPolicy,
  checkCrossReferences,
  checkLifecycleRules,
  checkDependencies,
  checkFilePaths,
  checkTestLinking,
  validateEvidence,
  resolveConfig,
} from "../../core/index.js";
import type { ValidationError } from "../../core/index.js";
import { watchSpecs } from "../watch.js";
import { CliError } from "../errors.js";

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
    .option("--watch", "Re-run on spec file changes")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      if (options.watch) {
        watchSpecs(spec.specRoot, () => {
          runVerification(spec, options, cwd);
        }, "verify");
        return;
      }

      const hasFailure = runVerification(spec, options, cwd);
      if (hasFailure) {
        throw new CliError("", 1);
      }
    });
}

function runVerification(
  spec: SpecRoot,
  options: { strict?: boolean; quiet?: boolean },
  cwd: string,
): boolean {

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

      // ─── 7. Requirement Dependencies ───────────────────────────────────────

      if (requirements.length > 0) {
        stats.checks++;
        console.log(chalk.dim(`  Checking requirement dependencies...`));
        const depErrors = checkDependencies(requirements);
        const depWarnings = depErrors.filter((e) => e.severity === "warning");
        const depErrs = depErrors.filter((e) => e.severity === "error");
        if (depErrors.length === 0) {
          stats.passed++;
        } else {
          if (depErrs.length > 0) {
            allErrors.push(...depErrs);
            stats.errors++;
          }
          if (depWarnings.length > 0) {
            allWarnings.push(...depWarnings);
            stats.warnings++;
          }
          if (depErrs.length === 0) stats.passed++;
        }
      }

      // ─── 8. File Path Existence ─────────────────────────────────────────

      const config = resolveConfig(cwd);
      if (config.quality?.validateFilePaths !== false && requirements.length > 0) {
        stats.checks++;
        console.log(chalk.dim(`  Checking file path references...`));
        const fpErrors = checkFilePaths(requirements, cwd);
        if (fpErrors.length === 0) {
          stats.passed++;
        } else {
          allWarnings.push(...fpErrors);
          stats.warnings++;
        }
      }

      // ─── 9. Bidirectional Test Linking ─────────────────────────────────────

      if (requirements.length > 0) {
        stats.checks++;
        console.log(chalk.dim(`  Checking test linking...`));
        const tlReport = checkTestLinking(requirements, cwd, config.testMetadata);
        const orphans = tlReport.findings.filter((f) => f.status === "orphan");
        if (orphans.length === 0) {
          stats.passed++;
        } else {
          for (const o of orphans) {
            allWarnings.push({
              path: o.reqId,
              message: o.message,
              severity: "warning",
              rule: "quality:test-linking",
            });
          }
          stats.warnings++;
        }
      }

      // ─── 10. Evidence Validation ──────────────────────────────────────────

      const evidencePath = join(spec.specRoot, "generated", "evidence.json");
      if (existsSync(evidencePath)) {
        stats.checks++;
        console.log(chalk.dim(`  Validating evidence...`));
        const evidenceErrors = validateEvidence(evidencePath, requirements);
        if (evidenceErrors.length === 0) {
          stats.passed++;
        } else {
          for (const e of evidenceErrors) {
            if (e.severity === "error") {
              allErrors.push(e);
            } else {
              allWarnings.push(e);
            }
          }
          if (evidenceErrors.some((e) => e.severity === "error")) {
            stats.errors++;
          } else {
            stats.warnings++;
          }
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
        return true;
      } else {
        console.log(chalk.green("\n✓ All checks passed."));
        return false;
      }
}
