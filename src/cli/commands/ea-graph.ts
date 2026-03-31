/**
 * anchored-spec ea graph
 *
 * Build and export the EA relation graph in Mermaid, DOT, or JSON format.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  createDefaultRegistry,
  buildRelationGraph,
  resolveEaConfig,
  artifactToBackstage,
} from "../../ea/index.js";
import type { EaDomain } from "../../ea/index.js";
import { getEntityLegacyKind, getEntityId } from "../../ea/backstage/accessors.js";
import { ANNOTATION_KEYS } from "../../ea/backstage/types.js";
import { CliError } from "../errors.js";

export function eaGraphCommand(): Command {
  return new Command("graph")
    .description("Export EA relation graph")
    .option("--format <format>", "Output format: mermaid, dot, json", "mermaid")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--domain <domain>", "Include only a specific domain")
    .option("--root-dir <path>", "EA root directory", "ea")
    .option("--direction <dir>", "Graph direction for Mermaid: TB or LR", "LR")
    .option("--focus <id>", "Focus on a specific artifact and its neighbors")
    .option("--depth <n>", "Depth for --focus traversal", "2")
    .option("--kind <kind>", "Filter to a specific artifact kind")
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

      // Load artifacts
      let result;
      if (options.domain) {
        result = await root.loadDomain(options.domain as EaDomain);
      } else {
        result = await root.loadArtifacts();
      }

      if (result.artifacts.length === 0) {
        if (options.format === "json") {
          process.stdout.write("{}\n");
        } else if (options.format === "dot") {
          process.stdout.write("digraph EA {\n}\n");
        } else {
          process.stdout.write("graph LR\n");
        }
        return;
      }

      // Apply kind filter
      const entities = result.artifacts.map(artifactToBackstage);
      let graphEntities = entities;
      if (options.kind) {
        const kindFilter = options.kind as string;
        graphEntities = graphEntities.filter((e) => getEntityLegacyKind(e) === kindFilter);
        if (graphEntities.length === 0) {
          console.error(`No artifacts of kind "${kindFilter}" found.`);
          return;
        }
      }

      // Build graph
      const registry = createDefaultRegistry();
      let graph = buildRelationGraph(graphEntities, registry);

      // Focus mode: build a subgraph around a specific artifact
      if (options.focus) {
        let focusId = options.focus as string;
        const depth = parseInt(options.depth as string, 10) || 2;

        // Resolve legacy ID to entity ref if needed
        if (!graph.node(focusId)) {
          const match = graphEntities.find(
            (e) => e.metadata.annotations?.[ANNOTATION_KEYS.LEGACY_ID] === focusId,
          );
          if (match) focusId = getEntityId(match);
        }

        if (!graph.node(focusId)) {
          throw new CliError(`Artifact "${focusId}" not found in graph.`, 1);
        }

        // Collect all nodes within depth
        const nodeIds = new Set<string>([focusId]);
        const collectNeighbors = (id: string, remaining: number): void => {
          if (remaining <= 0) return;
          for (const edge of [...graph.outgoing(id), ...graph.incoming(id)]) {
            const neighbor = edge.source === id ? edge.target : edge.source;
            if (!nodeIds.has(neighbor)) {
              nodeIds.add(neighbor);
              collectNeighbors(neighbor, remaining - 1);
            }
          }
        };
        collectNeighbors(focusId, depth);

        // Rebuild graph with only the focused entities
        const focused = graphEntities.filter((e) => nodeIds.has(getEntityId(e)));
        graph = buildRelationGraph(focused, registry);
      }

      // Export
      const format = options.format as string;
      let output: string;

      switch (format) {
        case "mermaid":
          output = graph.toMermaid({
            direction: (options.direction as "TB" | "LR") ?? "LR",
          });
          break;
        case "dot":
          output = graph.toDot();
          break;
        case "json":
          output = JSON.stringify(graph.toAdjacencyJson(), null, 2);
          break;
        default:
          throw new CliError(
            `Unknown format "${format}". Use: mermaid, dot, json`,
            2
          );
      }

      if (options.output) {
        writeFileSync(options.output as string, output + "\n");
        console.error(
          chalk.green(`✓ Graph written to ${options.output} (${format})`)
        );
      } else {
        process.stdout.write(output + "\n");
      }
    });
}
