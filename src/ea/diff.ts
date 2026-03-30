/**
 * EA Spec Diff Engine
 *
 * Compares two sets of EA artifacts and produces a structured semantic diff
 * report — not YAML text diffs, but domain-aware change classifications.
 *
 * Design reference: plan.md §S1-A
 */

import type { EaArtifactBase, EaRelation, EaTraceRef } from "./types.js";
import { getDomainForKind } from "./types.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** What kind of change occurred at the artifact level. */
export type ArtifactChangeType = "added" | "removed" | "modified" | "unchanged";

/**
 * Semantic classification of a field change.
 * Used by the compatibility classifier (Phase S2) to determine impact.
 */
export type FieldSemantic =
  | "identity"      // id, kind — changes here mean reclassification
  | "metadata"      // title, summary, tags, owners
  | "structural"    // relations, anchors, traceRefs
  | "behavioral"    // status, confidence, risk
  | "contractual"   // kind-specific contract fields
  | "governance"    // compliance, extensions.driftSuppress, exceptions
  | "unknown";

/** A single field-level change within an artifact. */
export interface FieldChange {
  /** Dot-path to the field: "status", "anchors.apis[2]", "compliance.frameworks" */
  field: string;
  changeType: "added" | "removed" | "modified";
  oldValue?: unknown;
  newValue?: unknown;
  semantic: FieldSemantic;
}

/** A structured relation-level diff. */
export interface RelationDiff {
  changeType: "added" | "removed";
  relationType: string;
  target: string;
  description?: string;
}

/** Per-artifact diff result. */
export interface ArtifactDiff {
  artifactId: string;
  kind: string;
  domain: string;
  changeType: ArtifactChangeType;
  fieldChanges: FieldChange[];
  relationChanges: RelationDiff[];
}

/** Domain-level change summary. */
export interface DomainDiffSummary {
  added: number;
  removed: number;
  modified: number;
}

/** Full diff report. */
export interface EaDiffReport {
  generatedAt: string;
  baseRef: string;
  headRef: string;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
    totalFieldChanges: number;
    totalRelationChanges: number;
    bySemantic: Record<FieldSemantic, number>;
    byDomain: Record<string, DomainDiffSummary>;
  };
  diffs: ArtifactDiff[];
}

// ─── Field Semantic Mapping ─────────────────────────────────────────────────────

const BASE_FIELD_SEMANTICS: Record<string, FieldSemantic> = {
  id: "identity",
  kind: "identity",
  schemaVersion: "identity",
  title: "metadata",
  summary: "metadata",
  owners: "metadata",
  tags: "metadata",
  status: "behavioral",
  confidence: "behavioral",
  risk: "behavioral",
  relations: "structural",
  anchors: "structural",
  traceRefs: "structural",
  compliance: "governance",
  extensions: "governance",
};

/**
 * Get the semantic classification for a field.
 * Known base fields get their mapped semantic; unknown fields (kind-specific) are "contractual".
 */
export function getFieldSemantic(field: string): FieldSemantic {
  const topLevel = field.split(".")[0]?.replace(/\[.*\]/, "") ?? "";
  return BASE_FIELD_SEMANTICS[topLevel] ?? "contractual";
}

// ─── Core Diff Logic ────────────────────────────────────────────────────────────

/**
 * Compare two sets of EA artifacts and produce a structured diff report.
 */
export function diffEaArtifacts(
  base: EaArtifactBase[],
  head: EaArtifactBase[],
  options?: { baseRef?: string; headRef?: string },
): EaDiffReport {
  const baseRef = options?.baseRef ?? "base";
  const headRef = options?.headRef ?? "head";
  const baseMap = new Map(base.map((a) => [a.id, a]));
  const headMap = new Map(head.map((a) => [a.id, a]));

  const diffs: ArtifactDiff[] = [];

  // Added: in head but not in base
  for (const [id, artifact] of headMap) {
    if (!baseMap.has(id)) {
      diffs.push({
        artifactId: id,
        kind: artifact.kind,
        domain: getDomainForKind(artifact.kind) ?? "unknown",
        changeType: "added",
        fieldChanges: [],
        relationChanges: [],
      });
    }
  }

  // Removed: in base but not in head
  for (const [id, artifact] of baseMap) {
    if (!headMap.has(id)) {
      diffs.push({
        artifactId: id,
        kind: artifact.kind,
        domain: getDomainForKind(artifact.kind) ?? "unknown",
        changeType: "removed",
        fieldChanges: [],
        relationChanges: [],
      });
    }
  }

  // Modified or unchanged: in both
  for (const [id, baseArtifact] of baseMap) {
    const headArtifact = headMap.get(id);
    if (!headArtifact) continue;

    const fieldChanges = diffArtifactFields(baseArtifact, headArtifact);
    const relationChanges = diffRelations(
      baseArtifact.relations ?? [],
      headArtifact.relations ?? [],
    );

    const changeType: ArtifactChangeType =
      fieldChanges.length > 0 || relationChanges.length > 0
        ? "modified"
        : "unchanged";

    diffs.push({
      artifactId: id,
      kind: headArtifact.kind,
      domain: getDomainForKind(headArtifact.kind) ?? "unknown",
      changeType,
      fieldChanges,
      relationChanges,
    });
  }

  // Sort: added first, then removed, then modified, then unchanged
  const order: Record<ArtifactChangeType, number> = {
    added: 0,
    removed: 1,
    modified: 2,
    unchanged: 3,
  };
  diffs.sort((a, b) => order[a.changeType] - order[b.changeType]);

  return buildDiffReport(diffs, baseRef, headRef);
}

// ─── Field Diffing ──────────────────────────────────────────────────────────────

// Fields handled separately (relations have their own diff)
const SKIP_FIELDS = new Set(["relations"]);

/**
 * Produce field-level changes between two versions of the same artifact.
 */
function diffArtifactFields(
  base: EaArtifactBase,
  head: EaArtifactBase,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(head),
  ]);

  for (const key of allKeys) {
    if (SKIP_FIELDS.has(key)) continue;

    const baseVal = (base as unknown as Record<string, unknown>)[key];
    const headVal = (head as unknown as Record<string, unknown>)[key];

    if (baseVal === undefined && headVal !== undefined) {
      changes.push({
        field: key,
        changeType: "added",
        newValue: headVal,
        semantic: getFieldSemantic(key),
      });
    } else if (baseVal !== undefined && headVal === undefined) {
      changes.push({
        field: key,
        changeType: "removed",
        oldValue: baseVal,
        semantic: getFieldSemantic(key),
      });
    } else if (!deepEqual(baseVal, headVal)) {
      // For arrays and objects, produce sub-diffs where useful
      const subChanges = diffValue(key, baseVal, headVal);
      if (subChanges.length > 0) {
        changes.push(...subChanges);
      } else {
        changes.push({
          field: key,
          changeType: "modified",
          oldValue: baseVal,
          newValue: headVal,
          semantic: getFieldSemantic(key),
        });
      }
    }
  }

  return changes;
}

/**
 * Produce sub-field diffs for complex values (arrays of strings, anchors, etc.)
 */
function diffValue(
  field: string,
  baseVal: unknown,
  headVal: unknown,
): FieldChange[] {
  const semantic = getFieldSemantic(field);

  // String arrays (tags, owners): use set diff
  if (isStringArray(baseVal) && isStringArray(headVal)) {
    return diffStringArrays(field, baseVal, headVal, semantic);
  }

  // TraceRefs: use path as key
  if (field === "traceRefs" && Array.isArray(baseVal) && Array.isArray(headVal)) {
    return diffTraceRefs(baseVal as EaTraceRef[], headVal as EaTraceRef[]);
  }

  // Anchors: diff each sub-field
  if (field === "anchors" && isRecord(baseVal) && isRecord(headVal)) {
    return diffAnchors(baseVal, headVal);
  }

  return [];
}

function diffStringArrays(
  field: string,
  base: string[],
  head: string[],
  semantic: FieldSemantic,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const baseSet = new Set(base);
  const headSet = new Set(head);

  for (const val of headSet) {
    if (!baseSet.has(val)) {
      changes.push({
        field: `${field}[+]`,
        changeType: "added",
        newValue: val,
        semantic,
      });
    }
  }

  for (const val of baseSet) {
    if (!headSet.has(val)) {
      changes.push({
        field: `${field}[-]`,
        changeType: "removed",
        oldValue: val,
        semantic,
      });
    }
  }

  return changes;
}

function diffTraceRefs(base: EaTraceRef[], head: EaTraceRef[]): FieldChange[] {
  const changes: FieldChange[] = [];
  const baseByPath = new Map(base.map((r) => [r.path, r]));
  const headByPath = new Map(head.map((r) => [r.path, r]));

  for (const [path, ref] of headByPath) {
    if (!baseByPath.has(path)) {
      changes.push({
        field: `traceRefs[+]`,
        changeType: "added",
        newValue: ref,
        semantic: "structural",
      });
    } else if (!deepEqual(baseByPath.get(path), ref)) {
      changes.push({
        field: `traceRefs[${path}]`,
        changeType: "modified",
        oldValue: baseByPath.get(path),
        newValue: ref,
        semantic: "structural",
      });
    }
  }

  for (const [path, ref] of baseByPath) {
    if (!headByPath.has(path)) {
      changes.push({
        field: `traceRefs[-]`,
        changeType: "removed",
        oldValue: ref,
        semantic: "structural",
      });
    }
  }

  return changes;
}

function diffAnchors(
  base: Record<string, unknown>,
  head: Record<string, unknown>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(base), ...Object.keys(head)]);

  for (const key of allKeys) {
    const bVal = base[key];
    const hVal = head[key];
    const field = `anchors.${key}`;

    if (bVal === undefined && hVal !== undefined) {
      changes.push({ field, changeType: "added", newValue: hVal, semantic: "structural" });
    } else if (bVal !== undefined && hVal === undefined) {
      changes.push({ field, changeType: "removed", oldValue: bVal, semantic: "structural" });
    } else if (isStringArray(bVal) && isStringArray(hVal)) {
      changes.push(...diffStringArrays(field, bVal, hVal, "structural"));
    } else if (!deepEqual(bVal, hVal)) {
      changes.push({ field, changeType: "modified", oldValue: bVal, newValue: hVal, semantic: "structural" });
    }
  }

  return changes;
}

// ─── Relation Diffing ───────────────────────────────────────────────────────────

/**
 * Diff two sets of relations using (type, target) as composite key.
 */
function diffRelations(base: EaRelation[], head: EaRelation[]): RelationDiff[] {
  const diffs: RelationDiff[] = [];
  const baseKey = (r: EaRelation) => `${r.type}::${r.target}`;
  const baseSet = new Map(base.map((r) => [baseKey(r), r]));
  const headSet = new Map(head.map((r) => [baseKey(r), r]));

  for (const [key, rel] of headSet) {
    if (!baseSet.has(key)) {
      diffs.push({
        changeType: "added",
        relationType: rel.type,
        target: rel.target,
        description: rel.description,
      });
    }
  }

  for (const [key, rel] of baseSet) {
    if (!headSet.has(key)) {
      diffs.push({
        changeType: "removed",
        relationType: rel.type,
        target: rel.target,
        description: rel.description,
      });
    }
  }

  return diffs;
}

// ─── Report Builder ─────────────────────────────────────────────────────────────

function buildDiffReport(
  diffs: ArtifactDiff[],
  baseRef: string,
  headRef: string,
): EaDiffReport {
  const summary = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0,
    totalFieldChanges: 0,
    totalRelationChanges: 0,
    bySemantic: {
      identity: 0,
      metadata: 0,
      structural: 0,
      behavioral: 0,
      contractual: 0,
      governance: 0,
      unknown: 0,
    } as Record<FieldSemantic, number>,
    byDomain: {} as Record<string, DomainDiffSummary>,
  };

  for (const diff of diffs) {
    summary[diff.changeType]++;
    summary.totalFieldChanges += diff.fieldChanges.length;
    summary.totalRelationChanges += diff.relationChanges.length;

    for (const fc of diff.fieldChanges) {
      summary.bySemantic[fc.semantic] = (summary.bySemantic[fc.semantic] ?? 0) + 1;
    }

    // Relation changes count as structural
    if (diff.relationChanges.length > 0) {
      summary.bySemantic.structural =
        (summary.bySemantic.structural ?? 0) + diff.relationChanges.length;
    }

    if (diff.changeType !== "unchanged") {
      const domain = diff.domain;
      if (!summary.byDomain[domain]) {
        summary.byDomain[domain] = { added: 0, removed: 0, modified: 0 };
      }
      if (diff.changeType === "added") summary.byDomain[domain].added++;
      else if (diff.changeType === "removed") summary.byDomain[domain].removed++;
      else if (diff.changeType === "modified") summary.byDomain[domain].modified++;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    baseRef,
    headRef,
    summary,
    diffs,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────────

/** One-line summary for CI output. */
export function renderDiffSummary(report: EaDiffReport): string {
  const { added, removed, modified, totalFieldChanges, totalRelationChanges } =
    report.summary;
  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (modified) parts.push(`${modified} modified`);
  if (parts.length === 0) return "No changes detected";
  const detail =
    totalFieldChanges + totalRelationChanges > 0
      ? ` (${totalFieldChanges} field changes, ${totalRelationChanges} relation changes)`
      : "";
  return parts.join(", ") + detail;
}

/** Full markdown report. */
export function renderDiffMarkdown(report: EaDiffReport): string {
  const lines: string[] = [];
  lines.push(`# EA Spec Diff: ${report.baseRef}..${report.headRef}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- ${renderDiffSummary(report)}`);

  const semanticParts: string[] = [];
  for (const [sem, count] of Object.entries(report.summary.bySemantic)) {
    if (count > 0) semanticParts.push(`${count} ${sem}`);
  }
  if (semanticParts.length > 0) {
    lines.push(`- By semantic: ${semanticParts.join(", ")}`);
  }

  if (Object.keys(report.summary.byDomain).length > 0) {
    const domainParts = Object.entries(report.summary.byDomain)
      .map(([d, s]) => {
        const parts: string[] = [];
        if (s.added) parts.push(`+${s.added}`);
        if (s.removed) parts.push(`-${s.removed}`);
        if (s.modified) parts.push(`~${s.modified}`);
        return `${d} (${parts.join(", ")})`;
      });
    lines.push(`- By domain: ${domainParts.join("; ")}`);
  }
  lines.push("");

  // Added
  const added = report.diffs.filter((d) => d.changeType === "added");
  if (added.length > 0) {
    lines.push(`## Added (${added.length})`);
    lines.push("");
    lines.push("| Artifact | Kind | Domain |");
    lines.push("|----------|------|--------|");
    for (const d of added) {
      lines.push(`| ${d.artifactId} | ${d.kind} | ${d.domain} |`);
    }
    lines.push("");
  }

  // Removed
  const removed = report.diffs.filter((d) => d.changeType === "removed");
  if (removed.length > 0) {
    lines.push(`## Removed (${removed.length})`);
    lines.push("");
    lines.push("| Artifact | Kind | Domain |");
    lines.push("|----------|------|--------|");
    for (const d of removed) {
      lines.push(`| ${d.artifactId} | ${d.kind} | ${d.domain} |`);
    }
    lines.push("");
  }

  // Modified
  const modified = report.diffs.filter((d) => d.changeType === "modified");
  if (modified.length > 0) {
    lines.push(`## Modified (${modified.length})`);
    lines.push("");
    for (const d of modified) {
      lines.push(`### ${d.artifactId} (${d.kind}, ${d.domain})`);
      lines.push("");

      if (d.fieldChanges.length > 0) {
        lines.push("| Field | Change | Old | New | Semantic |");
        lines.push("|-------|--------|-----|-----|----------|");
        for (const fc of d.fieldChanges) {
          const old = fc.oldValue !== undefined ? truncate(JSON.stringify(fc.oldValue), 40) : "—";
          const neu = fc.newValue !== undefined ? truncate(JSON.stringify(fc.newValue), 40) : "—";
          lines.push(
            `| ${fc.field} | ${fc.changeType} | ${old} | ${neu} | ${fc.semantic} |`,
          );
        }
        lines.push("");
      }

      if (d.relationChanges.length > 0) {
        lines.push("| Relation | Change | Target |");
        lines.push("|----------|--------|--------|");
        for (const rc of d.relationChanges) {
          lines.push(
            `| ${rc.relationType} | ${rc.changeType} | ${rc.target} |`,
          );
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

// ─── Utilities ──────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((v) => typeof v === "string");
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/**
 * Deep equality for JSON-serializable values.
 * Uses canonical JSON comparison for simplicity and correctness.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k, i) => k === bKeys[i] && deepEqual(aObj[k], bObj[k]));
  }

  return false;
}
