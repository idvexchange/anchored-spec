/**
 * anchored-spec ea report
 *
 * Generate EA reports from loaded entities.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  EaRoot,
  resolveConfigV1,
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
  buildTraceabilityIndex,
  renderTraceabilityIndexMarkdown,
  REPORT_VIEWS,
  EA_DOMAINS,
} from "../../ea/index.js";
import type { EaDomain } from "../../ea/index.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import { getEntityDomain, getEntityId } from "../../ea/backstage/accessors.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

/** Filter entities to a specific domain. */
function filterByDomain(entities: BackstageEntity[], domain: string): BackstageEntity[] {
  return entities.filter((a) => getEntityDomain(a) === domain);
}

export function eaReportCommand(): Command {
  return new Command("report")
    .description("Generate EA reports")
    .option("--view <view>", `Report view: ${REPORT_VIEWS.join(", ")}`)
    .option("--all", "Generate all available reports to output directory")
    .option("--format <format>", "Output format: json, markdown", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--output-dir <dir>", "Output directory for --all", "docs/generated")
    .option("--domain <domain>", "Filter report to a specific EA domain")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--baseline <entity-ref>", "Baseline entity ref for gap-analysis")
    .option("--target <entity-ref>", "Target entity ref for gap-analysis")
    .option("--plan <entity-ref>", "Transition plan entity ref for gap-analysis")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2
        );
      }

      if (!options.view && !options.all) {
        throw new CliError(
          `Specify --view <view> or --all. Available views: ${REPORT_VIEWS.join(", ")}`,
          2
        );
      }

      const result = await root.loadEntities();
      const allEntities = result.entities;
      const lookup = buildEntityLookup(allEntities);

      // Apply domain filter
      const domainFilter = options.domain as string | undefined;
      if (domainFilter && !EA_DOMAINS.includes(domainFilter as EaDomain)) {
        throw new CliError(
          `Unknown domain "${domainFilter}". Available: ${EA_DOMAINS.join(", ")}`,
          2
        );
      }
      const entities = domainFilter
        ? filterByDomain(allEntities, domainFilter)
        : allEntities;

      // --all: generate all reports to output directory
      if (options.all) {
        const outputDir = join(cwd, options.outputDir as string);
        mkdirSync(outputDir, { recursive: true });

        const format = options.format as string;
        const ext = format === "json" ? ".json" : ".md";
        let count = 0;

        // System-data matrix
        const sdm = buildSystemDataMatrix(entities);
        const sdmContent = format === "json"
          ? JSON.stringify(sdm, null, 2)
          : renderSystemDataMatrixMarkdown(sdm);
        writeFileSync(join(outputDir, `system-data-matrix${ext}`), sdmContent + "\n");
        count++;

        // Classification coverage
        const cc = buildClassificationCoverage(entities);
        const ccContent = format === "json"
          ? JSON.stringify(cc, null, 2)
          : renderClassificationCoverageMarkdown(cc);
        writeFileSync(join(outputDir, `classification-coverage${ext}`), ccContent + "\n");
        count++;

        // Capability map
        const cm = buildCapabilityMap(entities);
        const cmContent = format === "json"
          ? JSON.stringify(cm, null, 2)
          : renderCapabilityMapMarkdown(cm);
        writeFileSync(join(outputDir, `capability-map${ext}`), cmContent + "\n");
        count++;

        // Exception report
        const er = buildExceptionReport(entities);
        const erContent = format === "json"
          ? JSON.stringify(er, null, 2)
          : renderExceptionReportMarkdown(er);
        writeFileSync(join(outputDir, `exception-report${ext}`), erContent + "\n");
        count++;

        // Drift heatmap
        const dh = buildDriftHeatmap(entities);
        const dhContent = format === "json"
          ? JSON.stringify(dh, null, 2)
          : renderDriftHeatmapMarkdown(dh);
        writeFileSync(join(outputDir, `drift-heatmap${ext}`), dhContent + "\n");
        count++;

        // Traceability index
        const ti = buildTraceabilityIndex(entities);
        const tiContent = format === "json"
          ? JSON.stringify(ti, null, 2)
          : renderTraceabilityIndexMarkdown(ti);
        writeFileSync(join(outputDir, `traceability-index${ext}`), tiContent + "\n");
        count++;

        // Report index (always JSON)
        const index = buildReportIndex(entities);
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
          const report = buildSystemDataMatrix(entities);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderSystemDataMatrixMarkdown(report);
          }
          break;
        }
        case "classification-coverage": {
          const report = buildClassificationCoverage(entities);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderClassificationCoverageMarkdown(report);
          }
          break;
        }
        case "capability-map": {
          const report = buildCapabilityMap(entities);
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
          const resolveGapEntity = (input: string, label: string): string => {
            const entity = lookup.byInput.get(input);
            if (entity) return getEntityId(entity);
            const similar = suggestEntities(input, entities);
            const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
            throw new CliError(`${label} "${input}" not found.${hint}`, 2);
          };
          const report = buildGapAnalysis(entities, {
            baselineId: resolveGapEntity(options.baseline as string, "Baseline entity"),
            targetId: resolveGapEntity(options.target as string, "Target entity"),
            planId: options.plan
              ? resolveGapEntity(options.plan as string, "Transition plan entity")
              : undefined,
          });
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderGapAnalysisMarkdown(report);
          }
          break;
        }
        case "exceptions": {
          const report = buildExceptionReport(entities);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderExceptionReportMarkdown(report);
          }
          break;
        }
        case "drift-heatmap": {
          const report = buildDriftHeatmap(entities);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderDriftHeatmapMarkdown(report);
          }
          break;
        }
        case "traceability-index": {
          const report = buildTraceabilityIndex(entities);
          if (format === "json") {
            output = JSON.stringify(report, null, 2);
          } else {
            output = renderTraceabilityIndexMarkdown(report);
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
