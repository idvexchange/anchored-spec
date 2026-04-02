/**
 * anchored-spec ea generate
 *
 * Run EA generators to produce implementation artifacts from EA specs.
 */

import { Command } from "commander";
import { resolveConfigV1, EaRoot } from "../../ea/index.js";
import { CliError } from "../errors.js";
import {
  runGenerators,
  resolveGenerators,
  listGenerators,
  renderGenerationReportMarkdown,
} from "../../ea/generators/index.js";
import { silentLogger } from "../../ea/resolvers/types.js";

export function eaGenerateCommand(): Command {
  return new Command("generate")
    .description("Generate implementation artifacts from EA specs")
    .option("--generator <name>", "Run a specific generator")
    .option("--schema <schema>", "Filter to specific schema profiles (comma-separated)")
    .option("--check", "Check for generation drift without generating")
    .option("--dry-run", "Show what would be generated without writing files")
    .option("--json", "Output report as JSON")
    .option("--output-dir <path>", "Output directory", "generated")
    .option("--root-dir <path>", "EA root directory", "docs")
    .action(async (options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      // Load entities
      const result = await root.loadEntities();
      const entities = result.entities;
      if (entities.length === 0) {
        console.log("No EA entities found.");
        return;
      }

      // Resolve generators from config
      const registeredNames = listGenerators();
      const generatorConfigs = registeredNames.map((name) => ({
        name,
        outputDir: options.outputDir,
      }));

      // If EA config has generator entries, add output dirs from config
      if (eaConfig.generators?.length) {
        for (const gc of eaConfig.generators) {
          // Map config path to generator name (e.g., "./openapi.js" → "openapi")
          const name = gc.path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
          const existing = generatorConfigs.find((c) => c.name === name);
          if (existing) {
            existing.outputDir = gc.outputDir ?? options.outputDir;
          }
        }
      }

      const generators = resolveGenerators(generatorConfigs);
      if (generators.length === 0) {
        console.log("No generators configured. Register generators or configure them in ea config.");
        return;
      }

      const schemas = options.schema
        ? options.schema.split(",").map((schema: string) => schema.trim())
        : undefined;

      const report = runGenerators({
        entities,
        generators,
        generatorConfigs,
        projectRoot: cwd,
        outputDir: options.outputDir,
        logger: silentLogger,
        checkOnly: options.check,
        dryRun: options.dryRun,
        schemas,
        generatorName: options.generator,
      });

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else if (options.check) {
        if (report.drifts.length === 0) {
          console.log("✓ No generation drift detected.");
        } else {
          console.log(`⚠ ${report.drifts.length} generation drift(s) detected:\n`);
          for (const drift of report.drifts) {
            console.log(`  ${drift.filePath} [${drift.suggestion}]`);
            console.log(`    ${drift.message}`);
          }
        }
      } else if (options.dryRun) {
        console.log(`Dry run: ${report.outputs.length} file(s) would be generated.\n`);
        for (const output of report.outputs) {
          console.log(`  ${output.relativePath} (${output.contentType})`);
          console.log(`    From: ${output.sourceArtifactId}`);
        }
      } else {
        console.log(renderGenerationReportMarkdown(report));
      }
    });
}
