/**
 * anchored-spec verify
 *
 * Run all spec validation checks:
 * 1. Schema validation (all JSON files against their schemas)
 * 2. Requirement quality checks (EARS, vague language, semantic refs)
 * 3. Workflow policy validation
 * 4. Cross-reference integrity (REQ↔CHG bidirectional links)
 * 5. Lifecycle rule enforcement
 * 6. Requirement dependencies
 * 7. File path existence
 * 8. Bidirectional test linking + missing test refs
 * 9. Evidence validation
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  SpecRoot,
} from "../../core/index.js";
import { runAllChecks } from "../../core/verify.js";
import type { VerificationResult } from "../../core/verify.js";
import { watchSpecs } from "../watch.js";
import { CliError } from "../errors.js";

export function verifyCommand(): Command {
  return new Command("verify")
    .description("Run all spec validation checks")
    .option("--strict", "Treat warnings as errors")
    .option("--quiet", "Only show errors")
    .option("--json", "Output structured JSON to stdout")
    .option("--watch", "Re-run on spec file changes")
    .action(async (options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      if (options.watch) {
        const sourceRoots = spec.config.sourceRoots;
        watchSpecs(spec.specRoot, async () => {
          await runVerification(spec, options);
        }, "verify", sourceRoots);
        return;
      }

      const hasFailure = await runVerification(spec, options);
      if (hasFailure) {
        throw new CliError("", 1);
      }
    });
}

async function runVerification(
  spec: SpecRoot,
  options: { strict?: boolean; quiet?: boolean; json?: boolean },
): Promise<boolean> {
  const result = await runAllChecks(spec, { strict: options.strict });

  if (options.json) {
    // JSON mode: structured output to stdout, nothing else
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return !result.passed;
  }

  // Human-readable output
  printHumanResult(result, options);
  return !result.passed;
}

function printHumanResult(
  result: VerificationResult,
  options: { quiet?: boolean },
): void {
  console.log(chalk.blue("🔍 Anchored Spec — Verification\n"));

  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warning");

  if (errors.length > 0) {
    console.log(chalk.red(`  ✗ ${errors.length} error(s):`));
    for (const err of errors) {
      console.log(chalk.red(`    ${err.path}: ${err.message}`));
      if (err.rule && !options.quiet) {
        console.log(chalk.dim(`      Rule: ${err.rule}`));
      }
      if (err.suggestion && !options.quiet) {
        console.log(chalk.dim(`      💡 ${err.suggestion}`));
      }
    }
  }

  if (warnings.length > 0 && !options.quiet) {
    console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s):`));
    for (const warn of warnings) {
      console.log(chalk.yellow(`    ${warn.path}: ${warn.message}`));
      if (warn.rule) {
        console.log(chalk.dim(`      Rule: ${warn.rule}`));
      }
      if (warn.suggestion) {
        console.log(chalk.dim(`      💡 ${warn.suggestion}`));
      }
    }
  }

  const { summary } = result;
  const total = summary.artifacts.requirements + summary.artifacts.changes + summary.artifacts.decisions;
  console.log(
    chalk.dim(`\n  ${summary.totalChecks} checks | ${summary.passed} passed | ${summary.warnings} warnings | ${summary.errors} errors`)
  );
  console.log(
    chalk.dim(`  ${total} artifacts (${summary.artifacts.requirements} REQs, ${summary.artifacts.changes} CHGs, ${summary.artifacts.decisions} ADRs)`)
  );

  if (result.passed) {
    console.log(chalk.green("\n✓ All checks passed."));
  } else {
    console.log(chalk.red("\n✗ Verification failed."));
  }
}
