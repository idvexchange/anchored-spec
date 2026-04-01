/**
 * anchored-spec verify
 *
 * Run all spec validation checks:
 *   1. JSON Schema validation (per artifact)
 *   2. Quality rules (owners, summary, relations)
 *   3. Relation integrity (targets exist, types valid)
 *   4. Orphan artifact detection
 *   5. Lifecycle consistency
 *   6. Plugin checks (if configured)
 */

import { Command } from "commander";
import chalk from "chalk";
import { resolveConfigV1 } from "../../ea/config.js";
import { EaRoot } from "../../ea/loader.js";
import { runEaVerification } from "../../ea/verify.js";
import type { EaVerificationResult } from "../../ea/verify.js";
import { CliError } from "../errors.js";

export function verifyCommand(): Command {
  return new Command("verify")
    .description("Run all spec validation checks")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--strict", "Treat warnings as errors")
    .option("--quiet", "Only show errors")
    .option("--json", "Output structured JSON to stdout")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const eaRoot = new EaRoot(cwd, eaConfig);

      if (!eaRoot.isInitialized()) {
        throw new CliError("EA not initialized. Run 'anchored-spec init' first.", 2);
      }

      const result = await runEaVerification(eaRoot, {
        strict: options.strict,
      });

      if (options.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        if (!result.passed) throw new CliError("", 1);
        return;
      }

      printResult(result, options);

      if (!result.passed) {
        throw new CliError("", 1);
      }
    });
}

function printResult(
  result: EaVerificationResult,
  options: { quiet?: boolean },
): void {
  console.log(chalk.blue("🔍 Anchored Spec — Verification\n"));

  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warning");

  if (!options.quiet && warnings.length > 0) {
    for (const w of warnings) {
      console.log(chalk.yellow(`  ⚠ ${w.message}`));
      if (w.rule) console.log(chalk.dim(`    Rule: ${w.rule}`));
    }
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.log(chalk.red(`  ✗ ${e.message}`));
      if (e.rule) console.log(chalk.dim(`    Rule: ${e.rule}`));
    }
  }

  console.log("");

  const { summary } = result;
  console.log(
    `  ${summary.artifacts.total} artifacts | ` +
    `${summary.totalChecks} checks | ` +
    `${summary.passed} passed | ` +
    `${summary.errors} error(s) | ` +
    `${summary.warnings} warning(s)`
  );

  console.log("");

  if (result.passed) {
    console.log(chalk.green("✓ Verification passed."));
  } else {
    console.log(chalk.red("✗ Verification failed."));
  }

  console.log("");
}
