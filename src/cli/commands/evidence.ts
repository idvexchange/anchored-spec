/**
 * anchored-spec evidence
 *
 * Collect and validate test evidence from runner output.
 */

import { Command } from "commander";
import chalk from "chalk";
import { join, resolve } from "node:path";
import { SpecRoot } from "../../core/index.js";
import {
  collectEvidence,
  writeEvidence,
  validateEvidence,
} from "../../core/evidence.js";
import { CliError } from "../errors.js";

export function evidenceCommand(): Command {
  const cmd = new Command("evidence")
    .description("Collect and validate test evidence");

  cmd
    .command("collect")
    .description("Ingest test runner output and build evidence artifact")
    .requiredOption("--from <path>", "Path to test runner JSON report")
    .option("--format <format>", "Test runner format (vitest, jest, junit)", "vitest")
    .option("--output <path>", "Output path for evidence file")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const reportPath = resolve(cwd, options.from);
      const requirements = spec.loadRequirements();

      console.log(chalk.blue("📋 Collecting test evidence\n"));

      const evidence = collectEvidence(reportPath, options.format, requirements);
      const outputPath = options.output ?? join(spec.specRoot, "evidence", "evidence.json");

      // Ensure directory exists
      const { mkdirSync } = require("node:fs");
      mkdirSync(join(spec.specRoot, "evidence"), { recursive: true });

      writeEvidence(evidence, outputPath);

      console.log(chalk.green(`  ✓ Collected ${evidence.records.length} evidence record(s)`));
      console.log(chalk.dim(`  Source: ${options.format}`));
      console.log(chalk.dim(`  Output: ${outputPath}`));

      const passed = evidence.records.filter((r) => r.status === "passed").length;
      const failed = evidence.records.filter((r) => r.status === "failed").length;
      console.log(chalk.dim(`  Passed: ${passed} | Failed: ${failed}`));
    });

  cmd
    .command("validate")
    .description("Validate evidence artifact against requirements")
    .option("--evidence <path>", "Path to evidence file")
    .action((options) => {
      const cwd = process.cwd();
      const spec = new SpecRoot(cwd);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const evidencePath =
        options.evidence ?? join(spec.specRoot, "evidence", "evidence.json");
      const requirements = spec.loadRequirements();

      console.log(chalk.blue("🔍 Validating evidence\n"));

      const issues = validateEvidence(evidencePath, requirements);

      if (issues.length === 0) {
        console.log(chalk.green("  ✓ Evidence is valid."));
      } else {
        const errors = issues.filter((i) => i.severity === "error");
        const warnings = issues.filter((i) => i.severity === "warning");

        if (errors.length > 0) {
          console.log(chalk.red(`  ✗ ${errors.length} error(s):`));
          for (const e of errors) {
            console.log(chalk.red(`    ${e.path}: ${e.message}`));
          }
        }
        if (warnings.length > 0) {
          console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s):`));
          for (const w of warnings) {
            console.log(chalk.yellow(`    ${w.path}: ${w.message}`));
          }
        }

        if (errors.length > 0) {
          throw new CliError("", 1);
        }
      }
    });

  return cmd;
}
