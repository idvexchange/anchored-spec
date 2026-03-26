/**
 * Anchored Spec — Artifact Generators
 *
 * Generate human-readable markdown from JSON spec artifacts.
 * JSON is the source of truth; markdown is the generated view.
 */

import type { Requirement, Change, Decision } from "./types.js";

// ─── Requirements Markdown ─────────────────────────────────────────────────────

/**
 * Generate a requirements index markdown document from requirement JSON files.
 */
export function generateRequirementsMarkdown(requirements: Requirement[]): string {
  const sorted = [...requirements].sort((a, b) => {
    const numA = parseInt(a.id.replace("REQ-", ""), 10);
    const numB = parseInt(b.id.replace("REQ-", ""), 10);
    return numA - numB;
  });

  const lines: string[] = [
    "# Requirements",
    "",
    "> Generated from spec JSON. Do not edit manually.",
    "",
    `**Total:** ${sorted.length} | `,
    `**Shipped:** ${sorted.filter((r) => r.status === "shipped").length} | `,
    `**Active:** ${sorted.filter((r) => r.status === "active").length} | `,
    `**Planned:** ${sorted.filter((r) => r.status === "planned").length} | `,
    `**Draft:** ${sorted.filter((r) => r.status === "draft").length}`,
    "",
    "| ID | Title | Priority | Status | Behaviors | Coverage |",
    "|---|---|---|---|---|---|",
  ];

  for (const req of sorted) {
    const coverage = req.verification?.coverageStatus ?? "none";
    const behaviorsCount = req.behaviorStatements.length;
    lines.push(
      `| ${req.id} | ${req.title} | ${req.priority} | ${req.status} | ${behaviorsCount} | ${coverage} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  // Detail sections
  for (const req of sorted) {
    lines.push(`## ${req.id}: ${req.title}`);
    lines.push("");
    lines.push(`**Priority:** ${req.priority} | **Status:** ${req.status}`);
    lines.push("");
    lines.push(req.summary);
    lines.push("");

    // Behavior statements
    lines.push("### Behavior Statements");
    lines.push("");
    for (const bs of req.behaviorStatements) {
      lines.push(`**${bs.id}:** ${bs.text}`);
      if (bs.trigger) lines.push(`- **Trigger:** ${bs.trigger}`);
      if (bs.precondition) lines.push(`- **Precondition:** ${bs.precondition}`);
      lines.push(`- **Response:** ${bs.response}`);
      lines.push("");
    }

    // Semantic refs
    if (req.semanticRefs) {
      const refs = req.semanticRefs;
      const hasRefs =
        (refs.interfaces?.length ?? 0) > 0 ||
        (refs.routes?.length ?? 0) > 0 ||
        (refs.errorCodes?.length ?? 0) > 0 ||
        (refs.symbols?.length ?? 0) > 0;

      if (hasRefs) {
        lines.push("### Semantic Anchors");
        lines.push("");
        if (refs.interfaces?.length) lines.push(`- **Interfaces:** ${refs.interfaces.join(", ")}`);
        if (refs.routes?.length) lines.push(`- **Routes:** ${refs.routes.join(", ")}`);
        if (refs.errorCodes?.length) lines.push(`- **Error Codes:** ${refs.errorCodes.join(", ")}`);
        if (refs.symbols?.length) lines.push(`- **Symbols:** ${refs.symbols.join(", ")}`);
        lines.push("");
      }
    }

    // Trace refs
    if (req.traceRefs?.length) {
      lines.push("### Trace References");
      lines.push("");
      for (const tr of req.traceRefs) {
        lines.push(`- [${tr.role}] ${tr.path}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Decisions Markdown ────────────────────────────────────────────────────────

/**
 * Generate a decisions index markdown from decision JSON files.
 */
export function generateDecisionsMarkdown(decisions: Decision[]): string {
  const sorted = [...decisions].sort((a, b) => {
    const numA = parseInt(a.id.replace("ADR-", ""), 10);
    const numB = parseInt(b.id.replace("ADR-", ""), 10);
    return numA - numB;
  });

  const lines: string[] = [
    "# Architecture Decision Records",
    "",
    "> Generated from spec JSON. Do not edit manually.",
    "",
    `**Total:** ${sorted.length} | `,
    `**Accepted:** ${sorted.filter((d) => d.status === "accepted").length} | `,
    `**Superseded:** ${sorted.filter((d) => d.status === "superseded").length}`,
    "",
    "| ID | Title | Status | Domain | Related REQs |",
    "|---|---|---|---|---|",
  ];

  for (const dec of sorted) {
    const reqs = dec.relatedRequirements.join(", ") || "—";
    lines.push(
      `| ${dec.id} | ${dec.title} | ${dec.status} | ${dec.domain ?? "—"} | ${reqs} |`
    );
  }

  lines.push("");
  lines.push("---");
  lines.push("");

  for (const dec of sorted) {
    lines.push(`## ${dec.id}: ${dec.title}`);
    lines.push("");
    lines.push(`**Status:** ${dec.status}${dec.domain ? ` | **Domain:** ${dec.domain}` : ""}`);
    lines.push("");
    lines.push(`### Decision`);
    lines.push("");
    lines.push(dec.decision);
    lines.push("");
    lines.push(`### Context`);
    lines.push("");
    lines.push(dec.context);
    lines.push("");
    lines.push(`### Rationale`);
    lines.push("");
    lines.push(dec.rationale);
    lines.push("");

    if (dec.alternatives.length > 0) {
      lines.push(`### Alternatives`);
      lines.push("");
      for (const alt of dec.alternatives) {
        lines.push(`- **${alt.name}** — ${alt.verdict}${alt.reason ? `: ${alt.reason}` : ""}`);
      }
      lines.push("");
    }

    if (dec.implications) {
      lines.push(`### Implications`);
      lines.push("");
      lines.push(dec.implications);
      lines.push("");
    }

    if (dec.relatedRequirements.length > 0) {
      lines.push(`**Related Requirements:** ${dec.relatedRequirements.join(", ")}`);
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Changes Markdown ──────────────────────────────────────────────────────────

/**
 * Generate a changes summary markdown.
 */
export function generateChangesMarkdown(changes: Change[]): string {
  const sorted = [...changes].sort((a, b) => a.id.localeCompare(b.id));

  const lines: string[] = [
    "# Change Records",
    "",
    "> Generated from spec JSON. Do not edit manually.",
    "",
    `**Total:** ${sorted.length} | `,
    `**Active:** ${sorted.filter((c) => c.status === "active").length} | `,
    `**Complete:** ${sorted.filter((c) => c.status === "complete").length}`,
    "",
    "| ID | Title | Type | Phase | Status | Requirements |",
    "|---|---|---|---|---|---|",
  ];

  for (const chg of sorted) {
    const reqs = chg.requirements?.join(", ") || "—";
    lines.push(
      `| ${chg.id} | ${chg.title} | ${chg.type} | ${chg.phase} | ${chg.status} | ${reqs} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ─── Status Dashboard ──────────────────────────────────────────────────────────

/**
 * Generate a high-level status dashboard.
 */
export function generateStatusMarkdown(
  requirements: Requirement[],
  changes: Change[],
  decisions: Decision[]
): string {
  const lines: string[] = [
    "# Spec Status Dashboard",
    "",
    "> Generated from spec JSON. Do not edit manually.",
    "",
    "## Requirements",
    "",
  ];

  const reqByStatus = new Map<string, number>();
  for (const req of requirements) {
    reqByStatus.set(req.status, (reqByStatus.get(req.status) ?? 0) + 1);
  }

  lines.push("| Status | Count |");
  lines.push("|---|---|");
  for (const [status, count] of reqByStatus) {
    lines.push(`| ${status} | ${count} |`);
  }

  lines.push("");
  lines.push("## Changes");
  lines.push("");

  const chgByStatus = new Map<string, number>();
  for (const chg of changes) {
    chgByStatus.set(chg.status, (chgByStatus.get(chg.status) ?? 0) + 1);
  }

  lines.push("| Status | Count |");
  lines.push("|---|---|");
  for (const [status, count] of chgByStatus) {
    lines.push(`| ${status} | ${count} |`);
  }

  lines.push("");
  lines.push("## Decisions");
  lines.push("");
  lines.push(
    `**Total:** ${decisions.length} | **Accepted:** ${decisions.filter((d) => d.status === "accepted").length}`
  );
  lines.push("");

  // Coverage summary
  const coveredReqs = requirements.filter(
    (r) =>
      r.verification?.coverageStatus === "full" ||
      r.verification?.coverageStatus === "partial"
  );
  const totalActive = requirements.filter(
    (r) => r.status === "active" || r.status === "shipped"
  );

  lines.push("## Coverage");
  lines.push("");
  lines.push(
    `**${coveredReqs.length}/${totalActive.length}** active/shipped requirements have test coverage.`
  );
  lines.push("");

  return lines.join("\n");
}
