/**
 * Anchored Spec — Schema Validation Engine
 *
 * AJV-based validation for all spec JSON files.
 * Validates against JSON Schema 2020-12 and runs semantic quality checks.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ValidationResult, ValidationError, Requirement } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = join(__dirname, "schemas");

// ─── Schema Loading ────────────────────────────────────────────────────────────

function loadSchema(name: string): object {
  const path = join(SCHEMAS_DIR, `${name}.schema.json`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      validateSchema: false,
    });
    addFormats(ajvInstance);

    // Pre-load all schemas
    ajvInstance.addSchema(loadSchema("requirement"), "requirement");
    ajvInstance.addSchema(loadSchema("change"), "change");
    ajvInstance.addSchema(loadSchema("decision"), "decision");
    ajvInstance.addSchema(loadSchema("workflow-policy"), "workflow-policy");
  }
  return ajvInstance;
}

// ─── Schema Validation ─────────────────────────────────────────────────────────

export type SchemaName = "requirement" | "change" | "decision" | "workflow-policy";

/**
 * Validate a JSON object against one of the built-in schemas.
 */
export function validateSchema(
  data: unknown,
  schemaName: SchemaName
): ValidationResult {
  const ajv = getAjv();
  const validate = ajv.getSchema(schemaName);
  if (!validate) {
    return {
      valid: false,
      errors: [
        {
          path: "",
          message: `Unknown schema: ${schemaName}`,
          severity: "error",
        },
      ],
      warnings: [],
    };
  }

  const valid = validate(data) as boolean;
  const errors: ValidationError[] = [];

  if (!valid && validate.errors) {
    for (const err of validate.errors) {
      errors.push({
        path: err.instancePath || "/",
        message: err.message || "Validation error",
        severity: "error",
        rule: `schema:${schemaName}`,
      });
    }
  }

  return { valid, errors, warnings: [] };
}

// ─── Requirement Quality Checks ────────────────────────────────────────────────

const VAGUE_PATTERNS = [
  /\bshould work\b/i,
  /\bas expected\b/i,
  /\bappropriate\b/i,
  /\bproperly\b/i,
  /\bcorrectly\b/i,
  /\bin a timely manner\b/i,
  /\buser.friendly\b/i,
  /\brobust\b/i,
  /\bseamless(?:ly)?\b/i,
  /\bintuitive(?:ly)?\b/i,
];

const EXPRESS_ROUTE_PATTERN = /:[a-zA-Z]+/; // Express-style :param
const OPENAPI_ROUTE_PATTERN = /\{[a-zA-Z]+\}/; // OpenAPI-style {param}

/**
 * Run semantic quality checks on a requirement beyond schema validation.
 * Returns warnings for quality issues that don't invalidate the schema.
 */
export function checkRequirementQuality(req: Requirement): ValidationError[] {
  const issues: ValidationError[] = [];

  // Check 1: No vague language in behavior statements
  for (const bs of req.behaviorStatements) {
    for (const pattern of VAGUE_PATTERNS) {
      if (pattern.test(bs.text)) {
        issues.push({
          path: `/behaviorStatements/${bs.id}`,
          message: `Vague language detected: "${bs.text.match(pattern)?.[0]}". Use precise, observable behavior.`,
          severity: "warning",
          rule: "quality:no-vague-language",
        });
      }
    }
  }

  // Check 2: EARS decomposition — response should be present and non-trivial
  for (const bs of req.behaviorStatements) {
    if (!bs.response || bs.response.length < 10) {
      issues.push({
        path: `/behaviorStatements/${bs.id}`,
        message: `EARS response clause is missing or too short. Must describe observable system behavior.`,
        severity: "warning",
        rule: "quality:ears-response-required",
      });
    }
  }

  // Check 3: Route format consistency — prefer OpenAPI {param} over Express :param
  if (req.semanticRefs?.routes) {
    for (const route of req.semanticRefs.routes) {
      if (EXPRESS_ROUTE_PATTERN.test(route) && !OPENAPI_ROUTE_PATTERN.test(route)) {
        issues.push({
          path: `/semanticRefs/routes`,
          message: `Route "${route}" uses Express :param style. Use OpenAPI {param} style for portability.`,
          severity: "warning",
          rule: "quality:route-format",
        });
      }
    }
  }

  // Check 4: Semantic refs should be populated for active/shipped requirements
  if (
    (req.status === "active" || req.status === "shipped") &&
    (!req.semanticRefs ||
      ((!req.semanticRefs.interfaces || req.semanticRefs.interfaces.length === 0) &&
        (!req.semanticRefs.routes || req.semanticRefs.routes.length === 0) &&
        (!req.semanticRefs.symbols || req.semanticRefs.symbols.length === 0)))
  ) {
    issues.push({
      path: `/semanticRefs`,
      message: `Active/shipped requirement should have at least one semantic ref (interface, route, or symbol) for spec anchoring.`,
      severity: "warning",
      rule: "quality:semantic-refs-populated",
    });
  }

  // Check 5: Behavior statements should not contain system-invented names
  const systemNamePatterns = [
    /\b[a-z_]+_table\b/, // database table names
    /\b[A-Z][a-z]+(?:[A-Z][a-z]+){2,}(?:Service|Controller|Handler|Repository|Manager)\b/, // internal class names
    /\bcss (?:custom )?propert(?:y|ies)\b/i, // CSS mechanisms
  ];
  for (const bs of req.behaviorStatements) {
    for (const pattern of systemNamePatterns) {
      if (pattern.test(bs.text)) {
        issues.push({
          path: `/behaviorStatements/${bs.id}`,
          message: `Behavior statement may contain system-invented names. Move implementation details to semanticRefs.`,
          severity: "warning",
          rule: "quality:no-system-names-in-behavior",
        });
        break;
      }
    }
  }

  // Check 6: Trace refs should exist for non-draft requirements
  if (req.status !== "draft" && (!req.traceRefs || req.traceRefs.length === 0)) {
    issues.push({
      path: `/traceRefs`,
      message: `Non-draft requirements should have at least one trace reference.`,
      severity: "warning",
      rule: "quality:trace-refs-required",
    });
  }

  return issues;
}

// ─── Full Validation ───────────────────────────────────────────────────────────

/**
 * Validate a requirement: schema + quality checks.
 */
export function validateRequirement(data: unknown): ValidationResult {
  const schemaResult = validateSchema(data, "requirement");
  if (!schemaResult.valid) {
    return schemaResult;
  }

  const qualityIssues = checkRequirementQuality(data as Requirement);
  const warnings = qualityIssues.filter((i) => i.severity === "warning");
  const errors = qualityIssues.filter((i) => i.severity === "error");

  return {
    valid: errors.length === 0,
    errors: [...schemaResult.errors, ...errors],
    warnings: [...schemaResult.warnings, ...warnings],
  };
}

/**
 * Validate a change record: schema only.
 */
export function validateChange(data: unknown): ValidationResult {
  return validateSchema(data, "change");
}

/**
 * Validate a decision: schema only.
 */
export function validateDecision(data: unknown): ValidationResult {
  return validateSchema(data, "decision");
}

/**
 * Validate a workflow policy: schema only.
 */
export function validateWorkflowPolicy(data: unknown): ValidationResult {
  return validateSchema(data, "workflow-policy");
}
