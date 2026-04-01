/**
 * Anchored Spec — Evidence Renderer
 *
 * Shared module for rendering human-readable explanations across
 * impact, trace, and drift commands. Provides consistent formatting
 * for the `--explain` flag output.
 */

import type { GraphEdge } from "./graph.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ExplainableItem {
  /** Entity or artifact ref. */
  ref: string;
  /** Entity kind (e.g., "service", "api-contract"). */
  kind: string;
  /** Human-readable title. */
  title?: string;
  /** Human-readable explanation sentence. */
  reason: string;
  /** Supporting evidence strings. */
  evidence: string[];
  /** Optional path from source to target. */
  path?: GraphEdge[];
  /** Optional score details (dimension → weighted score). */
  scoreBreakdown?: Record<string, number>;
}

// ─── Score dimension labels ─────────────────────────────────────────────────────

const SCORE_LABELS: Record<string, string> = {
  distance: "Path distance",
  edgeType: "Edge type",
  confidence: "Confidence",
  canonicality: "Canonicality",
  directionality: "Directionality",
  changeType: "Change type",
};

function scoreDimensionLabel(key: string): string {
  return SCORE_LABELS[key] ?? key;
}

// ─── Markdown rendering ─────────────────────────────────────────────────────────

function renderPathMarkdown(path: GraphEdge[]): string {
  const lines: string[] = [];
  lines.push("**Path:**");
  for (const edge of path) {
    lines.push(`- ${edge.source} →[${edge.type}]→ ${edge.target}`);
  }
  return lines.join("\n");
}

function renderScoreBreakdownMarkdown(breakdown: Record<string, number>): string {
  const lines: string[] = [];
  lines.push("**Score breakdown:**");
  for (const [key, value] of Object.entries(breakdown)) {
    lines.push(`- ${scoreDimensionLabel(key)}: ${value.toFixed(2)}`);
  }
  return lines.join("\n");
}

function renderEvidenceMarkdown(evidence: string[]): string {
  const lines: string[] = [];
  lines.push("**Evidence:**");
  for (const e of evidence) {
    lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

export function renderExplanation(item: ExplainableItem, format: "markdown" | "json"): string {
  if (format === "json") {
    return JSON.stringify(item, null, 2);
  }

  const lines: string[] = [];
  const titlePart = item.title ? ` — ${item.title}` : "";
  lines.push(`### ${item.ref} (${item.kind})${titlePart}`);
  lines.push("");
  lines.push(`**Why:** ${item.reason}`);
  lines.push("");

  if (item.scoreBreakdown && Object.keys(item.scoreBreakdown).length > 0) {
    lines.push(renderScoreBreakdownMarkdown(item.scoreBreakdown));
    lines.push("");
  }

  if (item.path && item.path.length > 0) {
    lines.push(renderPathMarkdown(item.path));
    lines.push("");
  }

  if (item.evidence.length > 0) {
    lines.push(renderEvidenceMarkdown(item.evidence));
    lines.push("");
  }

  return lines.join("\n");
}

export function renderExplanationList(items: ExplainableItem[], format: "markdown" | "json"): string {
  if (format === "json") {
    return JSON.stringify(items, null, 2);
  }

  if (items.length === 0) {
    return "_No items to explain._\n";
  }

  return items.map((item) => renderExplanation(item, "markdown")).join("\n---\n\n");
}
