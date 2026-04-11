/**
 * Anchored Spec — EA Impact Analysis
 *
 * Computes transitive impact sets from the EA relation graph.
 * Given an entity ref, finds everything that would be affected
 * by a change to that entity, grouped by domain, category, and score.
 *
 * Design reference: docs/workflows/review-and-analysis.md (impact workflow)
 */

import type { RelationGraph } from "./graph.js";
import { getEntityRefAliases } from "./backstage/ref-utils.js";

// ─── Impact Analysis Types ──────────────────────────────────────────────────────

export type ImpactCategory = "code" | "contracts" | "data" | "docs" | "constraints" | "ops" | "teams";

export interface ScoreBreakdown {
  distance: number;
  edgeType: number;
  confidence: number;
  canonicality: number;
  directionality: number;
  changeType: number;
}

export interface ImpactedEntity {
  /** Entity ID (ref). */
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
  /** Impact score (0–1, higher = more impacted). */
  score: number;
  /** Breakdown of individual scoring factors. */
  scoreBreakdown?: ScoreBreakdown;
  /** Impact category derived from entity kind. */
  category: ImpactCategory;
  /** Confidence level of the impact relationship. */
  confidence: "declared" | "observed" | "inferred";
}

/** @deprecated Use ImpactedEntity instead */
export type ImpactedArtifact = ImpactedEntity;

export interface ImpactCategorySummary {
  category: ImpactCategory;
  count: number;
  entities: ImpactedEntity[];
}

export interface ImpactDomainSummary {
  domain: string;
  count: number;
  entities: ImpactedEntity[];
}

export interface ImpactReport {
  /** The entity whose impact was analyzed. */
  sourceRef: string;
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
  /** Impacted entities grouped by category. */
  byCategory: ImpactCategorySummary[];
  /** All impacted entities sorted by score (descending). */
  impacted: ImpactedEntity[];
}

// ─── Scoring ────────────────────────────────────────────────────────────────────

export interface ScoringWeights {
  distance: number;
  edgeType: number;
  confidence: number;
  canonicality: number;
  directionality: number;
  changeType: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  distance: 0.25,
  edgeType: 0.25,
  confidence: 0.15,
  canonicality: 0.15,
  directionality: 0.10,
  changeType: 0.10,
};

// Edge type priority — higher number = higher impact
const EDGE_TYPE_PRIORITY: Record<string, number> = {
  implementedBy: 1.0,
  dependsOn: 0.9,
  consumes: 0.85,
  uses: 0.8,
  realizes: 0.75,
  exposes: 0.7,
  interfacesWith: 0.65,
  deploys: 0.6,
  runsOn: 0.55,
  hostedOn: 0.5,
  stores: 0.45,
  governedBy: 0.4,
  supports: 0.35,
  performedBy: 0.3,
  standardizes: 0.25,
  owns: 0.1,
  supersedes: 0.1,
  mitigates: 0.05,
};

const CONFIDENCE_SCORE: Record<string, number> = {
  declared: 1.0,
  observed: 0.7,
  inferred: 0.4,
};

// Category classification by entity kind
const KIND_TO_CATEGORY: Record<string, ImpactCategory> = {
  service: "code", application: "code", consumer: "code", platform: "code",
  "api-contract": "contracts", "event-contract": "contracts",
  "system-interface": "contracts", integration: "contracts",
  "canonical-entity": "data", "information-concept": "data",
  "physical-schema": "data", "data-store": "data", "data-product": "data",
  "glossary-term": "data", "master-data-domain": "data",
  requirement: "docs", "security-requirement": "docs",
  "data-requirement": "docs", "technical-requirement": "docs",
  "information-requirement": "docs", mission: "docs",
  "policy-objective": "docs", "value-stream": "docs",
  capability: "docs", process: "docs",
  decision: "constraints", control: "constraints",
  "runtime-cluster": "ops", "network-zone": "ops",
  "identity-boundary": "ops", "cloud-resource": "ops",
  "technology-standard": "ops", deployment: "ops",
  "org-unit": "teams",
};

function classifyCategory(kind: string): ImpactCategory {
  return KIND_TO_CATEGORY[kind] ?? "code";
}

function computeScore(
  depth: number,
  maxGraphDepth: number,
  viaRelations: string[],
  confidence: "declared" | "observed" | "inferred",
  weights: ScoringWeights,
): { score: number; breakdown: ScoreBreakdown } {
  // Distance: inverse relationship, normalized
  const distanceScore = maxGraphDepth > 0 ? 1 - (depth - 1) / maxGraphDepth : 1;

  // Edge type: max priority among via relations
  const edgeTypeScore = viaRelations.length > 0
    ? Math.max(...viaRelations.map((r) => EDGE_TYPE_PRIORITY[r] ?? 0.2))
    : 0.2;

  // Confidence
  const confidenceScore = CONFIDENCE_SCORE[confidence] ?? 0.5;

  // Canonicality: default to 0.5 (enhanced when canonical markers available)
  const canonicalityScore = 0.5;

  // Directionality: incoming edges (consumers) score higher
  const directionalityScore = 0.5;

  // Change type: contracts > code > docs
  const changeTypeScore = 0.5;

  const breakdown: ScoreBreakdown = {
    distance: distanceScore,
    edgeType: edgeTypeScore,
    confidence: confidenceScore,
    canonicality: canonicalityScore,
    directionality: directionalityScore,
    changeType: changeTypeScore,
  };

  const score = Math.min(1, Math.max(0,
    distanceScore * weights.distance +
    edgeTypeScore * weights.edgeType +
    confidenceScore * weights.confidence +
    canonicalityScore * weights.canonicality +
    directionalityScore * weights.directionality +
    changeTypeScore * weights.changeType,
  ));

  return { score, breakdown };
}

// ─── Impact Analysis ────────────────────────────────────────────────────────────

export interface ImpactOptions {
  maxDepth?: number;
  weights?: Partial<ScoringWeights>;
  minScore?: number;
  maxResults?: number;
  sortBy?: "score" | "depth";
}

/**
 * Compute a detailed impact report for a given entity.
 *
 * Uses BFS over incoming edges to find all entities transitively
 * affected by changes to the source entity.
 */
export function analyzeImpact(
  graph: RelationGraph,
  sourceRef: string,
  options?: ImpactOptions,
): ImpactReport {
  const resolvedSourceRef = getEntityRefAliases(sourceRef)
    .map((alias) => graph.node(alias)?.id)
    .find((id): id is string => !!id);
  const sourceNode = resolvedSourceRef ? graph.node(resolvedSourceRef) : undefined;
  if (!sourceNode) {
    return {
      sourceRef,
      sourceKind: "unknown",
      sourceSchema: "unknown",
      sourceTitle: sourceRef,
      totalImpacted: 0,
      maxDepth: 0,
      byDomain: [],
      byCategory: [],
      impacted: [],
    };
  }

  const maxDepth = options?.maxDepth;
  const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...options?.weights };
  const visited = new Set<string>();

  // Intermediate BFS results (before scoring)
  const bfsResults: Array<{
    id: string; kind: string; schema: string; domain: string; title: string;
    depth: number; viaRelations: string[];
    confidence: "declared" | "observed" | "inferred";
  }> = [];

  // BFS with depth tracking
  const queue: Array<{ id: string; depth: number; viaRelation: string }> = [];

  // Seed with direct dependents (incoming edges to sourceRef)
  visited.add(sourceNode.id);
  for (const edge of graph.incoming(sourceNode.id)) {
    if (!visited.has(edge.source)) {
      queue.push({ id: edge.source, depth: 1, viaRelation: edge.type });
    }
  }

  while (queue.length > 0) {
    const { id, depth, viaRelation } = queue.shift()!;
    if (visited.has(id)) {
      const existing = bfsResults.find((a) => a.id === id);
      if (existing && !existing.viaRelations.includes(viaRelation)) {
        existing.viaRelations.push(viaRelation);
      }
      continue;
    }
    visited.add(id);

    const node = graph.node(id);
    if (!node) continue;

    bfsResults.push({
      id: node.id,
      kind: node.kind,
      schema: node.schema,
      domain: node.domain,
      title: node.title,
      depth,
      viaRelations: [viaRelation],
      confidence: node.confidence,
    });

    if (maxDepth !== undefined && depth >= maxDepth) continue;

    for (const edge of graph.incoming(id)) {
      if (!visited.has(edge.source)) {
        queue.push({ id: edge.source, depth: depth + 1, viaRelation: edge.type });
      }
    }
  }

  // Compute max graph depth for score normalization
  const graphMaxDepth = bfsResults.reduce((max, a) => Math.max(max, a.depth), 0);

  // Score and classify each entity
  let impacted: ImpactedEntity[] = bfsResults.map((entry) => {
    const confidence = entry.confidence ?? "declared";
    const category = classifyCategory(entry.kind);
    const { score, breakdown } = computeScore(
      entry.depth, graphMaxDepth, entry.viaRelations, confidence, weights,
    );
    return {
      id: entry.id,
      kind: entry.kind,
      schema: entry.schema,
      domain: entry.domain,
      title: entry.title,
      depth: entry.depth,
      viaRelations: entry.viaRelations,
      score,
      scoreBreakdown: breakdown,
      category,
      confidence,
    };
  });

  // Apply minScore filter
  if (options?.minScore !== undefined) {
    impacted = impacted.filter((e) => e.score >= options.minScore!);
  }

  // Sort
  if (options?.sortBy === "depth") {
    impacted.sort((a, b) => a.depth - b.depth || b.score - a.score);
  } else {
    // Default: sort by score descending
    impacted.sort((a, b) => b.score - a.score || a.depth - b.depth);
  }

  // Apply maxResults limit
  if (options?.maxResults !== undefined && options.maxResults > 0) {
    impacted = impacted.slice(0, options.maxResults);
  }

  // Group by domain
  const domainMap = new Map<string, ImpactedEntity[]>();
  for (const e of impacted) {
    const list = domainMap.get(e.domain) ?? [];
    list.push(e);
    domainMap.set(e.domain, list);
  }
  const byDomain: ImpactDomainSummary[] = Array.from(domainMap.entries())
    .map(([domain, entities]) => ({ domain, count: entities.length, entities }))
    .sort((a, b) => b.count - a.count);

  // Group by category
  const categoryMap = new Map<ImpactCategory, ImpactedEntity[]>();
  for (const e of impacted) {
    const list = categoryMap.get(e.category) ?? [];
    list.push(e);
    categoryMap.set(e.category, list);
  }
  const byCategory: ImpactCategorySummary[] = Array.from(categoryMap.entries())
    .map(([category, entities]) => ({ category, count: entities.length, entities }))
    .sort((a, b) => b.count - a.count);

  return {
    sourceRef,
    sourceKind: sourceNode.kind,
    sourceSchema: sourceNode.schema,
    sourceTitle: sourceNode.title,
    totalImpacted: impacted.length,
    maxDepth: impacted.reduce((max, e) => Math.max(max, e.depth), 0),
    byDomain,
    byCategory,
    impacted,
  };
}

// ─── Markdown Rendering ─────────────────────────────────────────────────────────

export function renderImpactReportMarkdown(report: ImpactReport): string {
  const lines: string[] = [];

  lines.push(`# Impact Analysis: ${report.sourceTitle}`);
  lines.push("");
  lines.push(`> Source: \`${report.sourceRef}\` (${report.sourceKind}/${report.sourceSchema})`);
  lines.push(`> Total impacted: ${report.totalImpacted} entit${report.totalImpacted === 1 ? "y" : "ies"}, max depth: ${report.maxDepth}`);
  lines.push("");

  if (report.totalImpacted === 0) {
    lines.push("_No downstream impacts found._");
    lines.push("");
    return lines.join("\n");
  }

  // By Category
  lines.push("## By Category");
  lines.push("");
  lines.push("| Category | Count |");
  lines.push("|----------|-------|");
  for (const cs of report.byCategory) {
    lines.push(`| ${cs.category} | ${cs.count} |`);
  }
  lines.push("");

  // By Domain
  lines.push("## By Domain");
  lines.push("");
  lines.push("| Domain | Count |");
  lines.push("|--------|-------|");
  for (const ds of report.byDomain) {
    lines.push(`| ${ds.domain} | ${ds.count} |`);
  }
  lines.push("");

  // Detailed list with scores
  lines.push("## Impacted Entities");
  lines.push("");
  lines.push("| Score | Depth | ID | Kind | Category | Via |");
  lines.push("|-------|-------|----|------|----------|-----|");
  for (const e of report.impacted) {
    lines.push(`| ${e.score.toFixed(2)} | ${e.depth} | \`${e.id}\` | ${e.kind} | ${e.category} | ${e.viaRelations.join(", ")} |`);
  }
  lines.push("");

  return lines.join("\n");
}
