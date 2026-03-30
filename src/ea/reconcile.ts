/**
 * EA Reconcile Pipeline
 *
 * Runs the full SDD control loop: generate → validate → drift
 * as a single command. Fails fast if any step produces errors.
 *
 * Design reference: plan.md §S3-A
 */

import type { EaArtifactBase } from "./types.js";
import type { EaValidationResult } from "./validate.js";
import { validateEaSchema, validateEaArtifacts } from "./validate.js";
import type { EaDriftReport } from "./drift.js";
import { detectEaDrift } from "./drift.js";
import type { GenerationReport } from "./generators/index.js";
import { runGenerators, listGenerators, getGenerator } from "./generators/index.js";
import { silentLogger } from "./resolvers/index.js";
import { EaRoot } from "./loader.js";
import { resolveEaConfig } from "./config.js";

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
  /** Auto-fix validation issues before validating. */
  fix?: boolean;
  /** Don't write generated files, just check for drift. */
  checkOnly?: boolean;
  /** Exit threshold: "error" or "warning". */
  failOn?: "error" | "warning";
  /** Skip generation step. */
  skipGenerate?: boolean;
  /** Skip drift step. */
  skipDrift?: boolean;
  /** Stop at first failing step. */
  failFast?: boolean;
  /** Filter to specific domains. */
  domains?: string[];
}

export interface ReconcileStepResult {
  step: "generate" | "validate" | "drift";
  passed: boolean;
  errors: number;
  warnings: number;
  details: string;
}

export interface ReconcileReport {
  passed: boolean;
  generatedAt: string;
  steps: ReconcileStepResult[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    generationDrifts: number;
    validationErrors: number;
    driftFindings: number;
  };
  generationReport?: GenerationReport;
  validationResult?: EaValidationResult;
  driftReport?: EaDriftReport;
}

// ─── Pipeline ───────────────────────────────────────────────────────────────────

/**
 * Run the full reconcile pipeline: generate → validate → drift.
 */
export async function reconcileEaProject(
  options: ReconcileOptions = {},
): Promise<ReconcileReport> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const eaConfig = resolveEaConfig({ rootDir: options.eaRoot ?? "ea" });
  const root = new EaRoot(projectRoot, {
    specDir: "specs",
    outputDir: "output",
    ea: eaConfig,
  } as never);

  const steps: ReconcileStepResult[] = [];
  let generationReport: GenerationReport | undefined;
  let driftReport: EaDriftReport | undefined;

  // Load artifacts
  const loadResult = await root.loadArtifacts();
  let artifacts: EaArtifactBase[] = loadResult.artifacts;

  // Apply domain filter
  if (options.domains && options.domains.length > 0) {
    const { getDomainForKind } = await import("./types.js");
    artifacts = artifacts.filter((a) =>
      options.domains!.includes(getDomainForKind(a.kind) ?? ""),
    );
  }

  // ── Step 1: Generate ───────────────────────────────────────────────────
  if (!options.skipGenerate) {
    const genResult = runGenerateStep(artifacts, projectRoot, eaConfig, options);
    steps.push(genResult.step);
    generationReport = genResult.report;

    if (options.failFast && !genResult.step.passed) {
      return buildReport(steps, generationReport, undefined, driftReport);
    }
  }

  // ── Step 2: Validate ───────────────────────────────────────────────────
  const valResult = runValidateStep(artifacts, loadResult, options);
  steps.push(valResult.step);
  const validationResult = valResult.result;

  if (options.failFast && !valResult.step.passed) {
    return buildReport(steps, generationReport, validationResult, driftReport);
  }

  // ── Step 3: Drift ─────────────────────────────────────────────────────
  if (!options.skipDrift) {
    const driftResult = runDriftStep(artifacts, options);
    steps.push(driftResult.step);
    driftReport = driftResult.report;
  }

  return buildReport(steps, generationReport, validationResult, driftReport);
}

// ─── Step Implementations ───────────────────────────────────────────────────────

interface GenerateStepOutput {
  step: ReconcileStepResult;
  report: GenerationReport;
}

function runGenerateStep(
  artifacts: EaArtifactBase[],
  projectRoot: string,
  eaConfig: ReturnType<typeof resolveEaConfig>,
  options: ReconcileOptions,
): GenerateStepOutput {
  const generatorNames = listGenerators();
  const generators = generatorNames
    .map((n) => getGenerator(n))
    .filter((g): g is NonNullable<typeof g> => g !== undefined);

  const generatorConfigs = generatorNames.map((name) => ({
    name,
    outputDir: options.generatedDir ?? eaConfig.generatedDir ?? "ea/generated",
  }));

  const report = runGenerators({
    artifacts,
    generators,
    generatorConfigs,
    projectRoot,
    outputDir: options.generatedDir ?? eaConfig.generatedDir ?? "ea/generated",
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
        ? `${report.summary.generatorsRun} generators, ${report.summary.artifactsProcessed} artifacts — 0 drifts`
        : `${drifts} generation drift(s) detected`,
    },
    report,
  };
}

interface ValidateStepOutput {
  step: ReconcileStepResult;
  result: EaValidationResult;
}

function runValidateStep(
  artifacts: EaArtifactBase[],
  _loadResult: { errors: Array<{ path: string; message: string }> },
  options: ReconcileOptions,
): ValidateStepOutput {
  // Schema validation on each artifact
  const schemaErrors: Array<{ path: string; message: string; severity: "error" | "warning"; rule: string }> = [];
  for (const artifact of artifacts) {
    const schemaResult = validateEaSchema(artifact);
    schemaErrors.push(...schemaResult.errors, ...schemaResult.warnings);
  }

  // Quality rules
  const qualityResult = validateEaArtifacts(artifacts, {
    quality: options.strict ? { strictMode: true } : undefined,
  });

  const allErrors = [
    ...schemaErrors.filter((e) => e.severity === "error"),
    ...qualityResult.errors,
  ];
  const allWarnings = [
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
        ? `${artifacts.length} artifacts validated — ${allErrors.length} errors, ${allWarnings.length} warnings`
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
  artifacts: EaArtifactBase[],
  options: ReconcileOptions,
): DriftStepOutput {
  const report = detectEaDrift({
    artifacts,
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

// ─── Report Builder ─────────────────────────────────────────────────────────────

function buildReport(
  steps: ReconcileStepResult[],
  generationReport?: GenerationReport,
  validationResult?: EaValidationResult,
  driftReport?: EaDriftReport,
): ReconcileReport {
  const totalErrors = steps.reduce((sum, s) => sum + s.errors, 0);
  const totalWarnings = steps.reduce((sum, s) => sum + s.warnings, 0);

  return {
    passed: steps.every((s) => s.passed),
    generatedAt: new Date().toISOString(),
    steps,
    summary: {
      totalErrors,
      totalWarnings,
      generationDrifts: generationReport?.drifts.length ?? 0,
      validationErrors: validationResult?.errors.length ?? 0,
      driftFindings: driftReport?.findings.length ?? 0,
    },
    generationReport,
    validationResult,
    driftReport,
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
          lines.push(`    → ${finding.artifactId}: ${finding.message} (${finding.rule})`);
        }
      }
    }
  }

  lines.push("");
  const icon = report.passed ? "✓" : "✗";
  const status = report.passed ? "PASSED" : "FAILED";
  lines.push(`${icon} Reconcile ${status} (${report.summary.totalErrors} errors, ${report.summary.totalWarnings} warnings)`);

  return lines.join("\n");
}
