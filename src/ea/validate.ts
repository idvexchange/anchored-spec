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
import type { EaArtifactBase } from "./types.js";
import { EA_KIND_REGISTRY } from "./types.js";

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
