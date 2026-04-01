/**
 * Anchored Spec — EA Constraints Surface
 *
 * Extracts governing constraints (Decision, Requirement entities) reachable
 * from a subject entity set, with path evidence.
 */

import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityId,
  getEntityTitle,
  getEntityDescription,
  getEntityTraceRefs,
} from "./backstage/accessors.js";
import type { RelationGraph, GraphEdge, GraphNode } from "./graph.js";
import type { TraversalProfileName } from "./relation-registry.js";
import { getTraversalProfile } from "./relation-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ConstraintResult {
  /** Entity ref of the constraint. */
  ref: string;
  /** Entity kind (e.g., "Decision", "Requirement"). */
  kind: string;
  /** Entity title. */
  title: string;
  /** Entity description/summary. */
  description: string;
  /** Path edges from the subject entity to this constraint. */
  path: GraphEdge[];
  /** Traversal depth. */
  depth: number;
  /** Trace refs or related docs for the constraint. */
  relatedDocs: string[];
  /** Which subject entity led to finding this constraint. */
  sourceEntityRef: string;
}

export interface ConstraintOptions {
  /** Maximum traversal depth. Default: 3. */
  maxDepth?: number;
  /** Traversal profile. Default: "strict". */
  profile?: "strict" | "contract";
  /** Output format hint (used by CLI). */
  format?: "markdown" | "json";
  /** Entities for enriched metadata (description, traceRefs). */
  entities?: BackstageEntity[];
}

// ─── Constraint kind detection ──────────────────────────────────────────────────

/** Backstage PascalCase kinds that represent governing constraints. */
const CONSTRAINT_BACKSTAGE_KINDS = new Set(["Decision", "Requirement"]);

/** Legacy kebab-case kinds that map to constraint Backstage kinds. */
const CONSTRAINT_LEGACY_KINDS = new Set([
  "requirement",
  "security-requirement",
  "data-requirement",
  "technical-requirement",
  "information-requirement",
  "decision",
  "change",
]);

/** Map legacy kind → Backstage kind for display in results. */
const LEGACY_TO_BACKSTAGE_KIND: Record<string, string> = {
  "requirement": "Requirement",
  "security-requirement": "Requirement",
  "data-requirement": "Requirement",
  "technical-requirement": "Requirement",
  "information-requirement": "Requirement",
  "decision": "Decision",
  "change": "Decision",
};

function isConstraintNode(node: GraphNode, entity?: BackstageEntity): boolean {
  if (entity && CONSTRAINT_BACKSTAGE_KINDS.has(entity.kind)) return true;
  return CONSTRAINT_LEGACY_KINDS.has(node.kind);
}

// ─── Core extraction ────────────────────────────────────────────────────────────

/**
 * Extract governing constraints (Decision/Requirement entities) reachable from
 * a set of subject entities in the relation graph.
 *
 * Uses BFS traversal with path recording. Deduplicates results by keeping the
 * shortest path when the same constraint is reachable from multiple subjects.
 */
export function extractConstraints(
  graph: RelationGraph,
  subjectRefs: string[],
  options?: ConstraintOptions,
): ConstraintResult[] {
  const maxDepth = options?.maxDepth ?? 3;
  const profileName: TraversalProfileName = options?.profile ?? "strict";
  const profile = getTraversalProfile(profileName);

  // Build entity lookup for enriched metadata
  const entityLookup = new Map<string, BackstageEntity>();
  if (options?.entities) {
    for (const entity of options.entities) {
      entityLookup.set(getEntityId(entity), entity);
    }
  }

  // Track best (shortest path) result per constraint ref
  const bestByRef = new Map<string, ConstraintResult>();

  for (const subjectRef of subjectRefs) {
    const paths = graph.traverseWithPaths(subjectRef, {
      direction: "both",
      maxDepth,
      edgeTypeFilter: profile.edgeTypes.length > 0 ? profile.edgeTypes : undefined,
    });

    for (const [nodeId, graphPath] of paths) {
      const node = graphPath.node;
      const entity = entityLookup.get(nodeId);

      if (!isConstraintNode(node, entity)) continue;

      const backstageKind =
        entity?.kind ?? LEGACY_TO_BACKSTAGE_KIND[node.kind] ?? node.kind;

      const result: ConstraintResult = {
        ref: nodeId,
        kind: backstageKind,
        title: entity ? getEntityTitle(entity) : node.title,
        description: entity ? getEntityDescription(entity) : "",
        path: graphPath.path,
        depth: graphPath.depth,
        relatedDocs: entity
          ? getEntityTraceRefs(entity).map((r) => r.path)
          : [],
        sourceEntityRef: subjectRef,
      };

      const existing = bestByRef.get(nodeId);
      if (!existing || result.depth < existing.depth) {
        bestByRef.set(nodeId, result);
      }
    }
  }

  return Array.from(bestByRef.values()).sort(
    (a, b) => a.depth - b.depth || a.ref.localeCompare(b.ref),
  );
}

// ─── Markdown rendering ─────────────────────────────────────────────────────────

/**
 * Render constraint results as a Markdown report.
 */
export function renderConstraintsMarkdown(
  results: ConstraintResult[],
  subjectRefs: string[],
): string {
  const lines: string[] = [];

  lines.push("# Governing Constraints");
  lines.push("");
  lines.push(
    `> Subject${subjectRefs.length > 1 ? "s" : ""}: ${subjectRefs.map((r) => `\`${r}\``).join(", ")}`,
  );
  lines.push(
    `> Found: ${results.length} constraint${results.length !== 1 ? "s" : ""}`,
  );
  lines.push("");

  if (results.length === 0) {
    lines.push("_No governing constraints found._");
    lines.push("");
    return lines.join("\n");
  }

  for (const c of results) {
    lines.push(`## ${c.title}`);
    lines.push("");
    lines.push(`- **Kind:** ${c.kind}`);
    lines.push(`- **Ref:** \`${c.ref}\``);
    lines.push(`- **Depth:** ${c.depth}`);
    if (c.description) {
      lines.push(`- **Description:** ${c.description}`);
    }
    lines.push(`- **Source:** \`${c.sourceEntityRef}\``);
    lines.push("");

    lines.push("**Path:**");
    for (const edge of c.path) {
      lines.push(`  ${edge.source} →[${edge.type}]→ ${edge.target}`);
    }
    lines.push("");

    if (c.relatedDocs.length > 0) {
      lines.push("**Related docs:**");
      for (const doc of c.relatedDocs) {
        lines.push(`  - ${doc}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
