/**
 * anchored-spec ea impact
 *
 * Compute transitive impact analysis for an EA artifact.
 * Shows all artifacts that would be affected by changes to the target.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  createDefaultRegistry,
  buildRelationGraph,
  resolveEaConfig,
  analyzeImpact,
  renderImpactReportMarkdown,
  artifactToBackstage,
} from "../../ea/index.js";
import { ANNOTATION_KEYS, getEntityId } from "../../ea/backstage/index.js";
import { CliError } from "../errors.js";

export function eaImpactCommand(): Command {
  return new Command("impact")
    .description("Analyze transitive impact of an EA artifact")
    .argument("<artifact-id>", "ID of the artifact to analyze")
    .option("--format <format>", "Output format: markdown, json", "markdown")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--max-depth <n>", "Maximum traversal depth")
    .option("--root-dir <path>", "EA root directory", "ea")
    .action(async (artifactId: string, options) => {
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

      if (result.artifacts.length === 0) {
        console.log(chalk.yellow("No artifacts found."));
        return;
      }

      // Build graph
      const registry = createDefaultRegistry();
      const entities = result.artifacts.map(artifactToBackstage);
      const graph = buildRelationGraph(entities, registry);

      // Resolve artifact ID: try as entity ref first, then as legacy ID
      let resolvedId = artifactId;
      if (!graph.node(resolvedId)) {
        // Try to find by legacy ID annotation
        const match = entities.find(
          (e) => e.metadata.annotations?.[ANNOTATION_KEYS.LEGACY_ID] === artifactId,
        );
        if (match) {
          resolvedId = getEntityId(match);
        }
      }

      // Verify artifact exists
      if (!graph.node(resolvedId)) {
        throw new CliError(
          `Artifact "${artifactId}" not found. Use 'ea validate' to list artifacts.`,
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

      // Summary line
      if (report.totalImpacted > 0) {
        console.error(
          chalk.yellow(
            `⚠ ${report.totalImpacted} artifact(s) impacted across ${report.byDomain.length} domain(s)`,
          ),
        );
      } else {
        console.error(chalk.green("✓ No downstream impacts found."));
      }
    });
}
