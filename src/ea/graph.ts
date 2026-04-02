/**
 * Anchored Spec — EA Relation Graph
 *
 * Builds an in-memory directed graph from Backstage entities: forward edges from
 * spec relation fields, virtual inverse edges computed via the registry.
 * Supports traversal, impact analysis, cycle detection, and export.
 *
 * Design reference: docs/systems/entity-model.md (relation graph conventions)
 */

import type { BackstageEntity } from "./backstage/types.js";
import type { EntityStatus } from "./backstage/accessors.js";
import {
  getEntityKindMapping,
  getEntityId,
  getEntityTitle,
  getEntityStatus,
  getEntityConfidence,
  getEntityLegacyKind,
  getEntitySpecRelations,
} from "./backstage/accessors.js";
import type { EaDomain } from "./types.js";
import type { RelationRegistry } from "./relation-registry.js";

// ─── Graph Types ────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  kind: string;
  domain: EaDomain | "unknown";
  status: EntityStatus;
  title: string;
  confidence: "declared" | "observed" | "inferred";
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  isVirtual: boolean;
  criticality: "low" | "medium" | "high" | "critical";
  confidence: "declared" | "observed" | "inferred";
  status: "active" | "deprecated";
}

export interface MermaidOptions {
  direction?: "TB" | "LR";
  filter?: (edge: GraphEdge) => boolean;
}

export interface DotOptions {
  filter?: (edge: GraphEdge) => boolean;
}

export interface GraphPath {
  /** The reached node. */
  node: GraphNode;
  /** Shortest distance from start. */
  depth: number;
  /** Ordered edges forming the shortest path from start to this node. */
  path: GraphEdge[];
  /** Human-readable evidence strings for each edge in the path. */
  evidence: string[];
}

export type TraversalDirection = "outgoing" | "incoming" | "both";

export interface TraverseWithPathsOptions {
  /** Direction to follow edges. Default: "incoming" (for impact analysis). */
  direction?: TraversalDirection;
  /** Maximum traversal depth. No limit if undefined. */
  maxDepth?: number;
  /** Only follow edges of these types. If empty/undefined, follow all edges. */
  edgeTypeFilter?: string[];
}

// ─── RelationGraph ──────────────────────────────────────────────────────────────

export class RelationGraph {
  private readonly nodeMap = new Map<string, GraphNode>();
  private readonly outgoingMap = new Map<string, GraphEdge[]>();
  private readonly incomingMap = new Map<string, GraphEdge[]>();

  /** All nodes in the graph. */
  nodes(): GraphNode[] {
    return Array.from(this.nodeMap.values());
  }

  /** All edges (forward + virtual inverse). */
  edges(): GraphEdge[] {
    const all: GraphEdge[] = [];
    for (const edges of this.outgoingMap.values()) {
      all.push(...edges);
    }
    return all;
  }

  /** Get a node by artifact ID. */
  node(id: string): GraphNode | undefined {
    return this.nodeMap.get(id);
  }

  /** Get all outgoing edges from an artifact. */
  outgoing(id: string): GraphEdge[] {
    return this.outgoingMap.get(id) ?? [];
  }

  /** Get all incoming edges to an artifact. */
  incoming(id: string): GraphEdge[] {
    return this.incomingMap.get(id) ?? [];
  }

  /** Get all edges of a specific type. */
  edgesOfType(type: string): GraphEdge[] {
    return this.edges().filter((e) => e.type === type);
  }

  /**
   * Traverse the graph from a start node following a specific relation type.
   * Returns all reachable nodes (BFS). `maxDepth` limits traversal depth.
   */
  traverse(startId: string, relationType: string, maxDepth?: number): GraphNode[] {
    const visited = new Set<string>();
    const result: GraphNode[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      if (id !== startId) {
        const node = this.nodeMap.get(id);
        if (node) result.push(node);
      }

      if (maxDepth !== undefined && depth >= maxDepth) continue;

      for (const edge of this.outgoing(id)) {
        if (edge.type === relationType && !visited.has(edge.target)) {
          queue.push({ id: edge.target, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  /**
   * Compute all artifacts transitively impacted by changes to the given artifact.
   * Follows all incoming edges (anything that depends on / references this artifact).
   */
  impactSet(id: string): GraphNode[] {
    const visited = new Set<string>();
    const result: GraphNode[] = [];
    const queue: string[] = [id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      if (current !== id) {
        const node = this.nodeMap.get(current);
        if (node) result.push(node);
      }

      // Follow incoming edges — anything that references this artifact is impacted
      for (const edge of this.incoming(current)) {
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    return result;
  }

  /**
   * BFS traversal that records the shortest path to each reachable node.
   * Returns a Map from node ID → GraphPath (excluding the start node).
   */
  traverseWithPaths(
    startId: string,
    options?: TraverseWithPathsOptions,
  ): Map<string, GraphPath> {
    const direction = options?.direction ?? "incoming";
    const maxDepth = options?.maxDepth;
    const edgeFilter = options?.edgeTypeFilter;
    const hasFilter = edgeFilter && edgeFilter.length > 0;

    const result = new Map<string, GraphPath>();
    const visited = new Set<string>([startId]);

    // Queue entries: [nodeId, depth, pathEdges]
    const queue: Array<[string, number, GraphEdge[]]> = [[startId, 0, []]];

    while (queue.length > 0) {
      const [currentId, depth, pathSoFar] = queue.shift()!;

      if (maxDepth !== undefined && depth >= maxDepth) continue;

      const edges = this.getEdgesForDirection(currentId, direction);

      for (const edge of edges) {
        // Apply edge type filter
        if (hasFilter && !edgeFilter!.includes(edge.type)) continue;

        const neighborId = direction === "outgoing"
          ? edge.target
          : direction === "incoming"
            ? edge.source
            : (edge.source === currentId ? edge.target : edge.source);

        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const node = this.nodeMap.get(neighborId);
        if (!node) continue;

        const newPath = [...pathSoFar, edge];
        const evidence = newPath.map(
          (e) => `${e.source} --[${e.type}]--> ${e.target}`,
        );

        result.set(neighborId, {
          node,
          depth: depth + 1,
          path: newPath,
          evidence,
        });

        queue.push([neighborId, depth + 1, newPath]);
      }
    }

    return result;
  }

  /** Get edges based on traversal direction. */
  private getEdgesForDirection(id: string, direction: TraversalDirection): GraphEdge[] {
    switch (direction) {
      case "outgoing":
        return this.outgoing(id);
      case "incoming":
        return this.incoming(id);
      case "both":
        return [...this.outgoing(id), ...this.incoming(id)];
    }
  }

  /**
   * Detect cycles for a given relation type.
   * Returns arrays of artifact IDs forming each cycle.
   */
  detectCycles(relationType: string): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      if (inStack.has(nodeId)) {
        // Found a cycle — extract from where it starts repeating
        const cycleStart = path.indexOf(nodeId);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), nodeId]);
        }
        return;
      }
      if (visited.has(nodeId)) return;

      visited.add(nodeId);
      inStack.add(nodeId);
      path.push(nodeId);

      for (const edge of this.outgoing(nodeId)) {
        if (edge.type === relationType && !edge.isVirtual) {
          dfs(edge.target, path);
        }
      }

      path.pop();
      inStack.delete(nodeId);
    };

    for (const nodeId of this.nodeMap.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return cycles;
  }

  /** Export as adjacency list JSON. */
  toAdjacencyJson(): Record<string, Array<{ target: string; type: string; virtual?: boolean }>> {
    const result: Record<string, Array<{ target: string; type: string; virtual?: boolean }>> = {};

    for (const [id, edges] of this.outgoingMap) {
      if (edges.length > 0) {
        result[id] = edges.map((e) => ({
          target: e.target,
          type: e.type,
          ...(e.isVirtual ? { virtual: true } : {}),
        }));
      }
    }

    return result;
  }

  /** Export as Mermaid graph. */
  toMermaid(options?: MermaidOptions): string {
    const direction = options?.direction ?? "LR";
    const filter = options?.filter;

    const lines: string[] = [`graph ${direction}`];

    // Node declarations
    for (const node of this.nodeMap.values()) {
      const safeId = sanitizeMermaidId(node.id);
      lines.push(`  ${safeId}["${node.title}<br/>(${node.kind})"]`);
    }

    lines.push("");

    // Edge declarations
    for (const edge of this.edges()) {
      if (edge.isVirtual) continue; // Only show forward edges by default
      if (filter && !filter(edge)) continue;
      const src = sanitizeMermaidId(edge.source);
      const tgt = sanitizeMermaidId(edge.target);
      lines.push(`  ${src} -->|${edge.type}| ${tgt}`);
    }

    return lines.join("\n");
  }

  /** Export as Graphviz DOT. */
  toDot(options?: DotOptions): string {
    const filter = options?.filter;

    const lines: string[] = [
      "digraph EA {",
      "  rankdir=LR;",
    ];

    // Node declarations
    for (const node of this.nodeMap.values()) {
      const safeId = sanitizeDotId(node.id);
      lines.push(`  ${safeId} [label="${node.title}\\n(${node.kind})"];`);
    }

    // Edge declarations
    for (const edge of this.edges()) {
      if (edge.isVirtual) continue;
      if (filter && !filter(edge)) continue;
      const src = sanitizeDotId(edge.source);
      const tgt = sanitizeDotId(edge.target);
      lines.push(`  ${src} -> ${tgt} [label="${edge.type}"];`);
    }

    lines.push("}");
    return lines.join("\n");
  }

  // ── Internal Build Methods ──────────────────────────────────────────────────

  /** @internal Add a node to the graph. */
  addNode(node: GraphNode): void {
    this.nodeMap.set(node.id, node);
    if (!this.outgoingMap.has(node.id)) this.outgoingMap.set(node.id, []);
    if (!this.incomingMap.has(node.id)) this.incomingMap.set(node.id, []);
  }

  /** @internal Add an edge to the graph. */
  addEdge(edge: GraphEdge): void {
    const out = this.outgoingMap.get(edge.source);
    if (out) out.push(edge);
    else this.outgoingMap.set(edge.source, [edge]);

    const inc = this.incomingMap.get(edge.target);
    if (inc) inc.push(edge);
    else this.incomingMap.set(edge.target, [edge]);
  }
}

// ─── Build Function ─────────────────────────────────────────────────────────────

/**
 * Build a relation graph from Backstage entities and a relation registry.
 *
 * 1. Creates a GraphNode for every entity.
 * 2. Creates forward edges from each entity's spec relation fields.
 * 3. Creates virtual inverse edges using the registry.
 * 4. If an explicit inverse exists on the target, replaces the virtual edge.
 */
export function buildRelationGraph(
  entities: BackstageEntity[],
  registry: RelationRegistry,
): RelationGraph {
  const graph = new RelationGraph();
  const entityMap = new Map<string, BackstageEntity>();

  // 1. Create nodes — use entity ref as node ID
  for (const entity of entities) {
    const nodeId = getEntityId(entity);
    const legacyKind = getEntityLegacyKind(entity);
    entityMap.set(nodeId, entity);
    graph.addNode({
      id: nodeId,
      kind: legacyKind,
      domain: getEntityKindMapping(entity)?.domain ?? "unknown",
      status: getEntityStatus(entity),
      title: getEntityTitle(entity),
      confidence: getEntityConfidence(entity),
    });
  }

  // Extract relations from all entities (exclude ownership — it's metadata, not a dependency)
  const EXCLUDED_RELATION_TYPES = new Set(["ownedBy"]);
  const entityRelations = new Map<string, Array<{ legacyType: string; targets: string[] }>>();
  for (const entity of entities) {
    const rels = getEntitySpecRelations(entity)
      .filter((r) => !EXCLUDED_RELATION_TYPES.has(r.legacyType));
    entityRelations.set(getEntityId(entity), rels);
  }

  // Collect explicit inverse relations for override detection
  const explicitInverses = new Map<string, GraphEdge>();
  for (const entity of entities) {
    const nodeId = getEntityId(entity);
    for (const { legacyType, targets } of entityRelations.get(nodeId) ?? []) {
      const entry = registry.getCanonicalEntry(legacyType);
      if (entry && legacyType === entry.inverse) {
        for (const target of targets) {
          const key = `${target}→${entry.type}→${nodeId}`;
          explicitInverses.set(key, {
            source: target,
            target: nodeId,
            type: entry.inverse,
            isVirtual: false,
            criticality: "medium",
            confidence: getEntityConfidence(entity),
            status: "active",
          });
        }
      }
    }
  }

  // 2. Create forward edges + 3. Virtual inverses
  for (const entity of entities) {
    const nodeId = getEntityId(entity);
    for (const { legacyType, targets } of entityRelations.get(nodeId) ?? []) {
      const entry = registry.get(legacyType);

      // Skip explicit inverses (handled above)
      if (!entry) {
        const canonical = registry.getCanonicalEntry(legacyType);
        if (canonical && legacyType === canonical.inverse) continue;
      }

      for (const target of targets) {
        // Forward edge
        graph.addEdge({
          source: nodeId,
          target,
          type: legacyType,
          isVirtual: false,
          criticality: "medium",
          confidence: getEntityConfidence(entity),
          status: "active",
        });

        // Virtual inverse edge
        if (entry) {
          const inverseKey = `${nodeId}→${entry.type}→${target}`;
          const explicitOverride = explicitInverses.get(inverseKey);

          if (explicitOverride) {
            graph.addEdge(explicitOverride);
          } else {
            const targetEntity = entityMap.get(target);
            graph.addEdge({
              source: target,
              target: nodeId,
              type: entry.inverse,
              isVirtual: true,
              criticality: "medium",
              confidence: targetEntity ? getEntityConfidence(targetEntity) : getEntityConfidence(entity),
              status: "active",
            });
          }
        }
      }
    }
  }

  return graph;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function sanitizeMermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function sanitizeDotId(id: string): string {
  return `"${id.replace(/"/g, '\\"')}"`;
}
