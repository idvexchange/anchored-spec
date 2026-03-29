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
} from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaReportCommand(): Command {
  return new Command("report")
    .description("Generate EA reports")
    .requiredOption("--view <view>", "Report view: system-data-matrix, classification-coverage")
    .option("--format <format>", "Output format: json, markdown", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--root-dir <path>", "EA root directory", "ea")
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
        default:
          throw new CliError(
            `Unknown report view "${view}". Available: system-data-matrix, classification-coverage`,
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
