/**
 * anchored-spec ea drift
 *
 * Run the EA drift engine against loaded artifacts.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  EaRoot,
  resolveEaConfig,
  detectEaDrift,
  EA_DOMAINS,
} from "../../ea/index.js";
import type { ExceptionArtifact } from "../../ea/types.js";
import { CliError } from "../errors.js";

export function eaDriftCommand(): Command {
  return new Command("drift")
    .description("Detect EA drift across all domains")
    .option("--domain <domain>", "Filter to specific domain")
    .option("--severity <level>", "Filter findings by minimum severity: error, warning, info")
    .option("--json", "Output as JSON")
    .option("--fail-on-warning", "Exit with code 1 on warnings (not just errors)")
    .option("--max-cache-age <seconds>", "Maximum cache age in seconds")
    .option("--no-cache", "Disable resolver cache")
    .option("--root-dir <path>", "EA root directory", "ea")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec ea init' first.",
          2,
        );
      }

      const result = await root.loadArtifacts();

      // Validate domain filter
      const domainFilter = options.domain as string | undefined;
      if (domainFilter && !EA_DOMAINS.includes(domainFilter as any)) {
        throw new CliError(
          `Unknown domain "${domainFilter}". Available: ${EA_DOMAINS.join(", ")}`,
          2,
        );
      }

      // Collect exceptions
      const exceptions = result.artifacts.filter(
        (a): a is ExceptionArtifact => a.kind === "exception",
      );

      const report = detectEaDrift({
        artifacts: result.artifacts,
        exceptions,
        domains: domainFilter ? [domainFilter] : undefined,
      });

      // Filter by severity
      const severityFilter = options.severity as string | undefined;
      let filteredFindings = report.findings.filter((f) => !f.suppressed);
      if (severityFilter) {
        const levels = ["error", "warning", "info"];
        const minIdx = levels.indexOf(severityFilter);
        if (minIdx === -1) {
          throw new CliError(
            `Unknown severity "${severityFilter}". Available: error, warning, info`,
            2,
          );
        }
        filteredFindings = filteredFindings.filter(
          (f) => levels.indexOf(f.severity) <= minIdx,
        );
      }

      // JSON output
      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        // Text output
        const status = report.passed ? chalk.green("✅ PASSED") : chalk.red("❌ FAILED");
        console.log(`EA Drift Check — ${status}\n`);

        console.log(`  Errors: ${report.summary.errors}`);
        console.log(`  Warnings: ${report.summary.warnings}`);
        console.log(`  Suppressed: ${report.summary.suppressed}`);
        console.log(`  Rules evaluated: ${report.summary.rulesEvaluated}`);
        console.log("");

        // Domain heatmap
        if (Object.keys(report.byDomain).length > 0) {
          console.log("  By domain:");
          for (const [domain, counts] of Object.entries(report.byDomain)) {
            const icon = counts.errors > 0 ? "🔴" : counts.warnings > 0 ? "🟡" : "🟢";
            console.log(
              `    ${icon} ${domain}: ${counts.errors} errors, ${counts.warnings} warnings`,
            );
          }
          console.log("");
        }

        // Findings
        if (filteredFindings.length > 0) {
          console.log("  Findings:");
          for (const f of filteredFindings) {
            const icon = f.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
            console.log(`    ${icon} [${f.severity}] ${f.message}`);
          }
          console.log("");
        }
      }

      // Exit code
      if (!report.passed) {
        throw new CliError("", 1);
      }
      if (options.failOnWarning && report.summary.warnings > 0) {
        throw new CliError("", 1);
      }
    });
}
