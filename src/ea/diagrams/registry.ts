import { backstageDiagram } from "./backstage.js";
import type { DiagramDefinition } from "./types.js";

const DIAGRAM_DEFINITIONS: readonly DiagramDefinition[] = [backstageDiagram];

export function listDiagramDefinitions(): readonly DiagramDefinition[] {
  return DIAGRAM_DEFINITIONS;
}

export function getDiagramDefinition(
  name: string,
): DiagramDefinition | undefined {
  return DIAGRAM_DEFINITIONS.find((diagram) => diagram.name === name);
}
