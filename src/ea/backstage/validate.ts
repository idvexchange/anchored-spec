/**
 * Backstage Entity Validation
 *
 * Ajv-based validation for BackstageEntity against kind-specific Backstage
 * schemas, plus quality rules that parallel the legacy validateEaArtifacts().
 *
 * Uses a separate Ajv instance from the legacy validator to avoid conflicts
 * between the two schema sets (legacy flat-shape vs Backstage envelope).
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BackstageEntity } from "./types.js";
import type { EaValidationError, EaValidationResult, EaValidationOptions } from "../validate.js";
import {
  getEntityId,
  getEntityTitle,
  getEntityDescription,
  getEntityStatus,
  getEntityOwners,
  getEntityConfidence,
  getEntitySpecType,
  getEntityExpectAnchors,
  getEntitySource,
  getEntitySpecRelations,
} from "./accessors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Schema Loading ─────────────────────────────────────────────────────────────

const BACKSTAGE_SCHEMAS_DIR = join(__dirname, "..", "schemas", "backstage");

function loadBackstageSchema(name: string): Record<string, unknown> {
  const filePath = join(BACKSTAGE_SCHEMAS_DIR, `${name}.schema.json`);
  return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

// ─── Schema Names & Kind Mapping ────────────────────────────────────────────────

/** All Backstage schema names that can be validated against. */
export type BackstageSchemaName =
  | "entity-envelope"
  | "component"
  | "api"
  | "resource"
  | "system"
  | "domain"
  | "group"
  | "requirement"
  | "decision"
  | "canonical-entity"
  | "exchange"
  | "capability"
  | "value-stream"
  | "mission"
  | "technology"
  | "system-interface"
  | "control"
  | "transition-plan"
  | "exception";

const BACKSTAGE_SCHEMA_NAMES: BackstageSchemaName[] = [
  "entity-envelope",
  "component",
  "api",
  "resource",
  "system",
  "domain",
  "group",
  "requirement",
  "decision",
  "canonical-entity",
  "exchange",
  "capability",
  "value-stream",
  "mission",
  "technology",
  "system-interface",
  "control",
  "transition-plan",
  "exception",
];

/** Map PascalCase entity kind → kebab-case schema name. */
const KIND_TO_SCHEMA: Record<string, BackstageSchemaName> = {
  Component: "component",
  API: "api",
  Resource: "resource",
  System: "system",
  Domain: "domain",
  Group: "group",
  Requirement: "requirement",
  Decision: "decision",
  CanonicalEntity: "canonical-entity",
  Exchange: "exchange",
  Capability: "capability",
  ValueStream: "value-stream",
  Mission: "mission",
  Technology: "technology",
  SystemInterface: "system-interface",
  Control: "control",
  TransitionPlan: "transition-plan",
  Exception: "exception",
};

// ─── Ajv Instance ───────────────────────────────────────────────────────────────

let backstageAjvInstance: Ajv | null = null;

function getBackstageAjv(): Ajv {
  if (!backstageAjvInstance) {
    backstageAjvInstance = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      validateSchema: false,
    });
    addFormats(backstageAjvInstance);

    // Load envelope first (it's referenced by all kind schemas)
    const envelope = loadBackstageSchema("entity-envelope");
    backstageAjvInstance.addSchema(envelope, "entity-envelope");

    // Load all kind-specific schemas
    for (const name of BACKSTAGE_SCHEMA_NAMES) {
      if (name === "entity-envelope") continue;
      const schema = loadBackstageSchema(name);
      backstageAjvInstance.addSchema(schema, name);
    }
  }
  return backstageAjvInstance;
}

/** Reset cached Ajv instance (for testing). */
export function resetBackstageAjv(): void {
  backstageAjvInstance = null;
}

// ─── Schema Validation ──────────────────────────────────────────────────────────

/**
 * Resolve the Backstage schema name for an entity based on its kind.
 * Falls back to "entity-envelope" if no kind-specific schema exists.
 */
function resolveBackstageSchemaName(data: unknown): BackstageSchemaName {
  if (typeof data === "object" && data !== null && "kind" in data) {
    const kind = (data as Record<string, unknown>).kind;
    if (typeof kind === "string" && kind in KIND_TO_SCHEMA) {
      return KIND_TO_SCHEMA[kind]!;
    }
  }
  return "entity-envelope";
}

/**
 * Get the schema name for a Backstage entity kind.
 */
export function getBackstageSchemaForKind(kind: string): BackstageSchemaName | undefined {
  return KIND_TO_SCHEMA[kind];
}

/**
 * Get all registered Backstage schema names.
 */
export function getBackstageSchemaNames(): readonly BackstageSchemaName[] {
  return BACKSTAGE_SCHEMA_NAMES;
}

/**
 * Validate a Backstage entity against its kind-specific schema.
 * Falls back to the entity-envelope schema if no kind-specific schema exists.
 */
export function validateBackstageEntity(
  data: unknown,
  schemaName?: BackstageSchemaName,
): EaValidationResult {
  const ajv = getBackstageAjv();
  const name = schemaName ?? resolveBackstageSchemaName(data);
  const validate = ajv.getSchema(name);

  if (!validate) {
    return {
      valid: false,
      errors: [{
        path: "",
        message: `Unknown Backstage schema: ${name}`,
        severity: "error",
        rule: "backstage:schema:unknown",
      }],
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
        rule: `backstage:schema:${name}`,
      });
    }
  }

  return { valid, errors, warnings };
}

// ─── Quality Rules ──────────────────────────────────────────────────────────────

type RuleSeverity = "error" | "warning" | "info" | "off";

function ruleSeverity(
  ruleId: string,
  defaultSev: RuleSeverity,
  quality?: EaValidationOptions["quality"],
): RuleSeverity {
  const override = quality?.rules?.[ruleId];
  if (override) return override;
  if (quality?.strictMode && defaultSev === "warning") return "error";
  return defaultSev;
}

function pushFinding(
  errors: EaValidationError[],
  warnings: EaValidationError[],
  severity: RuleSeverity,
  rule: string,
  path: string,
  message: string,
): void {
  if (severity === "off" || severity === "info") return;
  const finding: EaValidationError = { path, message, severity, rule };
  if (severity === "error") {
    errors.push(finding);
  } else {
    warnings.push(finding);
  }
}

/**
 * Run quality rules across a set of Backstage entities.
 *
 * Rules (parallel to legacy validateEaArtifacts):
 *   - `backstage:quality:duplicate-name`    (error)   — No duplicate entity refs
 *   - `backstage:quality:name-format`       (error)   — Name must be valid
 *   - `backstage:quality:active-needs-owner`(error)   — Active entities need an owner
 *   - `backstage:quality:active-needs-desc` (warning)  — Active entities should have description
 *   - `backstage:quality:orphan-entity`     (warning)  — Entities with no relations
 *   - `backstage:quality:missing-apiversion`(error)   — Must have valid apiVersion
 *   - `backstage:quality:missing-kind`      (error)   — Must have recognized kind
 */
export function validateBackstageEntities(
  entities: BackstageEntity[],
  options?: EaValidationOptions,
): EaValidationResult {
  const errors: EaValidationError[] = [];
  const warnings: EaValidationError[] = [];
  const quality = options?.quality;

  // ── Duplicate entity ref check ──
  const dupSev = ruleSeverity("backstage:quality:duplicate-name", "error", quality);
  if (dupSev !== "off") {
    const seen = new Map<string, number>();
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i]!;
      const ref = getEntityId(entity);
      const prev = seen.get(ref);
      if (prev !== undefined) {
        pushFinding(errors, warnings, dupSev, "backstage:quality:duplicate-name", `[${i}]`,
          `Duplicate entity ref "${ref}" (first seen at index ${prev})`);
      } else {
        seen.set(ref, i);
      }
    }
  }

  // ── Per-entity rules ──
  const nameSev = ruleSeverity("backstage:quality:name-format", "error", quality);
  const ownerSev = ruleSeverity("backstage:quality:active-needs-owner", "error", quality);
  const descSev = ruleSeverity("backstage:quality:active-needs-desc", "warning", quality);
  const apiVersionSev = ruleSeverity("backstage:quality:missing-apiversion", "error", quality);
  const kindSev = ruleSeverity("backstage:quality:missing-kind", "error", quality);

  const NAME_RE = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

  // Collect all entity refs for orphan detection
  const allRefs = new Set(entities.map(getEntityId));
  const referenced = new Set<string>();

  // Collect referenced entities
  for (const entity of entities) {
    const specRelations = getEntitySpecRelations(entity);
    for (const { targets } of specRelations) {
      for (const t of targets) referenced.add(t);
    }
    for (const rel of entity.relations ?? []) {
      referenced.add(rel.targetRef);
    }
    // owner refs
    const ownerRef = entity.spec?.owner;
    if (typeof ownerRef === "string") referenced.add(ownerRef);
    // system refs
    const systemRef = entity.spec?.system;
    if (typeof systemRef === "string") referenced.add(systemRef);
  }

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]!;
    const ref = getEntityId(entity);
    const prefix = `${ref}`;

    // apiVersion check
    if (apiVersionSev !== "off") {
      if (!entity.apiVersion) {
        pushFinding(errors, warnings, apiVersionSev, "backstage:quality:missing-apiversion",
          prefix, `Entity "${ref}" is missing apiVersion`);
      }
    }

    // kind check
    if (kindSev !== "off") {
      if (!entity.kind) {
        pushFinding(errors, warnings, kindSev, "backstage:quality:missing-kind",
          prefix, `Entity "${ref}" is missing kind`);
      }
    }

    // Name format check
    if (nameSev !== "off") {
      const name = entity.metadata.name;
      if (!name) {
        pushFinding(errors, warnings, nameSev, "backstage:quality:name-format",
          prefix, `Entity at index ${i} is missing metadata.name`);
      } else if (name.length === 1) {
        // Single char names are valid if alphanumeric
        if (!/^[a-z0-9]$/.test(name)) {
          pushFinding(errors, warnings, nameSev, "backstage:quality:name-format",
            prefix, `Entity name "${name}" must be lowercase alphanumeric with dashes/dots`);
        }
      } else if (!NAME_RE.test(name)) {
        pushFinding(errors, warnings, nameSev, "backstage:quality:name-format",
          prefix, `Entity name "${name}" must match pattern [a-z0-9][a-z0-9._-]*[a-z0-9]`);
      }
    }

    // Active entities need owner
    if (ownerSev !== "off") {
      const status = getEntityStatus(entity);
      if (status === "active" || status === "shipped") {
        const owners = getEntityOwners(entity);
        if (owners.length === 0 || (owners.length === 1 && owners[0] === "unassigned")) {
          pushFinding(errors, warnings, ownerSev, "backstage:quality:active-needs-owner",
            prefix, `Active entity "${ref}" must have an owner (spec.owner)`);
        }
      }
    }

    // Active entities need description
    if (descSev !== "off") {
      const status = getEntityStatus(entity);
      if (status === "active" || status === "shipped") {
        const desc = getEntityDescription(entity);
        if (!desc || desc.length < 10) {
          pushFinding(errors, warnings, descSev, "backstage:quality:active-needs-desc",
            prefix, `Active entity "${ref}" should have a description (metadata.description, ≥10 chars)`);
        }
      }
    }
  }

  // ── Orphan entity check ──
  const orphanSev = ruleSeverity("backstage:quality:orphan-entity", "warning", quality);
  if (orphanSev !== "off") {
    for (const entity of entities) {
      const ref = getEntityId(entity);
      const specRelations = getEntitySpecRelations(entity);
      const hasOutgoingRelations = specRelations.some((r) => r.targets.length > 0);
      const isReferenced = referenced.has(ref);

      if (!hasOutgoingRelations && !isReferenced) {
        pushFinding(errors, warnings, orphanSev, "backstage:quality:orphan-entity",
          ref, `Entity "${ref}" has no relations and is not referenced by other entities`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
