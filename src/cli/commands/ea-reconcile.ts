/**
 * anchored-spec reconcile
 *
 * Full SDD control loop: generate → validate → drift.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { reconcileEaProject, renderReconcileOutput } from "../../ea/reconcile.js";
import { CliError } from "../errors.js";

export function eaReconcileCommand(): Command {
  return new Command("reconcile")
    .description("Run full SDD pipeline: generate → validate → drift")
    .option("--write", "Write generated files (default: check-only)")
    .option("--strict", "Promote warnings to errors")
    .option("--fail-on <level>", "Exit threshold: error (default), warning", "error")
    .option("--skip-generate", "Skip generation step")
    .option("--skip-drift", "Skip drift step")
    .option("--include-trace", "Include trace integrity check as a step")
    .option("--include-docs", "Include doc consistency check as a step")
    .option("--skip-trace", "Skip trace step (if --include-trace is set)")
    .option("--doc-dirs <dirs>", "Comma-separated doc directories for trace checking", "docs,specs,.")
    .option("--fail-fast", "Stop at first failing step")
    .option("--domain <domain>", "Filter to a specific EA domain")
    .option("--json", "Output full report as JSON")
    .option("--output <file>", "Write report to file")
    .option("--root-dir <path>", "EA root directory", "docs")
    .action(async (options) => {
      process.stdout.write(chalk.dim("⏳ Reconciling EA project...\n\n"));

      const report = await reconcileEaProject({
        projectRoot: process.cwd(),
        eaRoot: options.rootDir,
        checkOnly: !options.write,
        strict: options.strict,
        failOn: options.failOn,
        skipGenerate: options.skipGenerate,
        skipDrift: options.skipDrift,
        includeTrace: options.includeTrace,
        includeDocs: options.includeDocs,
        skipTrace: options.skipTrace,
        docDirs: options.docDirs
          ? (options.docDirs as string).split(",").map((d: string) => d.trim())
          : undefined,
        failFast: options.failFast,
        domains: options.domain ? [options.domain] : undefined,
      });

      if (options.json) {
        const output = JSON.stringify(report, null, 2);
        if (options.output) {
          writeFileSync(options.output, output + "\n");
          process.stdout.write(chalk.green(`✓ Report written to ${options.output}`) + "\n");
        } else {
          process.stdout.write(output + "\n");
        }
      } else {
        const output = renderReconcileOutput(report);
        if (options.output) {
          writeFileSync(options.output, output + "\n");
          process.stdout.write(chalk.green(`✓ Report written to ${options.output}`) + "\n");
        } else {
          process.stdout.write(output + "\n");
        }
      }

      if (!report.passed) {
        throw new CliError(
          `Reconcile failed with ${report.summary.totalErrors} errors`,
          1,
        );
      }
    });
}
