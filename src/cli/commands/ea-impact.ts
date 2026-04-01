/**
 * anchored-spec ea impact
 *
 * Compute transitive impact analysis for an entity.
 * Shows all downstream entities that would be affected by changes to the target.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  createDefaultRegistry,
  buildRelationGraph,
  resolveConfigV1,
  analyzeImpact,
  renderImpactReportMarkdown,
} from "../../ea/index.js";
import { getEntityId } from "../../ea/backstage/index.js";
import { buildEntityLookup, formatEntityDisplay, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

export function eaImpactCommand(): Command {
  return new Command("impact")
    .description("Analyze transitive impact of an entity")
    .argument("<entity-ref>", "Entity ref to analyze")
    .option("--format <format>", "Output format: markdown, json", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--max-depth <n>", "Maximum traversal depth")
    .option("--root-dir <path>", "EA root directory", "docs")
    .action(async (entityInput: string, options) => {
      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      const result = await root.loadEntities();

      if (result.entities.length === 0) {
        console.log(chalk.yellow("No entities found."));
        return;
      }

      // Build graph
      const registry = createDefaultRegistry();
      const entities = result.entities;
      const graph = buildRelationGraph(entities, registry);

      const lookup = buildEntityLookup(entities);
      const targetEntity = lookup.byInput.get(entityInput);
      const resolvedId = targetEntity ? getEntityId(targetEntity) : entityInput;

      // Verify entity exists
      if (!graph.node(resolvedId)) {
        const similar = suggestEntities(entityInput, entities);
        const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
        throw new CliError(
          `Entity "${entityInput}" not found.${hint}`,
          2,
        );
      }

      // Analyze impact
      const maxDepth = options.maxDepth ? parseInt(options.maxDepth as string, 10) : undefined;
      const report = analyzeImpact(graph, resolvedId, { maxDepth });

      // Output
      let output: string;
      if (options.format === "json") {
        output = JSON.stringify(report, null, 2) + "\n";
      } else {
        output = renderImpactReportMarkdown(report);
      }

      if (options.output) {
        writeFileSync(options.output as string, output);
        console.log(chalk.green(`✓ Impact report written to ${options.output}`));
      } else {
        process.stdout.write(output);
      }

      if (targetEntity) {
        console.error(chalk.dim(`Target: ${formatEntityDisplay(targetEntity)}`));
      }

      // Summary line
      if (report.totalImpacted > 0) {
        console.error(
          chalk.yellow(
            `⚠ ${report.totalImpacted} entit${report.totalImpacted === 1 ? "y" : "ies"} impacted across ${report.byDomain.length} domain(s)`,
          ),
        );
      } else {
        console.error(chalk.green("✓ No downstream impacts found."));
      }
    });
}
