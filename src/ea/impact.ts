/**
 * Anchored Spec — EA Impact Analysis
 *
 * Computes transitive impact sets from the EA relation graph.
 * Given an artifact ID, finds everything that would be affected
 * by a change to that artifact, grouped by domain and severity.
 *
 * Design reference: docs/ea-implementation-guide.md §Phase A
 */

import type { RelationGraph } from "./graph.js";

// ─── Impact Analysis Types ──────────────────────────────────────────────────────

export interface ImpactedArtifact {
  /** Artifact ID. */
  id: string;
  /** Artifact kind. */
  kind: string;
  /** EA domain. */
  domain: string;
  /** Artifact title. */
  title: string;
  /** Shortest distance from the source artifact. */
  depth: number;
  /** The relation type(s) through which impact propagates. */
  viaRelations: string[];
}

export interface ImpactDomainSummary {
  domain: string;
  count: number;
  artifacts: ImpactedArtifact[];
}

export interface ImpactReport {
  /** The artifact whose impact was analyzed. */
  sourceId: string;
  /** Source artifact kind. */
  sourceKind: string;
  /** Source artifact title. */
  sourceTitle: string;
  /** Total number of impacted artifacts. */
  totalImpacted: number;
  /** Maximum depth of transitive impact. */
  maxDepth: number;
  /** Impacted artifacts grouped by domain. */
  byDomain: ImpactDomainSummary[];
  /** All impacted artifacts in BFS order (closest first). */
  impacted: ImpactedArtifact[];
}

// ─── Impact Analysis ────────────────────────────────────────────────────────────

/**
 * Compute a detailed impact report for a given artifact.
 *
 * Uses BFS over incoming edges to find all artifacts transitively
 * affected by changes to the source artifact.
 */
export function analyzeImpact(
  graph: RelationGraph,
  sourceId: string,
  options?: { maxDepth?: number },
): ImpactReport {
  const sourceNode = graph.node(sourceId);
  if (!sourceNode) {
    return {
      sourceId,
      sourceKind: "unknown",
      sourceTitle: sourceId,
      totalImpacted: 0,
      maxDepth: 0,
      byDomain: [],
      impacted: [],
    };
  }

  const maxDepth = options?.maxDepth;
  const visited = new Set<string>();
  const impacted: ImpactedArtifact[] = [];

  // BFS with depth tracking
  const queue: Array<{ id: string; depth: number; viaRelation: string }> = [];

  // Seed with direct dependents (incoming edges to sourceId)
  visited.add(sourceId);
  for (const edge of graph.incoming(sourceId)) {
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
  const domainMap = new Map<string, ImpactedArtifact[]>();
  for (const a of impacted) {
    const list = domainMap.get(a.domain) ?? [];
    list.push(a);
    domainMap.set(a.domain, list);
  }

  const byDomain: ImpactDomainSummary[] = Array.from(domainMap.entries())
    .map(([domain, artifacts]) => ({ domain, count: artifacts.length, artifacts }))
    .sort((a, b) => b.count - a.count);

  return {
    sourceId,
    sourceKind: sourceNode.kind,
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
  lines.push(`> Source: \`${report.sourceId}\` (${report.sourceKind})`);
  lines.push(`> Total impacted: ${report.totalImpacted} artifact(s), max depth: ${report.maxDepth}`);
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
  lines.push("## Impacted Artifacts");
  lines.push("");
  lines.push("| Depth | ID | Kind | Domain | Via |");
  lines.push("|-------|----|------|--------|-----|");
  for (const a of report.impacted) {
    lines.push(`| ${a.depth} | \`${a.id}\` | ${a.kind} | ${a.domain} | ${a.viaRelations.join(", ")} |`);
  }
  lines.push("");

  return lines.join("\n");
}
