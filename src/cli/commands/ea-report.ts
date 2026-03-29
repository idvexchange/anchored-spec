/**
 * anchored-spec ea report
 *
 * Generate EA reports from loaded artifacts.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
  buildExceptionReport,
  renderExceptionReportMarkdown,
  buildReportIndex,
  buildDriftHeatmap,
  renderDriftHeatmapMarkdown,
  REPORT_VIEWS,
} from "../../ea/index.js";
import { CliError } from "../errors.js";

export function eaReportCommand(): Command {
  return new Command("report")
    .description("Generate EA reports")
    .option("--view <view>", `Report view: ${REPORT_VIEWS.join(", ")}`)
    .option("--all", "Generate all available reports to output directory")
    .option("--format <format>", "Output format: json, markdown", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--output-dir <dir>", "Output directory for --all", "ea/generated")
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

      if (!options.view && !options.all) {
        throw new CliError(
          `Specify --view <view> or --all. Available views: ${REPORT_VIEWS.join(", ")}`,
          2
        );
      }

      const result = await root.loadArtifacts();

      // --all: generate all reports to output directory
      if (options.all) {
        const outputDir = join(cwd, options.outputDir as string);
        mkdirSync(outputDir, { recursive: true });

        const format = options.format as string;
        const ext = format === "json" ? ".json" : ".md";
        let count = 0;

        // System-data matrix
        const sdm = buildSystemDataMatrix(result.artifacts);
        const sdmContent = format === "json"
          ? JSON.stringify(sdm, null, 2)
          : renderSystemDataMatrixMarkdown(sdm);
        writeFileSync(join(outputDir, `system-data-matrix${ext}`), sdmContent + "\n");
        count++;

        // Classification coverage
        const cc = buildClassificationCoverage(result.artifacts);
        const ccContent = format === "json"
          ? JSON.stringify(cc, null, 2)
          : renderClassificationCoverageMarkdown(cc);
        writeFileSync(join(outputDir, `classification-coverage${ext}`), ccContent + "\n");
        count++;

        // Capability map
        const cm = buildCapabilityMap(result.artifacts);
        const cmContent = format === "json"
          ? JSON.stringify(cm, null, 2)
          : renderCapabilityMapMarkdown(cm);
        writeFileSync(join(outputDir, `capability-map${ext}`), cmContent + "\n");
        count++;

        // Exception report
        const er = buildExceptionReport(result.artifacts);
        const erContent = format === "json"
          ? JSON.stringify(er, null, 2)
          : renderExceptionReportMarkdown(er);
        writeFileSync(join(outputDir, `exception-report${ext}`), erContent + "\n");
        count++;

        // Drift heatmap
        const dh = buildDriftHeatmap(result.artifacts);
        const dhContent = format === "json"
          ? JSON.stringify(dh, null, 2)
          : renderDriftHeatmapMarkdown(dh);
        writeFileSync(join(outputDir, `drift-heatmap${ext}`), dhContent + "\n");
        count++;

        // Report index (always JSON)
        const index = buildReportIndex(result.artifacts);
        writeFileSync(join(outputDir, "report-index.json"), JSON.stringify(index, null, 2) + "\n");

        console.log(chalk.green(`✓ Generated ${count} reports + index to ${outputDir}`));
        return;
      }

      // Single report
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
        case "exceptions": {
          const report = buildExceptionReport(result.artifacts);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderExceptionReportMarkdown(report);
          }
          break;
        }
        case "drift-heatmap": {
          const report = buildDriftHeatmap(result.artifacts);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderDriftHeatmapMarkdown(report);
          }
          break;
        }
        default:
          throw new CliError(
            `Unknown report view "${view}". Available: ${REPORT_VIEWS.join(", ")}`,
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
