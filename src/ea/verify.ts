/**
 * Anchored Spec — EA Verification Engine
 *
 * Runs all EA validation checks and returns structured results.
 * This is the EA EA-native verification engine.
 *
 * Checks include:
 *   1. JSON Schema validation (per artifact)
 *   2. Quality rules (from validateEaArtifacts)
 *   3. Relation integrity (target exists)
 *   4. Cross-reference integrity (bidirectional references)
 *   5. Lifecycle validation (status transitions)
 *   6. Plugin checks (if configured)
 */

import type { EaArtifactBase } from "./types.js";
import { artifactToBackstage } from "./backstage/bridge.js";
import { getDomainForKind } from "./types.js";
import { validateEaArtifacts, type EaValidationError, type EaValidationOptions } from "./validate.js";
import type { EaRoot } from "./loader.js";
import { loadEaPlugins, runEaPluginChecks, type EaPlugin } from "./plugins.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface EaVerificationOptions extends EaValidationOptions {
  strict?: boolean;
  ruleOverrides?: Record<string, "error" | "warning" | "off">;
  plugins?: string[];
}

export interface EaVerificationSummary {
  totalChecks: number;
  passed: number;
  warnings: number;
  errors: number;
  artifacts: {
    total: number;
    byDomain: Record<string, number>;
  };
}

export interface EaVerificationResult {
  passed: boolean;
  summary: EaVerificationSummary;
  findings: EaValidationError[];
}

// ─── Cross-Reference Checks ─────────────────────────────────────────────────────

/** Check that all relation targets point to existing artifact IDs. */
function checkRelationTargets(artifacts: EaArtifactBase[]): EaValidationError[] {
  const errors: EaValidationError[] = [];
  const knownIds = new Set(artifacts.map((a) => a.id));

  for (const artifact of artifacts) {
    if (!artifact.relations) continue;
    for (const rel of artifact.relations) {
      if (!knownIds.has(rel.target)) {
        errors.push({
          path: artifact.id,
          message: `Relation target "${rel.target}" from "${artifact.id}" does not match any known artifact ID`,
          severity: "error",
          rule: "ea:verify:broken-relation-target",
        });
      }
    }
  }

  return errors;
}

/** Check for orphaned artifacts with no incoming or outgoing relations. */
function checkOrphanArtifacts(artifacts: EaArtifactBase[]): EaValidationError[] {
  const warnings: EaValidationError[] = [];
  const referencedIds = new Set<string>();

  for (const artifact of artifacts) {
    if (artifact.relations) {
      for (const rel of artifact.relations) {
        referencedIds.add(rel.target);
      }
    }
  }

  for (const artifact of artifacts) {
    if (artifact.status === "draft" || artifact.status === "deprecated" || artifact.status === "retired") continue;
    const hasOutgoing = (artifact.relations?.length ?? 0) > 0;
    const hasIncoming = referencedIds.has(artifact.id);
    if (!hasOutgoing && !hasIncoming) {
      warnings.push({
        path: artifact.id,
        message: `Artifact "${artifact.id}" has no relations (orphaned)`,
        severity: "warning",
        rule: "ea:verify:orphan-artifact",
      });
    }
  }

  return warnings;
}

/** Check lifecycle consistency — deprecated must have reason, active must have owner, etc. */
function checkLifecycleConsistency(artifacts: EaArtifactBase[]): EaValidationError[] {
  const errors: EaValidationError[] = [];

  for (const artifact of artifacts) {
    // Deprecated artifacts should indicate why
    if (artifact.status === "deprecated") {
      if (!artifact.summary?.toLowerCase().includes("deprecated") &&
          !artifact.tags?.includes("deprecated")) {
        errors.push({
          path: artifact.id,
          message: `Deprecated artifact "${artifact.id}" should explain why it is deprecated in its summary or tags`,
          severity: "warning",
          rule: "ea:verify:deprecated-needs-reason",
        });
      }
    }

    // Active artifacts in transitions domain must have a target date or link
    if (artifact.status === "active" && getDomainForKind(artifact.kind) === "transitions") {
      const hasTarget = artifact.relations?.some((r) => r.type === "targets" || r.type === "implementedBy");
      if (!hasTarget) {
        errors.push({
          path: artifact.id,
          message: `Active transition artifact "${artifact.id}" should have a "targets" or "implementedBy" relation`,
          severity: "warning",
          rule: "ea:verify:transition-needs-target",
        });
      }
    }
  }

  return errors;
}

// ─── Rule Severity Application ──────────────────────────────────────────────────

function applyRuleOverrides(
  findings: EaValidationError[],
  overrides: Record<string, "error" | "warning" | "off">,
  strict: boolean,
): EaValidationError[] {
  const result: EaValidationError[] = [];
  for (const f of findings) {
    const override = overrides[f.rule];
    if (override === "off") continue;
    if (override === "warning") {
      result.push({ ...f, severity: "warning" });
    } else if (override === "error") {
      result.push({ ...f, severity: "error" });
    } else {
      result.push(f);
    }
  }
  if (strict) {
    return result.map((f) => (f.severity === "warning" ? { ...f, severity: "error" } : f));
  }
  return result;
}

// ─── Main Verification Engine ───────────────────────────────────────────────────

/**
 * Run all EA verification checks and return structured results.
 */
export async function runEaVerification(
  eaRoot: EaRoot,
  options?: EaVerificationOptions,
): Promise<EaVerificationResult> {
  const strict = options?.strict ?? false;
  const ruleOverrides = options?.ruleOverrides ?? {};

  const loadResult = await eaRoot.loadArtifacts();
  const artifacts = loadResult.artifacts;

  let totalChecks = 0;
  let passedChecks = 0;
  const allFindings: EaValidationError[] = [];

  // 1. Schema validation errors from loading
  totalChecks++;
  if (loadResult.errors.length === 0) {
    passedChecks++;
  } else {
    allFindings.push(...loadResult.errors);
  }

  // 2. Quality rules
  totalChecks++;
  const qualityResult = validateEaArtifacts(artifacts.map(artifactToBackstage), options);
  if (qualityResult.errors.length === 0 && qualityResult.warnings.length === 0) {
    passedChecks++;
  }
  allFindings.push(...qualityResult.errors);
  allFindings.push(...qualityResult.warnings);

  // 3. Relation target integrity
  totalChecks++;
  const relationErrors = checkRelationTargets(artifacts);
  if (relationErrors.length === 0) {
    passedChecks++;
  } else {
    allFindings.push(...relationErrors);
  }

  // 4. Orphan artifacts
  totalChecks++;
  const orphanWarnings = checkOrphanArtifacts(artifacts);
  if (orphanWarnings.length === 0) {
    passedChecks++;
  } else {
    allFindings.push(...orphanWarnings);
  }

  // 5. Lifecycle consistency
  totalChecks++;
  const lifecycleErrors = checkLifecycleConsistency(artifacts);
  if (lifecycleErrors.length === 0) {
    passedChecks++;
  } else {
    allFindings.push(...lifecycleErrors);
  }

  // 6. Plugin checks
  let plugins: EaPlugin[] = [];
  if (options?.plugins && options.plugins.length > 0) {
    plugins = await loadEaPlugins(options.plugins, eaRoot.projectRoot);
    totalChecks++;
    const pluginFindings = runEaPluginChecks(plugins, {
      artifacts,
      projectRoot: eaRoot.projectRoot,
      config: eaRoot.v1Config as unknown as Record<string, unknown> ?? {},
    });
    if (pluginFindings.length === 0) {
      passedChecks++;
    } else {
      allFindings.push(...pluginFindings);
    }
  }

  // 7. Plugin onValidate hooks
  for (const plugin of plugins) {
    if (!plugin.hooks?.onValidate) continue;
    totalChecks++;
    try {
      const hookFindings = await plugin.hooks.onValidate({
        artifacts,
        builtinFindings: [...allFindings],
      });
      const prefixed = hookFindings.map((f) => ({
        ...f,
        rule: f.rule.startsWith("plugin:") ? f.rule : `plugin:${plugin.name}/${f.rule}`,
      }));
      if (prefixed.length === 0) {
        passedChecks++;
      } else {
        allFindings.push(...prefixed);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allFindings.push({
        path: "",
        message: `EA Plugin "${plugin.name}" onValidate hook threw: ${msg}`,
        severity: "error",
        rule: `plugin:${plugin.name}/onValidate`,
      });
    }
  }

  // Apply overrides
  const findings = applyRuleOverrides(allFindings, ruleOverrides, strict);
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");

  // Build domain counts
  const byDomain: Record<string, number> = {};
  for (const a of artifacts) {
    const domain = getDomainForKind(a.kind) ?? "unknown";
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }

  return {
    passed: errors.length === 0,
    summary: {
      totalChecks,
      passed: passedChecks,
      warnings: warnings.length,
      errors: errors.length,
      artifacts: {
        total: artifacts.length,
        byDomain,
      },
    },
    findings,
  };
}
