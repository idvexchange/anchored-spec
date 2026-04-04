import type { BackstageEntity } from "../backstage/types.js";

export type DiagramFormat = "mermaid";

export type DiagramEdgeCategory = "relation" | "hierarchy";

export interface DiagramNode {
  id: string;
  kind: string;
  title: string;
}

export interface DiagramEdge {
  source: string;
  target: string;
  type: string;
  category: DiagramEdgeCategory;
}

export interface DiagramProjection {
  key: string;
  title: string;
  description: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface DiagramDefinition {
  name: string;
  title: string;
  description: string;
  formats: DiagramFormat[];
  build(entities: BackstageEntity[]): DiagramProjection;
}
