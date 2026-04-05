import {
  getEntityDomain,
  getEntityId,
  getEntityKind,
  getEntitySpecRelations,
  getEntitySystem,
  getEntityTitle,
} from "../backstage/accessors.js";
import { normalizeEntityRef } from "../backstage/types.js";
import type { BackstageEntity } from "../backstage/types.js";
import type {
  DiagramDefinition,
  DiagramEdge,
  DiagramNode,
  DiagramProjection,
} from "./types.js";

const BACKSTAGE_DIAGRAM_KINDS = new Set([
  "Domain",
  "System",
  "Component",
  "API",
  "Resource",
]);

function isBackstageDiagramKind(kind: string): boolean {
  return BACKSTAGE_DIAGRAM_KINDS.has(kind);
}

function addEdge(
  edges: DiagramEdge[],
  seen: Set<string>,
  source: string,
  target: string,
  type: string,
  category: DiagramEdge["category"],
): void {
  const key = `${source}|${type}|${target}|${category}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ source, target, type, category });
}

export function buildBackstageDiagram(
  entities: BackstageEntity[],
): DiagramProjection {
  const scopedEntities = entities.filter((entity) =>
    isBackstageDiagramKind(getEntityKind(entity)),
  );
  const nodes: DiagramNode[] = scopedEntities.map((entity) => ({
    id: getEntityId(entity),
    kind: getEntityKind(entity),
    title: getEntityTitle(entity),
  }));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: DiagramEdge[] = [];
  const seenEdges = new Set<string>();

  for (const entity of scopedEntities) {
    const entityId = getEntityId(entity);
    const entityKind = getEntityKind(entity);

    const systemRef = getEntitySystem(entity);
    if (systemRef && entityKind !== "System") {
      const normalizedSystemRef = normalizeEntityRef(systemRef, {
        defaultKind: "System",
        defaultNamespace: "default",
      });
      if (nodeIds.has(normalizedSystemRef)) {
        addEdge(
          edges,
          seenEdges,
          entityId,
          normalizedSystemRef,
          "partOf",
          "hierarchy",
        );
      }
    }

    const domainRef = getEntityDomain(entity);
    if (domainRef && entityKind === "System") {
      const normalizedDomainRef = normalizeEntityRef(domainRef, {
        defaultKind: "Domain",
        defaultNamespace: "default",
      });
      if (nodeIds.has(normalizedDomainRef)) {
        addEdge(
          edges,
          seenEdges,
          entityId,
          normalizedDomainRef,
          "inDomain",
          "hierarchy",
        );
      }
    }

    for (const relation of getEntitySpecRelations(entity)) {
      for (const target of relation.targets) {
        if (!nodeIds.has(target)) continue;
        addEdge(edges, seenEdges, entityId, target, relation.type, "relation");
      }
    }
  }

  return {
    key: "backstage",
    title: "Backstage System View",
    description:
      "Backstage-native structural view with domains, systems, components, APIs, and resources.",
    nodes,
    edges,
  };
}

export const backstageDiagram: DiagramDefinition = {
  name: "backstage",
  title: "Backstage System View",
  description:
    "Domains, systems, components, APIs, and resources with system/domain containment.",
  formats: ["mermaid"],
  build: buildBackstageDiagram,
};
