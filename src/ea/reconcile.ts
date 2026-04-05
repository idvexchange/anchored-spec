/**
 * EA Reconcile Pipeline
 *
 * Runs the full SDD control loop: generate → validate → drift
 * as a single command. Fails fast if any step produces errors.
 *
 * Design reference: plan.md §S3-A
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { BackstageEntity } from "./backstage/types.js";
import type { EaValidationError } from "./validate.js";
import { getEntityDescriptor } from "./backstage/accessors.js";
import { validateBackstageEntity, validateBackstageEntities } from "./backstage/validate.js";
import type { EaValidationResult } from "./validate.js";
import type { EaDriftReport } from "./drift.js";
import { detectEaDrift } from "./drift.js";
import type { GenerationReport } from "./generators/index.js";
import { runGenerators, listGenerators, getGenerator } from "./generators/index.js";
import { silentLogger } from "./resolvers/index.js";
import { EaRoot } from "./loader.js";
import {
  loadProjectConfig,
  getConfiguredDocScanDirs,
} from "./config.js";
import { buildTraceLinks, buildTraceCheckReport } from "./trace-analysis.js";
import type { TraceCheckReport } from "./trace-analysis.js";
import { scanDocs } from "./docs/scanner.js";
import { scanSourceAnnotations } from "./source-scanner.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ReconcileOptions {
  /** Project root directory (default: process.cwd()). */
  projectRoot?: string;
  /** EA root directory relative to project root. */
  eaRoot?: string;
  /** Generated output directory relative to project root. */
  generatedDir?: string;
  /** Promote warnings to errors. */
  strict?: boolean;
  /** Don't write generated files, just check for drift. */
  checkOnly?: boolean;
  /** Exit threshold: "error" or "warning". */
  failOn?: "error" | "warning";
  /** Skip generation step. */
  skipGenerate?: boolean;
  /** Skip drift step. */
  skipDrift?: boolean;
  /** Include trace integrity check as a step. */
  includeTrace?: boolean;
  /** Skip trace step (only relevant if includeTrace is true). */
  skipTrace?: boolean;
  /** Doc directories to scan for trace checking. */
  docDirs?: string[];
  /** Include doc consistency check as a step. */
  includeDocs?: boolean;
  /** Stop at first failing step. */
  failFast?: boolean;
  /** Filter to specific domains. */
  domains?: string[];
}

export interface ReconcileStepResult {
  step: "generate" | "validate" | "drift" | "trace" | "docs";
  passed: boolean;
  errors: number;
  warnings: number;
  details: string;
}

export interface ReconcileReport {
  passed: boolean;
  generatedAt: string;
  steps: ReconcileStepResult[];
  vcsWarnings: string[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    generationDrifts: number;
    validationErrors: number;
    driftFindings: number;
    traceIssues: number;
    docConsistencyFindings: number;
  };
  generationReport?: GenerationReport;
  validationResult?: EaValidationResult;
  driftReport?: EaDriftReport;
  traceReport?: TraceCheckReport;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────────

/**
 * Run the full reconcile pipeline: generate → validate → drift.
 */
export async function reconcileEaProject(
  options: ReconcileOptions = {},
): Promise<ReconcileReport> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const eaConfig = loadProjectConfig(projectRoot, options.eaRoot ?? "docs");
  const root = new EaRoot(projectRoot, eaConfig);

  const steps: ReconcileStepResult[] = [];
  let generationReport: GenerationReport | undefined;
  let driftReport: EaDriftReport | undefined;
  let traceReport: TraceCheckReport | undefined;

  // Load entities
  const loadResult = await root.loadEntities();
  let entities: BackstageEntity[] = loadResult.entities;

  // Apply domain filter
  if (options.domains && options.domains.length > 0) {
    entities = entities.filter((entity) =>
      options.domains!.includes(getEntityDescriptor(entity)?.domain ?? ""),
    );
  }

  // ── Step 1: Generate ───────────────────────────────────────────────────
  if (!options.skipGenerate) {
    const genResult = runGenerateStep(entities, projectRoot, eaConfig, options);
    steps.push(genResult.step);
    generationReport = genResult.report;

    if (options.failFast && !genResult.step.passed) {
      return buildReport(steps, generationReport, undefined, driftReport, traceReport);
    }
  }

  // ── Step 2: Validate ───────────────────────────────────────────────────
  const valResult = await runValidateStep(entities, loadResult.errors, options);
  steps.push(valResult.step);
  const validationResult = valResult.result;

  if (options.failFast && !valResult.step.passed) {
    return buildReport(steps, generationReport, validationResult, driftReport, traceReport);
  }

  // ── Step 3: Drift ─────────────────────────────────────────────────────
  if (!options.skipDrift) {
    const driftResult = runDriftStep(entities, options);
    steps.push(driftResult.step);
    driftReport = driftResult.report;

    if (options.failFast && !driftResult.step.passed) {
      return buildReport(steps, generationReport, validationResult, driftReport, traceReport);
    }
  }

  // ── Step 4: Trace (opt-in) ────────────────────────────────────────────
  if (options.includeTrace && !options.skipTrace) {
    const traceResult = runTraceStep(entities, projectRoot, options);
    steps.push(traceResult.step);
    traceReport = traceResult.report;
  }

  // ── Step 5: Doc Consistency (opt-in) ─────────────────────────────────
  if (options.includeDocs) {
    const docResult = await runDocConsistencyStep(entities, projectRoot);
    steps.push(docResult.step);
  }

  // ── VCS warnings ─────────────────────────────────────────────────────
  const vcsWarnings: string[] = [];
  if (!options.checkOnly) {
    const generatedDir = options.generatedDir ?? eaConfig.generatedDir ?? "docs/generated";
    const warning = checkGeneratedDirInGitignore(projectRoot, generatedDir);
    if (warning) vcsWarnings.push(warning);
  }

  return buildReport(steps, generationReport, validationResult, driftReport, traceReport, vcsWarnings);
}

// ─── Step Implementations ───────────────────────────────────────────────────────

interface GenerateStepOutput {
  step: ReconcileStepResult;
  report: GenerationReport;
}

function runGenerateStep(
  entities: BackstageEntity[],
  projectRoot: string,
  eaConfig: ReturnType<typeof loadProjectConfig>,
  options: ReconcileOptions,
): GenerateStepOutput {
  const generatorNames = listGenerators();
  const generators = generatorNames
    .map((n) => getGenerator(n))
    .filter((g): g is NonNullable<typeof g> => g !== undefined);

  const generatorConfigs = generatorNames.map((name) => ({
    name,
    outputDir: options.generatedDir ?? eaConfig.generatedDir ?? "docs/generated",
  }));

  const report = runGenerators({
    entities,
    generators,
    generatorConfigs,
    projectRoot,
    outputDir: options.generatedDir ?? eaConfig.generatedDir ?? "docs/generated",
    logger: silentLogger,
    checkOnly: options.checkOnly !== false, // default to check mode
    dryRun: false,
  });

  const drifts = report.drifts.length;
  const passed = drifts === 0;

  return {
    step: {
      step: "generate",
      passed,
      errors: drifts,
      warnings: 0,
      details: passed
        ? `${report.summary.generatorsRun} generators, ${report.summary.entitiesProcessed} entities — 0 drifts`
        : `${drifts} generation drift(s) detected`,
    },
    report,
  };
}

interface ValidateStepOutput {
  step: ReconcileStepResult;
  result: EaValidationResult;
}

async function runValidateStep(
  entities: BackstageEntity[],
  loadErrors: EaValidationError[],
  options: ReconcileOptions,
): Promise<ValidateStepOutput> {
  // Schema validation on each entity
  const schemaErrors: Array<{ path: string; message: string; severity: "error" | "warning"; rule: string }> = [];
  for (const entity of entities) {
    const schemaResult = await validateBackstageEntity(entity);
    schemaErrors.push(...schemaResult.errors, ...schemaResult.warnings);
  }

  // Quality rules
  const qualityResult = validateBackstageEntities(entities, {
    quality: options.strict ? { strictMode: true } : undefined,
  });

  const allErrors = [
    ...loadErrors.filter((e) => e.severity === "error"),
    ...schemaErrors.filter((e) => e.severity === "error"),
    ...qualityResult.errors,
  ];
  const allWarnings = [
    ...loadErrors.filter((e) => e.severity === "warning"),
    ...schemaErrors.filter((e) => e.severity === "warning"),
    ...qualityResult.warnings,
  ];

  const failOnWarning = options.failOn === "warning";
  const passed = allErrors.length === 0 && (!failOnWarning || allWarnings.length === 0);

  const result: EaValidationResult = {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };

  return {
    step: {
      step: "validate",
      passed,
      errors: allErrors.length,
      warnings: allWarnings.length,
      details: passed
        ? `${entities.length} entities validated — ${allErrors.length} errors, ${allWarnings.length} warnings`
        : `${allErrors.length} errors, ${allWarnings.length} warnings`,
    },
    result,
  };
}

interface DriftStepOutput {
  step: ReconcileStepResult;
  report: EaDriftReport;
}

function runDriftStep(
  entities: BackstageEntity[],
  options: ReconcileOptions,
): DriftStepOutput {
  const report = detectEaDrift({
    entities: entities,
    domains: options.domains,
  });

  const failOnWarning = options.failOn === "warning";
  const passed = report.summary.errors === 0 &&
    (!failOnWarning || report.summary.warnings === 0);

  return {
    step: {
      step: "drift",
      passed,
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      details: passed
        ? `${report.summary.rulesEvaluated} rules — ${report.summary.errors} errors, ${report.summary.warnings} warnings` +
          (report.summary.suppressed > 0 ? ` (${report.summary.suppressed} suppressed)` : "")
        : `${report.summary.errors} errors, ${report.summary.warnings} warnings`,
    },
    report,
  };
}

// ─── Step 4: Trace ──────────────────────────────────────────────────────────────

interface TraceStepOutput {
  step: ReconcileStepResult;
  report: TraceCheckReport;
}

function runTraceStep(
  entities: BackstageEntity[],
  projectRoot: string,
  options: ReconcileOptions,
): TraceStepOutput {
  const config = loadProjectConfig(projectRoot, options.eaRoot ?? "docs");
  const docDirs = options.docDirs ?? getConfiguredDocScanDirs(config) ?? ["docs", "specs", "."];
  const scanResult = scanDocs(projectRoot, { dirs: docDirs });
  const { docs } = scanResult;

  // Include source annotations if config enables them
  try {
    if (config.sourceAnnotations?.enabled) {
      const srcResult = scanSourceAnnotations(
        projectRoot,
        config.sourceAnnotations,
        config.sourceRoots,
        config.sourceGlobs,
      );
      docs.push(...srcResult.sources);
    }
  } catch { /* ignore config read errors */ }

  const links = buildTraceLinks(entities, docs, projectRoot);
  const report = buildTraceCheckReport(links);

  const brokenFiles = report.brokenTraceRefs.filter(
    (b) => b.reason === "file not found",
  );
  const actionableOneWay = report.oneWayEntityToDoc.filter(
    (o) => o.severity === "warning",
  );

  const errors = brokenFiles.length;
  const warnings = actionableOneWay.length + report.oneWayDocToEntity.length;
  const failOnWarning = options.failOn === "warning";
  const passed = errors === 0 && (!failOnWarning || warnings === 0);

  return {
    step: {
      step: "trace",
      passed,
      errors,
      warnings,
      details: passed
        ? `${report.bidirectionalCount} bidirectional, ${warnings} one-way warnings — ${errors} broken`
        : `${errors} broken traceRefs, ${warnings} one-way warnings`,
    },
    report,
  };
}

// ─── Step 5: Doc Consistency ────────────────────────────────────────────────────

interface DocConsistencyStepOutput {
  step: ReconcileStepResult;
}

async function runDocConsistencyStep(
  entities: BackstageEntity[],
  projectRoot: string,
): Promise<DocConsistencyStepOutput> {
  const { extractFactsFromDocs } = await import("./resolvers/markdown.js");
  const { checkConsistency } = await import("./facts/consistency.js");
  const { reconcileFactsWithEntities } = await import("./facts/reconciler.js");
  const { applySuppressions, collectSuppressions } = await import("./facts/suppression.js");

  const manifests = await extractFactsFromDocs(projectRoot);
  const consistency = checkConsistency(manifests);
  const reconciliation = reconcileFactsWithEntities(manifests, entities);

  // Apply suppressions from manifests
  const suppressions = collectSuppressions(manifests);
  applySuppressions(consistency.findings, suppressions);
  applySuppressions(reconciliation.findings, suppressions);

  const errors = consistency.findings.filter(f => f.severity === "error" && !f.suppressed).length +
    reconciliation.findings.filter(f => f.severity === "error" && !f.suppressed).length;
  const warnings = consistency.findings.filter(f => f.severity === "warning" && !f.suppressed).length +
    reconciliation.findings.filter(f => f.severity === "warning" && !f.suppressed).length;

  return {
    step: {
      step: "docs",
      passed: errors === 0,
      errors,
      warnings,
      details: `Doc consistency: ${consistency.factsAnalyzed} facts from ${consistency.documentsAnalyzed} docs, ${consistency.totalFindings} findings. Reconciliation: ${reconciliation.factsChecked} facts vs ${reconciliation.entitiesChecked} entities.`,
    },
  };
}

// ─── VCS Warning ────────────────────────────────────────────────────────────────

/**
 * Check whether the generated directory is covered by `.gitignore`.
 * Returns a warning message if not covered, or `undefined` if OK.
 */
function checkGeneratedDirInGitignore(
  projectRoot: string,
  generatedDir: string,
): string | undefined {
  const gitDir = join(projectRoot, ".git");
  if (!existsSync(gitDir)) return undefined; // not a git repo

  const gitignorePath = join(projectRoot, ".gitignore");
  if (!existsSync(gitignorePath)) {
    return `Generated files in "${generatedDir}/" are not in .gitignore. Run "anchored-spec init" or add manually.`;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  // Check if the generated dir (with or without trailing slash) is listed
  if (
    content.includes(`${generatedDir}/`) ||
    content.includes(`${generatedDir}\n`) ||
    content.includes(`/${generatedDir}`)
  ) {
    return undefined;
  }

  return `Generated files in "${generatedDir}/" are not in .gitignore. Run "anchored-spec init" or add manually.`;
}

// ─── Report Builder ─────────────────────────────────────────────────────────────

function buildReport(
  steps: ReconcileStepResult[],
  generationReport?: GenerationReport,
  validationResult?: EaValidationResult,
  driftReport?: EaDriftReport,
  traceReport?: TraceCheckReport,
  vcsWarnings: string[] = [],
): ReconcileReport {
  const totalErrors = steps.reduce((sum, s) => sum + s.errors, 0);
  const totalWarnings = steps.reduce((sum, s) => sum + s.warnings, 0);

  return {
    passed: steps.every((s) => s.passed),
    generatedAt: new Date().toISOString(),
    steps,
    vcsWarnings,
    summary: {
      totalErrors,
      totalWarnings,
      generationDrifts: generationReport?.drifts.length ?? 0,
      validationErrors: validationResult?.errors.length ?? 0,
      driftFindings: driftReport?.findings.length ?? 0,
      traceIssues: traceReport
        ? traceReport.brokenTraceRefs.length +
          traceReport.oneWayEntityToDoc.length +
          traceReport.oneWayDocToEntity.length
        : 0,
      docConsistencyFindings: steps
        .filter(s => s.step === "docs")
        .reduce((sum, s) => sum + s.errors + s.warnings, 0),
    },
    generationReport,
    validationResult,
    driftReport,
    traceReport,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────────

/** Render reconcile report as console output. */
export function renderReconcileOutput(report: ReconcileReport): string {
  const lines: string[] = [];

  for (const step of report.steps) {
    const icon = step.passed ? "✓" : "✗";
    const stepName = step.step.charAt(0).toUpperCase() + step.step.slice(1);
    lines.push(`  ${icon} ${stepName}: ${step.details}`);

    // Show individual errors for failed steps
    if (!step.passed) {
      if (step.step === "generate" && report.generationReport) {
        for (const drift of report.generationReport.drifts.slice(0, 5)) {
          lines.push(`    → ${drift.filePath}: ${drift.message}`);
        }
      }
      if (step.step === "validate" && report.validationResult) {
        for (const err of report.validationResult.errors.slice(0, 5)) {
          lines.push(`    → ${err.path}: ${err.message} (${err.rule})`);
        }
      }
      if (step.step === "drift" && report.driftReport) {
        for (const finding of report.driftReport.findings.filter((f) => !f.suppressed && f.severity === "error").slice(0, 5)) {
          lines.push(`    → ${finding.entityRef}: ${finding.message} (${finding.rule})`);
        }
      }
      if (step.step === "trace" && report.traceReport) {
        for (const broken of report.traceReport.brokenTraceRefs.filter((b) => b.reason === "file not found").slice(0, 5)) {
          lines.push(`    → ${broken.entityRef}: traceRef "${broken.path}" — file not found`);
        }
      }
      if (step.step === "docs") {
        lines.push(`    → Run "anchored-spec drift --domain docs" for detailed findings.`);
      }
    }
  }

  lines.push("");

  // VCS warnings
  if (report.vcsWarnings.length > 0) {
    for (const w of report.vcsWarnings) {
      lines.push(`  ⚠ ${w}`);
    }
    lines.push("");
  }

  const icon = report.passed ? "✓" : "✗";
  const status = report.passed ? "PASSED" : "FAILED";
  lines.push(`${icon} Reconcile ${status} (${report.summary.totalErrors} errors, ${report.summary.totalWarnings} warnings)`);

  return lines.join("\n");
}
