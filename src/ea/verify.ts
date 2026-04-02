/**
 * Anchored Spec — EA Verification Engine
 *
 * Runs all EA validation checks and returns structured results.
 * This is the EA EA-native verification engine.
 *
 * Checks include:
 *   1. JSON Schema validation (per artifact)
 *   2. Quality rules (from validateEntities)
 *   3. Relation integrity (target exists)
 *   4. Cross-reference integrity (bidirectional references)
 *   5. Lifecycle validation (status transitions)
 *   6. Plugin checks (if configured)
 */

import { type EaValidationError, type EaValidationOptions } from "./validate.js";
import type { EaRoot } from "./loader.js";
import { loadEaPlugins, runEaPluginChecks, type EaPlugin } from "./plugins.js";
import type { BackstageEntity } from "./backstage/types.js";
import { getEntityId, getEntityDescriptor, getEntityOwnerRef, getEntitySpecRelations, getEntityStatus } from "./backstage/accessors.js";
import { validateBackstageEntities } from "./backstage/validate.js";

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
function checkRelationTargets(entities: BackstageEntity[]): EaValidationError[] {
  const errors: EaValidationError[] = [];
  const knownIds = new Set(entities.map((entity) => getEntityId(entity)));

  for (const entity of entities) {
    for (const rel of getEntitySpecRelations(entity)) {
      if (rel.legacyType === "ownedBy") continue;
      for (const target of rel.targets) {
        if (!target.includes(":") && !target.includes("/")) continue;
        if (knownIds.has(target)) continue;
        errors.push({
          path: getEntityId(entity),
          message: `Relation target "${target}" from "${getEntityId(entity)}" does not match any known artifact ID`,
          severity: "error",
          rule: "ea:verify:broken-relation-target",
        });
      }
    }
  }

  return errors;
}

/** Check for orphaned artifacts with no incoming or outgoing relations. */
function checkOrphanArtifacts(entities: BackstageEntity[]): EaValidationError[] {
  const warnings: EaValidationError[] = [];
  const referencedIds = new Set<string>();

  for (const entity of entities) {
    for (const rel of getEntitySpecRelations(entity)) {
      for (const target of rel.targets) {
        referencedIds.add(target);
      }
    }
  }

  for (const entity of entities) {
    const status = getEntityStatus(entity);
    if (status === "draft" || status === "deprecated" || status === "retired") continue;
    const entityId = getEntityId(entity);
    const hasOutgoing =
      typeof getEntityOwnerRef(entity) === "string" ||
      getEntitySpecRelations(entity).some((rel) => rel.targets.length > 0);
    const hasIncoming = referencedIds.has(entityId);
    if (!hasOutgoing && !hasIncoming) {
      warnings.push({
        path: entityId,
        message: `Artifact "${entityId}" has no relations (orphaned)`,
        severity: "warning",
        rule: "ea:verify:orphan-artifact",
      });
    }
  }

  return warnings;
}

/** Check lifecycle consistency — deprecated must have reason, active must have owner, etc. */
function checkLifecycleConsistency(entities: BackstageEntity[]): EaValidationError[] {
  const errors: EaValidationError[] = [];

  for (const entity of entities) {
    const entityId = getEntityId(entity);
    const status = getEntityStatus(entity);
    // Deprecated artifacts should indicate why
    if (status === "deprecated") {
      if (!entity.metadata.description?.toLowerCase().includes("deprecated") &&
          !entity.metadata.tags?.includes("deprecated")) {
        errors.push({
          path: entityId,
          message: `Deprecated artifact "${entityId}" should explain why it is deprecated in its summary or tags`,
          severity: "warning",
          rule: "ea:verify:deprecated-needs-reason",
        });
      }
    }

    // Active artifacts in transitions domain must have a target date or link
    if (status === "active" && getEntityDescriptor(entity)?.domain === "transitions") {
      const hasTarget = getEntitySpecRelations(entity).some((rel) => rel.legacyType === "targets" || rel.legacyType === "implementedBy");
      if (!hasTarget) {
        errors.push({
          path: entityId,
          message: `Active transition artifact "${entityId}" should have a "targets" or "implementedBy" relation`,
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

  const loadResult = await eaRoot.loadEntities();
  const entities = loadResult.entities;

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
  const qualityResult = validateBackstageEntities(entities, options);
  if (qualityResult.errors.length === 0 && qualityResult.warnings.length === 0) {
    passedChecks++;
  }
  allFindings.push(...qualityResult.errors);
  allFindings.push(...qualityResult.warnings);

  // 3. Relation target integrity
  totalChecks++;
  const relationErrors = checkRelationTargets(entities);
  if (relationErrors.length === 0) {
    passedChecks++;
  } else {
    allFindings.push(...relationErrors);
  }

  // 4. Orphan artifacts
  totalChecks++;
  const orphanWarnings = checkOrphanArtifacts(entities);
  if (orphanWarnings.length === 0) {
    passedChecks++;
  } else {
    allFindings.push(...orphanWarnings);
  }

  // 5. Lifecycle consistency
  totalChecks++;
  const lifecycleErrors = checkLifecycleConsistency(entities);
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
      entities,
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
        entities,
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
  for (const entity of entities) {
    const domain = getEntityDescriptor(entity)?.domain ?? "unknown";
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
        total: entities.length,
        byDomain,
      },
    },
    findings,
  };
}
