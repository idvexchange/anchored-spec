/**
 * Anchored Spec — Legacy Migration Tool
 *
 * Converts existing REQ/CHG/ADR artifacts to EA kinds, completing the
 * subsumption path from spec-anchored to spec-as-source.
 *
 * Design reference: docs/ea-phase2f-drift-generators-subsumption.md (Part 6)
 */

import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import type { SpecRoot } from "../core/loader.js";
import type { Requirement, Change, Decision, SemanticRefs } from "../core/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Options for the migration tool. */
export interface MigrationOptions {
  /** Only show what would be migrated, don't write files. */
  dryRun?: boolean;
  /** Restrict migration to a specific legacy kind. */
  kind?: "requirement" | "change" | "decision";
  /** Output directory for migrated artifacts. Default: "ea/legacy". */
  outputDir?: string;
}

/** Result of a single artifact migration. */
export interface MigratedArtifact {
  legacyId: string;
  newId: string;
  kind: string;
  filePath: string;
}

/** Result of the full migration. */
export interface MigrationResult {
  migratedArtifacts: MigratedArtifact[];
  errors: Array<{ legacyId: string; error: string }>;
  warnings: Array<{ legacyId: string; warning: string }>;
}

// ─── Semantic Refs → Anchors Mapping ────────────────────────────────────────────

/**
 * Map legacy `semanticRefs` to EA `anchors`.
 *
 * Mapping:
 *  - `interfaces` → `symbols`
 *  - `symbols` → `symbols` (merged)
 *  - `errorCodes` → `symbols` (prefixed with `error:`)
 *  - `routes` → `apis`
 *  - `schemas` → `schemas`
 *  - `other.*` → `other.*`
 */
export function mapSemanticRefsToAnchors(
  refs?: SemanticRefs
): Record<string, string[]> {
  if (!refs) return {};

  const anchors: Record<string, string[]> = {};

  // Build symbols from interfaces + symbols + errorCodes
  const symbols: string[] = [];
  if (refs.interfaces) symbols.push(...refs.interfaces);
  if (refs.symbols) symbols.push(...refs.symbols);
  if (refs.errorCodes) symbols.push(...refs.errorCodes.map((c) => `error:${c}`));
  if (symbols.length > 0) anchors.symbols = [...new Set(symbols)];

  // Routes → apis
  if (refs.routes && refs.routes.length > 0) {
    anchors.apis = refs.routes;
  }

  // Schemas → schemas
  if (refs.schemas && refs.schemas.length > 0) {
    anchors.schemas = refs.schemas;
  }

  // Other → other
  if (refs.other) {
    for (const [key, values] of Object.entries(refs.other)) {
      if (values && values.length > 0) {
        anchors[key] = values;
      }
    }
  }

  return anchors;
}

// ─── Individual Artifact Transformers ───────────────────────────────────────────

/** Map a legacy Requirement to an EA requirement artifact. */
export function migrateRequirement(req: Requirement): Record<string, unknown> {
  const newId = `legacy/${req.id}`;

  // Map status — legacy "full" coverageStatus becomes "covered"
  const verification = req.verification
    ? {
        coverageStatus:
          req.verification.coverageStatus === "full"
            ? "covered"
            : req.verification.coverageStatus ?? "none",
        testRefs: req.verification.testFiles ?? req.verification.testRefs?.map((t) =>
          typeof t === "string" ? t : t.path
        ),
      }
    : undefined;

  const artifact: Record<string, unknown> = {
    id: newId,
    schemaVersion: "1.0.0",
    kind: "requirement",
    title: req.title,
    status: req.status,
    summary: req.summary ?? req.description ?? "",
    owners: req.owners ?? [],
    confidence: "declared",
    anchors: mapSemanticRefsToAnchors(req.semanticRefs),
  };

  if (req.behaviorStatements && req.behaviorStatements.length > 0) {
    artifact.behaviorStatements = req.behaviorStatements;
  }
  if (verification) artifact.verification = verification;
  if (req.category) artifact.category = req.category;
  if (req.priority) artifact.priority = req.priority;
  if (req.statusReason) artifact.statusReason = req.statusReason;
  if (req.supersededBy) artifact.supersededBy = req.supersededBy;

  // Map cross-references to relations
  const relations: Array<{ type: string; target: string }> = [];
  if (req.implementation?.activeChanges) {
    for (const chg of req.implementation.activeChanges) {
      relations.push({ type: "implementedBy", target: `legacy/${chg}` });
    }
  }
  if (req.implementation?.shippedBy) {
    relations.push({
      type: "implementedBy",
      target: `legacy/${req.implementation.shippedBy}`,
    });
  }
  if (req.dependsOn) {
    for (const dep of req.dependsOn) {
      relations.push({ type: "dependsOn", target: `legacy/${dep}` });
    }
  }
  if (relations.length > 0) artifact.relations = relations;

  return artifact;
}

/** Map a legacy Change to an EA change artifact. */
export function migrateChange(chg: Change): Record<string, unknown> {
  const newId = `legacy/${chg.id}`;

  const artifact: Record<string, unknown> = {
    id: newId,
    schemaVersion: "1.0.0",
    kind: "change",
    title: chg.title,
    status: mapChangeStatus(chg.status, chg.phase),
    summary: `${chg.type} change: ${chg.title}`,
    owners: chg.owners ?? [],
    confidence: "declared",
    anchors: {},
  };

  if (chg.type) artifact.changeType = chg.type;
  if (chg.phase) artifact.phase = chg.phase;
  if (chg.status) artifact.changeStatus = chg.status;
  if (chg.scope) artifact.scope = chg.scope;
  if (chg.workflowVariant) artifact.workflowVariant = chg.workflowVariant;
  if (chg.bugfixSpec) artifact.bugfixSpec = chg.bugfixSpec;

  // Map requirements to relations
  const relations: Array<{ type: string; target: string }> = [];
  if (chg.requirements) {
    for (const reqId of chg.requirements) {
      relations.push({ type: "generates", target: `legacy/${reqId}` });
    }
  }
  if (relations.length > 0) artifact.relations = relations;

  return artifact;
}

/** Map a legacy Decision to an EA decision artifact. */
export function migrateDecision(dec: Decision): Record<string, unknown> {
  const newId = `legacy/${dec.id}`;

  const artifact: Record<string, unknown> = {
    id: newId,
    schemaVersion: "1.0.0",
    kind: "decision",
    title: dec.title,
    status: mapDecisionStatus(dec.status),
    summary: dec.decision ?? dec.title,
    owners: [],
    confidence: "declared",
    anchors: {},
  };

  if (dec.decision) artifact.decision = dec.decision;
  if (dec.context) artifact.context = dec.context;
  if (dec.rationale) artifact.rationale = dec.rationale;
  if (dec.alternatives && dec.alternatives.length > 0) {
    artifact.alternatives = dec.alternatives;
  }
  if (dec.domain) artifact.adDomain = dec.domain;
  if (dec.implications) artifact.implications = dec.implications;

  // Map related requirements to relations
  const relations: Array<{ type: string; target: string }> = [];
  if (dec.relatedRequirements) {
    for (const reqId of dec.relatedRequirements) {
      relations.push({ type: "dependsOn", target: `legacy/${reqId}` });
    }
  }
  if (relations.length > 0) artifact.relations = relations;

  return artifact;
}

// ─── Status Mapping Helpers ─────────────────────────────────────────────────────

function mapChangeStatus(status: string, phase: string): string {
  if (phase === "done" || status === "complete") return "active";
  if (status === "cancelled") return "deprecated";
  if (status === "blocked") return "draft";
  return "draft";
}

function mapDecisionStatus(status: string): string {
  switch (status) {
    case "accepted":
      return "active";
    case "superseded":
      return "deprecated";
    case "deprecated":
      return "deprecated";
    default:
      return "draft";
  }
}

// ─── Main Migration Function ────────────────────────────────────────────────────

/**
 * Migrate legacy REQ/CHG/ADR artifacts to EA format.
 *
 * - Loads artifacts via `SpecRoot`
 * - Transforms each to EA artifact shape
 * - Writes JSON files to the output directory (unless dry-run)
 * - Returns a migration report
 */
export function migrateLegacyArtifacts(
  specRoot: SpecRoot,
  options: MigrationOptions = {}
): MigrationResult {
  const outputDir = options.outputDir ?? "ea/legacy";
  const result: MigrationResult = {
    migratedArtifacts: [],
    errors: [],
    warnings: [],
  };

  // Load legacy artifacts based on kind filter
  if (!options.kind || options.kind === "requirement") {
    migrateKind(specRoot, "requirement", outputDir, options, result);
  }
  if (!options.kind || options.kind === "change") {
    migrateKind(specRoot, "change", outputDir, options, result);
  }
  if (!options.kind || options.kind === "decision") {
    migrateKind(specRoot, "decision", outputDir, options, result);
  }

  return result;
}

function migrateKind(
  specRoot: SpecRoot,
  kind: "requirement" | "change" | "decision",
  outputDir: string,
  options: MigrationOptions,
  result: MigrationResult
): void {
  const outPath = join(specRoot.projectRoot, outputDir);

  let items: Array<{ legacyId: string; artifact: Record<string, unknown> }>;

  try {
    switch (kind) {
      case "requirement": {
        const reqs = specRoot.loadRequirements();
        items = reqs.map((r) => ({
          legacyId: r.id,
          artifact: migrateRequirement(r),
        }));
        break;
      }
      case "change": {
        const chgs = specRoot.loadChanges();
        items = chgs.map((c) => ({
          legacyId: c.id,
          artifact: migrateChange(c),
        }));
        break;
      }
      case "decision": {
        const decs = specRoot.loadDecisions();
        items = decs.map((d) => ({
          legacyId: d.id,
          artifact: migrateDecision(d),
        }));
        break;
      }
    }
  } catch (err) {
    result.errors.push({
      legacyId: `<all ${kind}s>`,
      error: `Failed to load ${kind}s: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  for (const { legacyId, artifact } of items) {
    try {
      const fileName = `${legacyId}.json`;
      const filePath = join(outPath, fileName);

      if (!options.dryRun) {
        mkdirSync(outPath, { recursive: true });
        writeFileSync(filePath, JSON.stringify(artifact, null, 2) + "\n");
      }

      result.migratedArtifacts.push({
        legacyId,
        newId: artifact.id as string,
        kind,
        filePath: join(outputDir, fileName),
      });
    } catch (err) {
      result.errors.push({
        legacyId,
        error: `Failed to write: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

// ─── Report Rendering ───────────────────────────────────────────────────────────

/** Render a migration result as markdown. */
export function renderMigrationReportMarkdown(result: MigrationResult): string {
  const lines: string[] = [
    "# Legacy Migration Report",
    "",
    "## Summary",
    "",
    `| Metric | Count |`,
    `| --- | --- |`,
    `| Migrated artifacts | ${result.migratedArtifacts.length} |`,
    `| Errors | ${result.errors.length} |`,
    `| Warnings | ${result.warnings.length} |`,
    "",
  ];

  if (result.migratedArtifacts.length > 0) {
    lines.push("## Migrated Artifacts", "");
    for (const m of result.migratedArtifacts) {
      lines.push(`- **${m.legacyId}** → \`${m.newId}\` (${m.kind})`);
      lines.push(`  File: \`${m.filePath}\``);
    }
    lines.push("");
  }

  if (result.errors.length > 0) {
    lines.push("## Errors", "");
    for (const e of result.errors) {
      lines.push(`- **${e.legacyId}**: ${e.error}`);
    }
    lines.push("");
  }

  if (result.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const w of result.warnings) {
      lines.push(`- **${w.legacyId}**: ${w.warning}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
