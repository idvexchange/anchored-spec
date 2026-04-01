/**
 * anchored-spec ea graph
 *
 * Build and export the entity relation graph in Mermaid, DOT, or JSON format.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import {
  EaRoot,
  createDefaultRegistry,
  buildRelationGraph,
  resolveConfigV1,
} from "../../ea/index.js";
import type { EaDomain } from "../../ea/index.js";
import { getEntityLegacyKind, getEntityId } from "../../ea/backstage/accessors.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

export function eaGraphCommand(): Command {
  return new Command("graph")
    .description("Export the entity relation graph")
    .option("--format <format>", "Output format: mermaid, dot, json", "mermaid")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--domain <domain>", "Include only a specific domain")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option("--direction <dir>", "Graph direction for Mermaid: TB or LR", "LR")
    .option("--focus <entity-ref>", "Focus on a specific entity and its neighbors")
    .option("--depth <n>", "Depth for --focus traversal", "2")
    .option("--kind <kind>", "Filter to a specific entity kind")
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

      // Load entities
      let result;
      if (options.domain) {
        result = await root.loadEntityDomain(options.domain as EaDomain);
      } else {
        result = await root.loadEntities();
      }

      if (result.entities.length === 0) {
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
      let graphEntities = result.entities;
      if (options.kind) {
        const kindFilter = options.kind as string;
        graphEntities = graphEntities.filter((e) => getEntityLegacyKind(e) === kindFilter);
        if (graphEntities.length === 0) {
          console.error(`No entities of kind "${kindFilter}" found.`);
          return;
        }
      }

      // Build graph
      const registry = createDefaultRegistry();
      let graph = buildRelationGraph(graphEntities, registry);
      const lookup = buildEntityLookup(graphEntities);

      // Focus mode: build a subgraph around a specific entity
      if (options.focus) {
        const focusInput = options.focus as string;
        const focusId = lookup.byInput.get(focusInput)
          ? getEntityId(lookup.byInput.get(focusInput)!)
          : focusInput;
        const depth = parseInt(options.depth as string, 10) || 2;

        if (!graph.node(focusId)) {
          const similar = suggestEntities(focusInput, graphEntities);
          const hint = similar.length > 0 ? `\n  Did you mean: ${similar.join(", ")}?` : "";
          throw new CliError(`Entity "${focusInput}" not found in graph.${hint}`, 1);
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
