export type {
  DiagramDefinition,
  DiagramEdge,
  DiagramEdgeCategory,
  DiagramFormat,
  DiagramNode,
  DiagramProjection,
} from "./types.js";

export { buildBackstageDiagram, backstageDiagram } from "./backstage.js";
export { getDiagramDefinition, listDiagramDefinitions } from "./registry.js";
export type { MermaidDiagramOptions } from "./renderers/mermaid.js";
export { renderMermaidDiagram } from "./renderers/mermaid.js";
