/**
 * Anchored Spec — EA Impact Analysis
 *
 * Computes transitive impact sets from the EA relation graph.
 * Given an entity ref, finds everything that would be affected
 * by a change to that entity, grouped by domain and severity.
 *
 * Design reference: docs/delivery/reporting-and-analysis.md (impact workflow)
 */

import type { RelationGraph } from "./graph.js";
import { normalizeKnownEntityRef } from "./backstage/ref-utils.js";

// ─── Impact Analysis Types ──────────────────────────────────────────────────────

export interface ImpactedEntity {
  /** Entity ref. */
  id: string;
  /** Entity kind. */
  kind: string;
  /** Anchored-spec schema profile. */
  schema: string;
  /** EA domain. */
  domain: string;
  /** Entity title. */
  title: string;
  /** Shortest distance from the source entity. */
  depth: number;
  /** The relation type(s) through which impact propagates. */
  viaRelations: string[];
}

export interface ImpactDomainSummary {
  domain: string;
  count: number;
  entities: ImpactedEntity[];
}

export interface ImpactReport {
  /** The entity whose impact was analyzed. */
  sourceId: string;
  /** Source entity kind. */
  sourceKind: string;
  /** Source entity schema profile. */
  sourceSchema: string;
  /** Source entity title. */
  sourceTitle: string;
  /** Total number of impacted entities. */
  totalImpacted: number;
  /** Maximum depth of transitive impact. */
  maxDepth: number;
  /** Impacted entities grouped by domain. */
  byDomain: ImpactDomainSummary[];
  /** All impacted entities in BFS order (closest first). */
  impacted: ImpactedEntity[];
}

// ─── Impact Analysis ────────────────────────────────────────────────────────────

/**
 * Compute a detailed impact report for a given entity.
 *
 * Uses BFS over incoming edges to find all entities transitively
 * affected by changes to the source entity.
 */
export function analyzeImpact(
  graph: RelationGraph,
  sourceId: string,
  options?: { maxDepth?: number },
): ImpactReport {
  const resolvedSourceId =
    normalizeKnownEntityRef(sourceId, { defaultNamespace: "default" }) ?? sourceId;
  const sourceNode = graph.node(resolvedSourceId);
  if (!sourceNode) {
    return {
      sourceId: resolvedSourceId,
      sourceKind: "unknown",
      sourceSchema: "unknown",
      sourceTitle: resolvedSourceId,
      totalImpacted: 0,
      maxDepth: 0,
      byDomain: [],
      impacted: [],
    };
  }

  const maxDepth = options?.maxDepth;
  const visited = new Set<string>();
  const impacted: ImpactedEntity[] = [];

  // BFS with depth tracking
  const queue: Array<{ id: string; depth: number; viaRelation: string }> = [];

  // Seed with direct dependents (incoming edges to sourceId)
  visited.add(resolvedSourceId);
  for (const edge of graph.incoming(resolvedSourceId)) {
    if (!visited.has(edge.source)) {
      queue.push({ id: edge.source, depth: 1, viaRelation: edge.type });
    }
  }

  while (queue.length > 0) {
    const { id, depth, viaRelation } = queue.shift()!;
    if (visited.has(id)) {
      // Update existing entry's viaRelations if already visited at same depth
      const existing = impacted.find((a) => a.id === id);
      if (existing && !existing.viaRelations.includes(viaRelation)) {
        existing.viaRelations.push(viaRelation);
      }
      continue;
    }
    visited.add(id);

    const node = graph.node(id);
    if (!node) continue;

    impacted.push({
      id: node.id,
      kind: node.kind,
      schema: node.schema,
      domain: node.domain,
      title: node.title,
      depth,
      viaRelations: [viaRelation],
    });

    if (maxDepth !== undefined && depth >= maxDepth) continue;

    for (const edge of graph.incoming(id)) {
      if (!visited.has(edge.source)) {
        queue.push({ id: edge.source, depth: depth + 1, viaRelation: edge.type });
      }
    }
  }

  // Group by domain
  const domainMap = new Map<string, ImpactedEntity[]>();
  for (const a of impacted) {
    const list = domainMap.get(a.domain) ?? [];
    list.push(a);
    domainMap.set(a.domain, list);
  }

  const byDomain: ImpactDomainSummary[] = Array.from(domainMap.entries())
    .map(([domain, entities]) => ({ domain, count: entities.length, entities }))
    .sort((a, b) => b.count - a.count);

  return {
    sourceId: sourceNode.id,
    sourceKind: sourceNode.kind,
    sourceSchema: sourceNode.schema,
    sourceTitle: sourceNode.title,
    totalImpacted: impacted.length,
    maxDepth: impacted.reduce((max, a) => Math.max(max, a.depth), 0),
    byDomain,
    impacted,
  };
}

// ─── Markdown Rendering ─────────────────────────────────────────────────────────

export function renderImpactReportMarkdown(report: ImpactReport): string {
  const lines: string[] = [];

  lines.push(`# Impact Analysis: ${report.sourceTitle}`);
  lines.push("");
  lines.push(`> Source: \`${report.sourceId}\` (${report.sourceKind}/${report.sourceSchema})`);
  lines.push(`> Total impacted: ${report.totalImpacted} entity(ies), max depth: ${report.maxDepth}`);
  lines.push("");

  if (report.totalImpacted === 0) {
    lines.push("_No downstream impacts found._");
    lines.push("");
    return lines.join("\n");
  }

  // Summary by domain
  lines.push("## By Domain");
  lines.push("");
  lines.push("| Domain | Count |");
  lines.push("|--------|-------|");
  for (const ds of report.byDomain) {
    lines.push(`| ${ds.domain} | ${ds.count} |`);
  }
  lines.push("");

  // Detailed list
  lines.push("## Impacted Entities");
  lines.push("");
  lines.push("| Depth | ID | Kind | Domain | Via |");
  lines.push("|-------|----|------|--------|-----|");
  for (const a of report.impacted) {
    lines.push(`| ${a.depth} | \`${a.id}\` | ${a.kind} | ${a.domain} | ${a.viaRelations.join(", ")} |`);
  }
  lines.push("");

  return lines.join("\n");
}
