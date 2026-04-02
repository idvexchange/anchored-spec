/**
 * EA Compatibility Classifier
 *
 * Evaluates diff reports to classify changes as additive, compatible,
 * breaking, or ambiguous. Used by the version policy engine (Phase S4)
 * to enforce governed evolution.
 *
 * Design reference: plan.md §S2-A
 */

import type { EaDiffReport, EntityDiff, FieldChange } from "./diff.js";
import type { BackstageEntity } from "./backstage/types.js";
import { getEntityId, getEntityStatus } from "./backstage/accessors.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * How a change impacts backward compatibility.
 * Ordered from least to most impactful.
 */
export type CompatibilityLevel =
  | "none"        // no functional impact (metadata-only)
  | "additive"    // new capabilities, no breakage
  | "compatible"  // expected deprecation lifecycle
  | "breaking"    // consumers will break
  | "ambiguous";  // may or may not break — needs human review

export interface CompatibilityReason {
  rule: string;
  level: CompatibilityLevel;
  field: string;
  message: string;
}

export interface CompatibilityAssessment {
  entityRef: string;
  kind: string;
  schema: string;
  domain: string;
  level: CompatibilityLevel;
  reasons: CompatibilityReason[];
}

export interface CompatibilityReport {
  generatedAt: string;
  baseRef: string;
  headRef: string;
  overallLevel: CompatibilityLevel;
  summary: Record<CompatibilityLevel, number>;
  assessments: CompatibilityAssessment[];
  diffReport: EaDiffReport;
}

// ─── Rule Definitions ───────────────────────────────────────────────────────────

interface CompatibilityRule {
  id: string;
  evaluate(
    diff: EntityDiff,
    ctx: RuleContext,
  ): CompatibilityReason[];
}

interface RuleContext {
  baseEntity?: BackstageEntity;
  headEntity?: BackstageEntity;
}

/**
 * Statuses considered "live" — removal of artifacts in these states is breaking.
 */
const LIVE_STATUSES = new Set(["active", "shipped", "planned"]);

const COMPAT_RULES: CompatibilityRule[] = [
  // Artifact-level rules
  {
    id: "compat:artifact-removed",
    evaluate(diff, ctx) {
      if (diff.changeType !== "removed") return [];
      const status = ctx.baseEntity ? getEntityStatus(ctx.baseEntity) : "unknown";
      if (LIVE_STATUSES.has(status)) {
        return [{
          rule: "compat:artifact-removed",
          level: "breaking",
          field: "(artifact)",
          message: `Artifact ${diff.entityRef} removed while in ${status} state`,
        }];
      }
      return [];
    },
  },
  {
    id: "compat:artifact-removed-deprecated",
    evaluate(diff, ctx) {
      if (diff.changeType !== "removed") return [];
      if (ctx.baseEntity && getEntityStatus(ctx.baseEntity) === "deprecated") {
        return [{
          rule: "compat:artifact-removed-deprecated",
          level: "compatible",
          field: "(artifact)",
          message: `Deprecated artifact ${diff.entityRef} removed`,
        }];
      }
      return [];
    },
  },

  // Status rules
  {
    id: "compat:status-regression",
    evaluate(diff) {
      const statusChange = findFieldChange(diff, "status", "modified");
      if (!statusChange) return [];
      const oldStatus = statusChange.oldValue as string;
      const newStatus = statusChange.newValue as string;
      if (isStatusRegression(oldStatus, newStatus)) {
        return [{
          rule: "compat:status-regression",
          level: "breaking",
          field: "status",
          message: `Status regressed from ${oldStatus} to ${newStatus}`,
        }];
      }
      return [];
    },
  },
  {
    id: "compat:status-deprecation",
    evaluate(diff) {
      const statusChange = findFieldChange(diff, "status", "modified");
      if (!statusChange) return [];
      if (statusChange.newValue === "deprecated") {
        return [{
          rule: "compat:status-deprecation",
          level: "compatible",
          field: "status",
          message: `Status changed to deprecated (from ${statusChange.oldValue})`,
        }];
      }
      return [];
    },
  },

  // Relation rules
  {
    id: "compat:relation-removed",
    evaluate(diff) {
      return diff.relationChanges
        .filter((r) => r.changeType === "removed")
        .map((r) => ({
          rule: "compat:relation-removed",
          level: "breaking" as CompatibilityLevel,
          field: `relations[${r.relationType}→${r.target}]`,
          message: `Relation ${r.relationType} → ${r.target} removed`,
        }));
    },
  },
  {
    id: "compat:relation-added",
    evaluate(diff) {
      return diff.relationChanges
        .filter((r) => r.changeType === "added")
        .map((r) => ({
          rule: "compat:relation-added",
          level: "additive" as CompatibilityLevel,
          field: `relations[${r.relationType}→${r.target}]`,
          message: `Relation ${r.relationType} → ${r.target} added`,
        }));
    },
  },

  // Anchor rules
  {
    id: "compat:anchor-removed",
    evaluate(diff) {
      return diff.fieldChanges
        .filter((fc) => fc.field.startsWith("anchors.") && fc.changeType === "removed")
        .map((fc) => ({
          rule: "compat:anchor-removed",
          level: "breaking" as CompatibilityLevel,
          field: fc.field,
          message: `Anchor ${fc.field} removed${fc.oldValue ? `: ${JSON.stringify(fc.oldValue)}` : ""}`,
        }));
    },
  },
  {
    id: "compat:anchor-added",
    evaluate(diff) {
      return diff.fieldChanges
        .filter((fc) => fc.field.startsWith("anchors.") && fc.changeType === "added")
        .map((fc) => ({
          rule: "compat:anchor-added",
          level: "additive" as CompatibilityLevel,
          field: fc.field,
          message: `Anchor ${fc.field} added`,
        }));
    },
  },

  // Identity rules
  {
    id: "compat:kind-changed",
    evaluate(diff) {
      const kindChange = findFieldChange(diff, "kind", "modified");
      if (!kindChange) return [];
      return [{
        rule: "compat:kind-changed",
        level: "breaking",
        field: "kind",
        message: `Kind changed from ${kindChange.oldValue} to ${kindChange.newValue}`,
      }];
    },
  },

  // Metadata rules
  {
    id: "compat:metadata-only",
    evaluate(diff) {
      if (diff.changeType !== "modified") return [];
      if (diff.relationChanges.length > 0) return [];
      const allMetadata = diff.fieldChanges.every((fc) => fc.semantic === "metadata");
      if (allMetadata && diff.fieldChanges.length > 0) {
        return [{
          rule: "compat:metadata-only",
          level: "none",
          field: "(metadata)",
          message: "Only metadata fields changed (title, summary, tags, owners)",
        }];
      }
      return [];
    },
  },

  // Confidence rules
  {
    id: "compat:confidence-downgrade",
    evaluate(diff) {
      const confChange = findFieldChange(diff, "confidence", "modified");
      if (!confChange) return [];
      if (isConfidenceDowngrade(confChange.oldValue as string, confChange.newValue as string)) {
        return [{
          rule: "compat:confidence-downgrade",
          level: "ambiguous",
          field: "confidence",
          message: `Confidence downgraded from ${confChange.oldValue} to ${confChange.newValue}`,
        }];
      }
      return [];
    },
  },

  // Contractual field rules (generic)
  {
    id: "compat:contract-field-removed",
    evaluate(diff) {
      return diff.fieldChanges
        .filter((fc) => fc.semantic === "contractual" && fc.changeType === "removed")
        .map((fc) => ({
          rule: "compat:contract-field-removed",
          level: "breaking" as CompatibilityLevel,
          field: fc.field,
          message: `Contractual field ${fc.field} removed`,
        }));
    },
  },
  {
    id: "compat:contract-field-added",
    evaluate(diff) {
      return diff.fieldChanges
        .filter((fc) => fc.semantic === "contractual" && fc.changeType === "added")
        .map((fc) => ({
          rule: "compat:contract-field-added",
          level: "additive" as CompatibilityLevel,
          field: fc.field,
          message: `Contractual field ${fc.field} added`,
        }));
    },
  },
  {
    id: "compat:contract-field-modified",
    evaluate(diff) {
      return diff.fieldChanges
        .filter((fc) => fc.semantic === "contractual" && fc.changeType === "modified")
        .map((fc) => ({
          rule: "compat:contract-field-modified",
          level: "ambiguous" as CompatibilityLevel,
          field: fc.field,
          message: `Contractual field ${fc.field} modified`,
        }));
    },
  },

  // Owner change (no impact)
  {
    id: "compat:owner-changed",
    evaluate(diff) {
      const ownerChanges = diff.fieldChanges.filter(
        (fc) => fc.field === "owners" || fc.field.startsWith("owners["),
      );
      if (ownerChanges.length === 0) return [];
      return ownerChanges.map((fc) => ({
        rule: "compat:owner-changed",
        level: "none" as CompatibilityLevel,
        field: fc.field,
        message: "Owner changed",
      }));
    },
  },
];

// ─── Core Assessment ────────────────────────────────────────────────────────────

/**
 * Assess compatibility impact of a diff report.
 */
export function assessCompatibility(
  diffReport: EaDiffReport,
  entities?: { base: BackstageEntity[]; head: BackstageEntity[] },
): CompatibilityReport {
  const baseMap = new Map((entities?.base ?? []).map((entity) => [getEntityId(entity), entity]));
  const headMap = new Map((entities?.head ?? []).map((entity) => [getEntityId(entity), entity]));

  const assessments: CompatibilityAssessment[] = [];

  for (const diff of diffReport.diffs) {
    if (diff.changeType === "unchanged") continue;

    const ctx: RuleContext = {
      baseEntity: baseMap.get(diff.entityRef),
      headEntity: headMap.get(diff.entityRef),
    };

    const reasons: CompatibilityReason[] = [];
    for (const rule of COMPAT_RULES) {
      reasons.push(...rule.evaluate(diff, ctx));
    }

    // For added artifacts with no specific reasons, classify as additive
    if (diff.changeType === "added" && reasons.length === 0) {
      reasons.push({
        rule: "compat:artifact-added",
        level: "additive",
        field: "(artifact)",
        message: `New artifact ${diff.entityRef} added`,
      });
    }

    const level = worstLevel(reasons.map((r) => r.level));

    assessments.push({
      entityRef: diff.entityRef,
      kind: diff.kind,
      schema: diff.schema,
      domain: diff.domain,
      level,
      reasons,
    });
  }

  const summary: Record<CompatibilityLevel, number> = {
    none: 0,
    additive: 0,
    compatible: 0,
    breaking: 0,
    ambiguous: 0,
  };
  for (const a of assessments) {
    summary[a.level]++;
  }

  return {
    generatedAt: new Date().toISOString(),
    baseRef: diffReport.baseRef,
    headRef: diffReport.headRef,
    overallLevel: worstLevel(assessments.map((a) => a.level)),
    summary,
    assessments,
    diffReport,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────────

/** One-line compatibility summary. */
export function renderCompatSummary(report: CompatibilityReport): string {
  const parts: string[] = [];
  if (report.summary.breaking) parts.push(`${report.summary.breaking} breaking`);
  if (report.summary.ambiguous) parts.push(`${report.summary.ambiguous} ambiguous`);
  if (report.summary.compatible) parts.push(`${report.summary.compatible} compatible`);
  if (report.summary.additive) parts.push(`${report.summary.additive} additive`);
  if (report.summary.none) parts.push(`${report.summary.none} no-impact`);
  if (parts.length === 0) return "No changes to assess";
  return `${report.overallLevel.toUpperCase()}: ${parts.join(", ")}`;
}

/** Full markdown compatibility report. */
export function renderCompatMarkdown(report: CompatibilityReport): string {
  const lines: string[] = [];
  const icon = report.overallLevel === "breaking" ? "⛔"
    : report.overallLevel === "ambiguous" ? "⚠️"
    : report.overallLevel === "compatible" ? "🔄"
    : report.overallLevel === "additive" ? "✅"
    : "○";

  lines.push(`# Compatibility Assessment: ${report.baseRef}..${report.headRef}`);
  lines.push("");
  lines.push(`## ${icon} Overall: ${report.overallLevel.toUpperCase()} (${renderCompatSummary(report)})`);
  lines.push("");

  const sections: Array<{ title: string; level: CompatibilityLevel; icon: string }> = [
    { title: "Breaking Changes", level: "breaking", icon: "⛔" },
    { title: "Ambiguous Changes", level: "ambiguous", icon: "⚠️" },
    { title: "Compatible Changes", level: "compatible", icon: "🔄" },
    { title: "Additive Changes", level: "additive", icon: "✅" },
  ];

  for (const section of sections) {
    const items = report.assessments.filter((a) => a.level === section.level);
    if (items.length === 0) continue;

    lines.push(`### ${section.icon} ${section.title} (${items.length})`);
    lines.push("");
    lines.push("| Artifact | Kind | Schema | Rule | Reason |");
    lines.push("|----------|------|--------|------|--------|");
    for (const item of items) {
      for (const reason of item.reasons.filter((r) => r.level === section.level)) {
        lines.push(`| ${item.entityRef} | ${item.kind} | ${item.schema} | ${reason.rule} | ${reason.message} |`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function findFieldChange(
  diff: EntityDiff,
  field: string,
  changeType: FieldChange["changeType"],
): FieldChange | undefined {
  return diff.fieldChanges.find(
    (fc) => fc.field === field && fc.changeType === changeType,
  );
}

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  planned: 1,
  active: 2,
  shipped: 3,
  deprecated: 4,
  retired: 5,
  deferred: -1,
};

function isStatusRegression(oldStatus: string, newStatus: string): boolean {
  const oldOrder = STATUS_ORDER[oldStatus] ?? -2;
  const newOrder = STATUS_ORDER[newStatus] ?? -2;
  // Regression = going backward (except deferred which is lateral)
  if (newStatus === "deferred" || oldStatus === "deferred") return false;
  return newOrder < oldOrder;
}

const CONFIDENCE_ORDER: Record<string, number> = {
  declared: 2,
  observed: 1,
  inferred: 0,
};

function isConfidenceDowngrade(old: string, new_: string): boolean {
  return (CONFIDENCE_ORDER[new_] ?? 0) < (CONFIDENCE_ORDER[old] ?? 0);
}

const LEVEL_SEVERITY: Record<CompatibilityLevel, number> = {
  none: 0,
  additive: 1,
  compatible: 2,
  ambiguous: 3,
  breaking: 4,
};

function worstLevel(levels: CompatibilityLevel[]): CompatibilityLevel {
  if (levels.length === 0) return "none";
  return levels.reduce((worst, l) =>
    LEVEL_SEVERITY[l] > LEVEL_SEVERITY[worst] ? l : worst,
  );
}
