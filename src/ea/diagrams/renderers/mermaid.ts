import type { DiagramNode, DiagramProjection } from "../types.js";

export interface MermaidDiagramOptions {
  direction?: "TB" | "LR";
}

function sanitizeMermaidId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function renderNode(node: DiagramNode): string {
  const id = sanitizeMermaidId(node.id);
  const label = escapeMermaidLabel(node.title);

  switch (node.kind) {
    case "Domain":
      return `  ${id}{{"${label}"}}`;
    case "System":
      return `  ${id}(("${label}"))`;
    case "API":
      return `  ${id}[["${label}"]]`;
    case "Resource":
      return `  ${id}[("${label}")]`;
    default:
      return `  ${id}["${label}"]`;
  }
}

export function renderMermaidDiagram(
  projection: DiagramProjection,
  options?: MermaidDiagramOptions,
): string {
  const direction = options?.direction ?? "LR";
  const lines: string[] = [`flowchart ${direction}`];

  for (const node of projection.nodes) {
    lines.push(renderNode(node));
  }

  lines.push("");

  for (const edge of projection.edges) {
    const source = sanitizeMermaidId(edge.source);
    const target = sanitizeMermaidId(edge.target);
    const arrow = edge.category === "hierarchy" ? "-.->" : "-->";
    lines.push(`  ${source} ${arrow}|${edge.type}| ${target}`);
  }

  return lines.join("\n");
}
