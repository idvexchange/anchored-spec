/**
 * Anchored Spec — EA Evidence Pipeline Extension
 *
 * Extends the core evidence pipeline with EA-specific evidence kinds,
 * artifact references, and freshness validation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BackstageEntity } from "./backstage/types.js";
import { getEntityId, getSpecField } from "./backstage/accessors.js";

// ─── EA Evidence Types ──────────────────────────────────────────────────────────

/** EA-specific evidence kinds beyond the core "test" kind. */
export type EaEvidenceKind =
  | "test"
  | "contract"
  | "deployment"
  | "inventory"
  | "catalog"
  | "lineage"
  | "policy"
  | "security"
  | "performance";

export const EA_EVIDENCE_KINDS: readonly EaEvidenceKind[] = [
  "test",
  "contract",
  "deployment",
  "inventory",
  "catalog",
  "lineage",
  "policy",
  "security",
  "performance",
] as const;

/** An evidence record linked to an EA artifact. */
export interface EaEvidenceRecord {
  /** EA artifact ID this evidence supports. */
  artifactId: string;
  /** Evidence kind. */
  kind: EaEvidenceKind;
  /** Pass/fail status. */
  status: "passed" | "failed" | "skipped" | "error";
  /** ISO 8601 timestamp when evidence was recorded. */
  recordedAt: string;
  /** Source file or tool that produced this evidence. */
  source: string;
  /** Human-readable summary. */
  summary?: string;
  /** Duration in milliseconds. */
  duration?: number;
  /** Additional metadata from the evidence source. */
  metadata?: Record<string, unknown>;
}

/** A collection of EA evidence records. */
export interface EaEvidence {
  generatedAt: string;
  records: EaEvidenceRecord[];
}

// ─── Evidence Collection ────────────────────────────────────────────────────────

/**
 * Create an EA evidence record.
 */
export function createEaEvidenceRecord(
  artifactId: string,
  kind: EaEvidenceKind,
  status: EaEvidenceRecord["status"],
  source: string,
  options?: { summary?: string; duration?: number; metadata?: Record<string, unknown> },
): EaEvidenceRecord {
  return {
    artifactId,
    kind,
    status,
    recordedAt: new Date().toISOString(),
    source,
    summary: options?.summary,
    duration: options?.duration,
    metadata: options?.metadata,
  };
}

/**
 * Load EA evidence from a file.
 */
export function loadEaEvidence(evidencePath: string): EaEvidence | null {
  if (!existsSync(evidencePath)) return null;
  try {
    return JSON.parse(readFileSync(evidencePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write EA evidence to a file, merging with existing records.
 */
export function writeEaEvidence(
  evidence: EaEvidence,
  outputPath: string,
): void {
  const dir = join(outputPath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n");
}

/**
 * Merge new records into existing evidence, replacing records for the
 * same artifactId + kind combination.
 */
export function mergeEaEvidence(
  existing: EaEvidence | null,
  newRecords: EaEvidenceRecord[],
): EaEvidence {
  const merged = new Map<string, EaEvidenceRecord>();

  // Add existing records
  if (existing) {
    for (const r of existing.records) {
      merged.set(`${r.artifactId}::${r.kind}`, r);
    }
  }

  // Upsert new records
  for (const r of newRecords) {
    merged.set(`${r.artifactId}::${r.kind}`, r);
  }

  return {
    generatedAt: new Date().toISOString(),
    records: [...merged.values()],
  };
}

// ─── Evidence Validation ────────────────────────────────────────────────────────

export interface EaEvidenceValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
  rule: string;
}

/**
 * Validate EA evidence for freshness and coverage.
 *
 * Checks:
 * 1. All evidence records reference existing artifacts
 * 2. Evidence freshness (records older than freshnessWindowDays are stale)
 * 3. Artifacts with `producesEvidence` field have matching evidence
 */
export function validateEaEvidence(
  evidence: EaEvidence,
  entities: BackstageEntity[],
  options?: { freshnessWindowDays?: number },
): EaEvidenceValidationError[] {
  const issues: EaEvidenceValidationError[] = [];
  const entityIds = new Set(entities.map((entity) => getEntityId(entity)));

  const freshnessMs = (options?.freshnessWindowDays ?? 30) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Check each evidence record
  for (const record of evidence.records) {
    // Artifact reference exists
    if (!entityIds.has(record.artifactId)) {
      issues.push({
        path: record.artifactId,
        message: `Evidence references artifact "${record.artifactId}" which does not exist`,
        severity: "warning",
        rule: "ea:evidence/artifact-exists",
      });
    }

    // Valid evidence kind
    if (!EA_EVIDENCE_KINDS.includes(record.kind as EaEvidenceKind)) {
      issues.push({
        path: record.artifactId,
        message: `Evidence for "${record.artifactId}" has unknown kind "${record.kind}"`,
        severity: "warning",
        rule: "ea:evidence/valid-kind",
      });
    }

    // Freshness check
    const recordDate = new Date(record.recordedAt).getTime();
    if (!isNaN(recordDate) && now - recordDate > freshnessMs) {
      issues.push({
        path: record.artifactId,
        message: `Evidence for "${record.artifactId}" (${record.kind}) is stale (recorded: ${record.recordedAt})`,
        severity: "warning",
        rule: "ea:evidence/freshness",
      });
    }

    // Failed evidence
    if (record.status === "failed" || record.status === "error") {
      issues.push({
        path: record.artifactId,
        message: `Evidence for "${record.artifactId}" (${record.kind}) has status "${record.status}"`,
        severity: "error",
        rule: "ea:evidence/status",
      });
    }
  }

  // Check artifacts that produce evidence but have no records
  const evidenceByArtifact = new Map<string, EaEvidenceRecord[]>();
  for (const r of evidence.records) {
    const list = evidenceByArtifact.get(r.artifactId) ?? [];
    list.push(r);
    evidenceByArtifact.set(r.artifactId, list);
  }

  for (const entity of entities) {
    const entityId = getEntityId(entity);
    const producesEvidence = getSpecField<string[]>(entity, "producesEvidence");
    if (producesEvidence && !evidenceByArtifact.has(entityId)) {
      issues.push({
        path: entityId,
        message: `Artifact "${entityId}" declares producesEvidence but has no evidence records`,
        severity: "warning",
        rule: "ea:evidence/coverage",
      });
    }
  }

  return issues;
}

// ─── Evidence Summary ───────────────────────────────────────────────────────────

export interface EaEvidenceSummary {
  totalRecords: number;
  byKind: Record<string, number>;
  byStatus: Record<string, number>;
  staleCount: number;
  coveredArtifacts: number;
  uncoveredArtifacts: number;
}

/**
 * Build a summary of EA evidence.
 */
export function summarizeEaEvidence(
  evidence: EaEvidence,
  entities: BackstageEntity[],
  options?: { freshnessWindowDays?: number },
): EaEvidenceSummary {
  const freshnessMs = (options?.freshnessWindowDays ?? 30) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const byKind: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let staleCount = 0;
  const coveredIds = new Set<string>();

  for (const r of evidence.records) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    coveredIds.add(r.artifactId);

    const recordDate = new Date(r.recordedAt).getTime();
    if (!isNaN(recordDate) && now - recordDate > freshnessMs) {
      staleCount++;
    }
  }

  // Count artifacts that declare evidence expectations
  const entitiesWithEvidence = entities.filter((entity) => {
    const producesEvidence = getSpecField<string[]>(entity, "producesEvidence");
    return Array.isArray(producesEvidence) && producesEvidence.length > 0;
  });
  const uncoveredArtifacts = entitiesWithEvidence.filter((entity) => !coveredIds.has(getEntityId(entity))).length;

  return {
    totalRecords: evidence.records.length,
    byKind,
    byStatus,
    staleCount,
    coveredArtifacts: coveredIds.size,
    uncoveredArtifacts,
  };
}
