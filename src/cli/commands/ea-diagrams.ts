import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync } from "node:fs";
import { EaRoot } from "../../ea/loader.js";
import { resolveConfigV1 } from "../../ea/config.js";
import type { EaDomain } from "../../ea/types.js";
import type { BackstageEntity } from "../../ea/backstage/types.js";
import {
  getEntityId,
  getEntityKind,
  getEntitySchema,
} from "../../ea/backstage/accessors.js";
import {
  getDiagramDefinition,
  listDiagramDefinitions,
} from "../../ea/diagrams/registry.js";
import { renderMermaidDiagram } from "../../ea/diagrams/renderers/mermaid.js";
import type { DiagramProjection } from "../../ea/diagrams/types.js";
import { buildEntityLookup, suggestEntities } from "../entity-ref.js";
import { CliError } from "../errors.js";

function filterEntities(
  entities: BackstageEntity[],
  options: { kind?: string; schema?: string },
): BackstageEntity[] {
  let filtered = entities;

  if (options.kind) {
    filtered = filtered.filter(
      (entity) => getEntityKind(entity) === options.kind,
    );
  }

  if (options.schema) {
    filtered = filtered.filter(
      (entity) => getEntitySchema(entity) === options.schema,
    );
  }

  return filtered;
}

function filterProjectionByFocus(
  projection: DiagramProjection,
  focusId: string,
  depth: number,
): DiagramProjection {
  const knownNodes = new Set(projection.nodes.map((node) => node.id));
  if (!knownNodes.has(focusId)) {
    return projection;
  }

  const visited = new Set<string>([focusId]);
  const queue: Array<{ id: string; depth: number }> = [
    { id: focusId, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= depth) continue;

    for (const edge of projection.edges) {
      if (edge.source !== current.id && edge.target !== current.id) continue;
      const neighbor = edge.source === current.id ? edge.target : edge.source;
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push({ id: neighbor, depth: current.depth + 1 });
    }
  }

  return {
    ...projection,
    nodes: projection.nodes.filter((node) => visited.has(node.id)),
    edges: projection.edges.filter(
      (edge) => visited.has(edge.source) && visited.has(edge.target),
    ),
  };
}

export function eaDiagramsCommand(): Command {
  const command = new Command("diagrams").description(
    "Render semantic architecture diagrams",
  );

  command
    .command("list")
    .description("List available diagram projections")
    .action(() => {
      const lines = listDiagramDefinitions().map(
        (diagram) =>
          `${diagram.name}\t${diagram.title}\tformats: ${diagram.formats.join(", ")}\t${diagram.description}`,
      );
      process.stdout.write(lines.join("\n") + "\n");
    });

  command
    .command("render")
    .description("Render a semantic diagram")
    .argument("<diagram>", "Diagram name to render")
    .option("--format <format>", "Output format: mermaid", "mermaid")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--domain <domain>", "Include only a specific domain")
    .option("--root-dir <path>", "EA root directory", "docs")
    .option(
      "--direction <dir>",
      "Diagram direction for Mermaid: TB or LR",
      "LR",
    )
    .option(
      "--focus <entity-ref>",
      "Focus on a specific entity and its neighbors",
    )
    .option("--depth <n>", "Depth for --focus traversal", "2")
    .option("--kind <kind>", "Pre-filter entities to a specific kind")
    .option(
      "--schema <schema>",
      "Pre-filter entities to a specific anchored-spec schema name",
    )
    .action(async (diagramName, options) => {
      const definition = getDiagramDefinition(diagramName as string);
      if (!definition) {
        const known = listDiagramDefinitions()
          .map((diagram) => diagram.name)
          .join(", ");
        throw new CliError(
          `Unknown diagram "${diagramName}". Available: ${known}`,
          2,
        );
      }

      const format = options.format as string;
      if (!definition.formats.includes(format as "mermaid")) {
        throw new CliError(
          `Diagram "${definition.name}" does not support format "${format}". Supported: ${definition.formats.join(", ")}`,
          2,
        );
      }

      const cwd = process.cwd();
      const eaConfig = resolveConfigV1({ rootDir: options.rootDir });
      const root = new EaRoot(cwd, eaConfig);

      if (!root.isInitialized()) {
        throw new CliError(
          "EA not initialized. Run 'anchored-spec init' first.",
          2,
        );
      }

      const result = options.domain
        ? await root.loadEntityDomain(options.domain as EaDomain)
        : await root.loadEntities();

      const diagramEntities = filterEntities(result.entities, {
        kind: options.kind as string | undefined,
        schema: options.schema as string | undefined,
      });

      if (diagramEntities.length === 0) {
        process.stdout.write("flowchart LR\n");
        return;
      }

      const lookup = buildEntityLookup(diagramEntities);
      let projection = definition.build(diagramEntities);

      if (options.focus) {
        const focusInput = options.focus as string;
        const focusEntity = lookup.byInput.get(focusInput);
        const focusId = focusEntity ? getEntityId(focusEntity) : focusInput;
        const depth = Number.parseInt(options.depth as string, 10) || 2;
        const projectionNodeIds = new Set(
          projection.nodes.map((node) => node.id),
        );

        if (!projectionNodeIds.has(focusId)) {
          const similar = suggestEntities(focusInput, diagramEntities);
          const hint =
            similar.length > 0
              ? `\n  Did you mean: ${similar.join(", ")}?`
              : "";
          throw new CliError(
            `Entity "${focusInput}" not found in diagram.${hint}`,
            1,
          );
        }

        projection = filterProjectionByFocus(projection, focusId, depth);
      }

      const output = renderMermaidDiagram(projection, {
        direction: (options.direction as "TB" | "LR") ?? "LR",
      });

      if (options.output) {
        writeFileSync(options.output as string, output + "\n");
        console.error(
          chalk.green(`✓ Diagram written to ${options.output} (${format})`),
        );
        return;
      }

      process.stdout.write(output + "\n");
    });

  return command;
}
