/**
 * Anchored Spec — EA Schema Validation
 *
 * Provides Ajv-based validation for EA artifacts against kind-specific schemas.
 * Follows the same pattern as core validate.ts but with EA-specific schemas.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EaArtifactBase, EaRelation } from "./types.js";
import { EA_KIND_REGISTRY, isValidEaId } from "./types.js";
import type { EaQualityConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Schema Loading ─────────────────────────────────────────────────────────────

const SCHEMAS_DIR = join(__dirname, "schemas");

function loadEaSchema(name: string): Record<string, unknown> {
  const filePath = join(SCHEMAS_DIR, `${name}.schema.json`);
  return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

// ─── Ajv Instance ───────────────────────────────────────────────────────────────

let eaAjvInstance: Ajv | null = null;

/** All EA schema names that can be validated against. */
export type EaSchemaName =
  | "artifact-base"
  | "relation"
  | "anchors"
  | "application"
  | "service"
  | "api-contract"
  | "event-contract"
  | "integration"
  | "system-interface"
  | "consumer"
  | "platform"
  | "deployment"
  | "runtime-cluster"
  | "network-zone"
  | "identity-boundary"
  | "cloud-resource"
  | "environment"
  | "technology-standard";

const EA_SCHEMA_NAMES: EaSchemaName[] = [
  "artifact-base",
  "relation",
  "anchors",
  "application",
  "service",
  "api-contract",
  "event-contract",
  "integration",
  "system-interface",
  "consumer",
  "platform",
  "deployment",
  "runtime-cluster",
  "network-zone",
  "identity-boundary",
  "cloud-resource",
  "environment",
  "technology-standard",
];

function getEaAjv(): Ajv {
  if (!eaAjvInstance) {
    eaAjvInstance = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      validateSchema: false,
    });
    addFormats(eaAjvInstance);

    for (const name of EA_SCHEMA_NAMES) {
      const schema = loadEaSchema(name);
      // Register by both $id and short name for flexibility
      eaAjvInstance.addSchema(schema, name);
    }
  }
  return eaAjvInstance;
}

// Reset for testing
export function resetEaAjv(): void {
  eaAjvInstance = null;
}

// ─── Validation ─────────────────────────────────────────────────────────────────

export interface EaValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
  rule: string;
}

export interface EaValidationResult {
  valid: boolean;
  errors: EaValidationError[];
  warnings: EaValidationError[];
}

/**
 * Validate an EA artifact against its kind-specific schema.
 * Falls back to artifact-base if no kind-specific schema exists.
 */
export function validateEaSchema(
  data: unknown,
  schemaName?: EaSchemaName
): EaValidationResult {
  const ajv = getEaAjv();

  // Determine which schema to use
  const name = schemaName ?? resolveSchemaName(data);
  const validate = ajv.getSchema(name);

  if (!validate) {
    return {
      valid: false,
      errors: [
        {
          path: "",
          message: `Unknown EA schema: ${name}`,
          severity: "error",
          rule: "ea:schema:unknown",
        },
      ],
      warnings: [],
    };
  }

  const valid = validate(data) as boolean;
  const errors: EaValidationError[] = [];
  const warnings: EaValidationError[] = [];

  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      const path = err.instancePath || "/";
      const message = err.message ?? "Unknown validation error";
      errors.push({
        path,
        message: `${path}: ${message}`,
        severity: "error",
        rule: `ea:schema:${name}`,
      });
    }
  }

  return { valid, errors, warnings };
}

/**
 * Resolve the schema name from the artifact's `kind` field.
 * Returns the kind name if a schema exists, otherwise falls back to "artifact-base".
 */
function resolveSchemaName(data: unknown): EaSchemaName {
  if (typeof data === "object" && data !== null && "kind" in data) {
    const kind = (data as Record<string, unknown>).kind;
    if (typeof kind === "string" && EA_SCHEMA_NAMES.includes(kind as EaSchemaName)) {
      return kind as EaSchemaName;
    }
  }
  return "artifact-base";
}

/**
 * Map a kind name to its schema name. Returns undefined if no specific schema exists.
 */
export function getSchemaForKind(kind: string): EaSchemaName | undefined {
  if (EA_SCHEMA_NAMES.includes(kind as EaSchemaName)) {
    return kind as EaSchemaName;
  }
  return undefined;
}

/**
 * Get all registered EA schema names.
 */
export function getEaSchemaNames(): readonly EaSchemaName[] {
  return EA_SCHEMA_NAMES;
}

// ─── Quality Rules ──────────────────────────────────────────────────────────────

/**
 * Options for EA quality-rule validation.
 *
 * The `quality` config from `EaConfig` drives which rules are active.
 * If no `quality` is provided, sensible defaults apply.
 */
export interface EaValidationOptions {
  /** Quality rule settings. When omitted, defaults from `resolveEaConfig()` apply. */
  quality?: Partial<EaQualityConfig>;
}

type RuleSeverity = "error" | "warning" | "info" | "off";

function ruleSeverity(
  ruleId: string,
  defaultSev: RuleSeverity,
  quality?: Partial<EaQualityConfig>
): RuleSeverity {
  // Per-rule override
  const override = quality?.rules?.[ruleId];
  if (override) return override;

  // Strict mode promotes warnings to errors
  if (quality?.strictMode && defaultSev === "warning") return "error";

  return defaultSev;
}

/**
 * Run quality rules across a set of loaded EA artifacts.
 *
 * Rules:
 *   - `ea:quality:active-needs-owner`  (error)   — Active artifacts must have owners
 *   - `ea:quality:active-needs-summary`(warning)  — Active artifacts should have a summary
 *   - `ea:quality:duplicate-id`        (error)   — No duplicate artifact IDs
 *   - `ea:quality:id-format`           (error)   — ID must match kind prefix pattern
 *   - `ea:quality:orphan-artifact`     (warning)  — Artifacts with zero relations
 */
export function validateEaArtifacts(
  artifacts: EaArtifactBase[],
  options?: EaValidationOptions
): EaValidationResult {
  const q = options?.quality;
  const errors: EaValidationError[] = [];
  const warnings: EaValidationError[] = [];

  const push = (
    sev: RuleSeverity,
    rule: string,
    path: string,
    message: string
  ): void => {
    if (sev === "off") return;
    const entry: EaValidationError = { path, message, severity: sev === "info" ? "warning" : sev, rule };
    if (sev === "error") {
      errors.push(entry);
    } else {
      warnings.push(entry);
    }
  };

  // ── ea:quality:duplicate-id ─────────────────────────────────────────────────
  const dupSev = ruleSeverity("ea:quality:duplicate-id", "error", q);
  const seenIds = new Map<string, number>();
  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i]!;
    const prev = seenIds.get(a.id);
    if (prev !== undefined) {
      push(
        dupSev,
        "ea:quality:duplicate-id",
        a.id,
        `Duplicate artifact ID "${a.id}" (first seen at index ${prev})`
      );
    } else {
      seenIds.set(a.id, i);
    }
  }

  // ── ea:quality:id-format ────────────────────────────────────────────────────
  const idSev = ruleSeverity("ea:quality:id-format", "error", q);
  for (const a of artifacts) {
    if (!isValidEaId(a.id, a.kind)) {
      push(
        idSev,
        "ea:quality:id-format",
        a.id,
        `Invalid artifact ID "${a.id}" — must match {domain}/{PREFIX}-{slug} or {PREFIX}-{slug} with correct kind prefix`
      );
    }
  }

  // Build relation target set for orphan check
  const allTargets = new Set<string>();
  for (const a of artifacts) {
    if (a.relations) {
      for (const r of a.relations) {
        allTargets.add(r.target);
      }
    }
  }

  for (const a of artifacts) {
    const isActive = a.status === "active" || a.status === "shipped";

    // ── ea:quality:active-needs-owner ───────────────────────────────────────
    if (q?.requireOwners !== false) {
      const ownerSev = ruleSeverity("ea:quality:active-needs-owner", "error", q);
      if (isActive && (!a.owners || a.owners.length === 0)) {
        push(
          ownerSev,
          "ea:quality:active-needs-owner",
          a.id,
          `Active artifact "${a.id}" must have at least one owner`
        );
      }
    }

    // ── ea:quality:active-needs-summary ─────────────────────────────────────
    if (q?.requireSummary !== false) {
      const sumSev = ruleSeverity("ea:quality:active-needs-summary", "warning", q);
      if (isActive && (!a.summary || a.summary.trim().length < 10)) {
        push(
          sumSev,
          "ea:quality:active-needs-summary",
          a.id,
          `Active artifact "${a.id}" should have a meaningful summary (≥10 chars)`
        );
      }
    }

    // ── ea:quality:orphan-artifact ──────────────────────────────────────────
    {
      const orphanSev = ruleSeverity("ea:quality:orphan-artifact", "warning", q);
      const hasOwnRelations = (a.relations?.length ?? 0) > 0;
      const isTargeted = allTargets.has(a.id);
      if (!hasOwnRelations && !isTargeted) {
        push(
          orphanSev,
          "ea:quality:orphan-artifact",
          a.id,
          `Artifact "${a.id}" has no relations and is not referenced by any other artifact`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
