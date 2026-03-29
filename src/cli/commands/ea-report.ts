/**
 * anchored-spec ea report
 *
 * Generate EA reports from loaded artifacts.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  resolveEaConfig,
  buildSystemDataMatrix,
  renderSystemDataMatrixMarkdown,
  buildClassificationCoverage,
  renderClassificationCoverageMarkdown,
  buildCapabilityMap,
  renderCapabilityMapMarkdown,
  buildGapAnalysis,
  renderGapAnalysisMarkdown,
} from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaReportCommand(): Command {
  return new Command("report")
    .description("Generate EA reports")
    .requiredOption("--view <view>", "Report view: system-data-matrix, classification-coverage, capability-map, gap-analysis")
    .option("--format <format>", "Output format: json, markdown", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--baseline <id>", "Baseline artifact ID (for gap-analysis)")
    .option("--target <id>", "Target artifact ID (for gap-analysis)")
    .option("--plan <id>", "Transition plan artifact ID (for gap-analysis)")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveEaConfig({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, { specDir: "specs", outputDir: "output", ea: eaConfig } as never);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec ea init' first.",
          2
        );
      }

      const result = await root.loadArtifacts();

      const view = options.view as string;
      const format = options.format as string;
      let output: string;

      switch (view) {
        case "system-data-matrix": {
          const report = buildSystemDataMatrix(result.artifacts);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderSystemDataMatrixMarkdown(report);
          }
          break;
        }
        case "classification-coverage": {
          const report = buildClassificationCoverage(result.artifacts);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderClassificationCoverageMarkdown(report);
          }
          break;
        }
        case "capability-map": {
          const report = buildCapabilityMap(result.artifacts);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderCapabilityMapMarkdown(report);
          }
          break;
        }
        case "gap-analysis": {
          if (!options.baseline || !options.target) {
            throw new CliError(
              "gap-analysis view requires --baseline and --target options",
              2
            );
          }
          const report = buildGapAnalysis(result.artifacts, {
            baselineId: options.baseline as string,
            targetId: options.target as string,
            planId: options.plan as string | undefined,
          });
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderGapAnalysisMarkdown(report);
          }
          break;
        }
        default:
          throw new CliError(
            `Unknown report view "${view}". Available: system-data-matrix, classification-coverage, capability-map, gap-analysis`,
            2
          );
      }

      if (options.output) {
        writeFileSync(options.output as string, output + "\n");
        console.error(
          chalk.green(`✓ Report written to ${options.output}`)
        );
      } else {
        process.stdout.write(output + "\n");
      }
    });
}
