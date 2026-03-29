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
import type {
  SystemInterfaceArtifact,
  ConsumerArtifact,
  CloudResourceArtifact,
  EnvironmentArtifact,
  TechnologyStandardArtifact,
  LogicalDataModelArtifact,
  PhysicalSchemaArtifact,
  DataStoreArtifact,
  LineageArtifact,
  DataQualityRuleArtifact,
  DataProductArtifact,
  CanonicalEntityArtifact,
  InformationExchangeArtifact,
  ClassificationArtifact,
  RetentionPolicyArtifact,
  GlossaryTermArtifact,
  CapabilityArtifact,
  ValueStreamArtifact,
  ProcessArtifact,
  OrgUnitArtifact,
  PolicyObjectiveArtifact,
  ControlArtifact,
  MissionArtifact,
  BaselineArtifact,
  TargetArtifact,
  TransitionPlanArtifact,
  MigrationWaveArtifact,
  ExceptionArtifact,
} from "./types.js";
import { EA_KIND_REGISTRY, isValidEaId } from "./types.js";
import type { EaQualityConfig } from "./config.js";
import type { RelationRegistry } from "./relation-registry.js";

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
  | "technology-standard"
  | "logical-data-model"
  | "physical-schema"
  | "data-store"
  | "lineage"
  | "master-data-domain"
  | "data-quality-rule"
  | "data-product"
  | "information-concept"
  | "canonical-entity"
  | "information-exchange"
  | "classification"
  | "retention-policy"
  | "glossary-term"
  | "mission"
  | "capability"
  | "value-stream"
  | "process"
  | "org-unit"
  | "policy-objective"
  | "business-service"
  | "control"
  | "baseline"
  | "target"
  | "transition-plan"
  | "migration-wave"
  | "exception";

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
  "logical-data-model",
  "physical-schema",
  "data-store",
  "lineage",
  "master-data-domain",
  "data-quality-rule",
  "data-product",
  "information-concept",
  "canonical-entity",
  "information-exchange",
  "classification",
  "retention-policy",
  "glossary-term",
  "mission",
  "capability",
  "value-stream",
  "process",
  "org-unit",
  "policy-objective",
  "business-service",
  "control",
  "baseline",
  "target",
  "transition-plan",
  "migration-wave",
  "exception",
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

    // ── ea:quality:system-interface-missing-direction ──────────────────────
    if (a.kind === "system-interface") {
      const sif = a as unknown as SystemInterfaceArtifact;
      const sifSev = ruleSeverity("ea:quality:system-interface-missing-direction", "error", q);
      if (!sif.direction) {
        push(
          sifSev,
          "ea:quality:system-interface-missing-direction",
          a.id,
          `System interface "${a.id}" must have a direction (inbound, outbound, or bidirectional)`
        );
      }
    }

    // ── ea:quality:consumer-missing-contract ─────────────────────────────────
    if (a.kind === "consumer") {
      const con = a as unknown as ConsumerArtifact;
      const conSev = ruleSeverity("ea:quality:consumer-missing-contract", "warning", q);
      if (!con.consumesContracts || con.consumesContracts.length === 0) {
        push(
          conSev,
          "ea:quality:consumer-missing-contract",
          a.id,
          `Consumer "${a.id}" has no consumesContracts — link it to at least one API or event contract`
        );
      }
    }

    // ── ea:quality:cloud-resource-missing-provider ───────────────────────────
    if (a.kind === "cloud-resource") {
      const cloud = a as unknown as CloudResourceArtifact;
      const cloudSev = ruleSeverity("ea:quality:cloud-resource-missing-provider", "error", q);
      if (!cloud.provider) {
        push(
          cloudSev,
          "ea:quality:cloud-resource-missing-provider",
          a.id,
          `Cloud resource "${a.id}" must specify a provider (aws, gcp, azure, or other)`
        );
      }
    }

    // ── ea:quality:environment-production-not-restricted ─────────────────────
    if (a.kind === "environment") {
      const env = a as unknown as EnvironmentArtifact;
      const envSev = ruleSeverity("ea:quality:environment-production-not-restricted", "warning", q);
      if (env.isProduction && env.accessLevel && env.accessLevel !== "restricted") {
        push(
          envSev,
          "ea:quality:environment-production-not-restricted",
          a.id,
          `Production environment "${a.id}" should have accessLevel "restricted" (currently "${env.accessLevel}")`
        );
      }
    }

    // ── ea:quality:technology-standard-expired-review ────────────────────────
    if (a.kind === "technology-standard") {
      const tech = a as unknown as TechnologyStandardArtifact;
      const techSev = ruleSeverity("ea:quality:technology-standard-expired-review", "warning", q);
      if (tech.reviewBy && isActive) {
        const reviewDate = new Date(tech.reviewBy);
        if (!isNaN(reviewDate.getTime()) && reviewDate < new Date()) {
          push(
            techSev,
            "ea:quality:technology-standard-expired-review",
            a.id,
            `Technology standard "${a.id}" has passed its review date (${tech.reviewBy})`
          );
        }
      }
    }

    // ── ea:quality:ldm-missing-attributes ──────────────────────────────────
    if (a.kind === "logical-data-model") {
      const ldm = a as unknown as LogicalDataModelArtifact;
      const ldmSev = ruleSeverity("ea:quality:ldm-missing-attributes", "warning", q);
      if (!ldm.attributes || ldm.attributes.length === 0) {
        push(
          ldmSev,
          "ea:quality:ldm-missing-attributes",
          a.id,
          `Logical data model "${a.id}" has no attributes defined`
        );
      }
    }

    // ── ea:quality:physical-schema-missing-tables ────────────────────────────
    if (a.kind === "physical-schema") {
      const ps = a as unknown as PhysicalSchemaArtifact;
      const psSev = ruleSeverity("ea:quality:physical-schema-missing-tables", "warning", q);
      if (!ps.tables || ps.tables.length === 0) {
        push(
          psSev,
          "ea:quality:physical-schema-missing-tables",
          a.id,
          `Physical schema "${a.id}" has no tables defined`
        );
      }
    }

    // ── ea:quality:data-store-missing-technology ─────────────────────────────
    if (a.kind === "data-store") {
      const ds = a as unknown as DataStoreArtifact;
      const dsSev = ruleSeverity("ea:quality:data-store-missing-technology", "error", q);
      if (!ds.technology) {
        push(
          dsSev,
          "ea:quality:data-store-missing-technology",
          a.id,
          `Data store "${a.id}" must specify a technology (engine + category)`
        );
      }
    }

    // ── ea:quality:lineage-missing-source-destination ────────────────────────
    if (a.kind === "lineage") {
      const lin = a as unknown as LineageArtifact;
      const linSev = ruleSeverity("ea:quality:lineage-missing-source-destination", "error", q);
      if (!lin.source || !lin.destination) {
        push(
          linSev,
          "ea:quality:lineage-missing-source-destination",
          a.id,
          `Lineage "${a.id}" must specify both source and destination`
        );
      }
    }

    // ── ea:quality:dqr-missing-assertion ─────────────────────────────────────
    if (a.kind === "data-quality-rule") {
      const dqr = a as unknown as DataQualityRuleArtifact;
      const dqrSev = ruleSeverity("ea:quality:dqr-missing-assertion", "error", q);
      if (!dqr.assertion || dqr.assertion.trim().length === 0) {
        push(
          dqrSev,
          "ea:quality:dqr-missing-assertion",
          a.id,
          `Data quality rule "${a.id}" must have an assertion`
        );
      }
    }

    // ── ea:quality:data-product-missing-output-ports ─────────────────────────
    if (a.kind === "data-product") {
      const dp = a as unknown as DataProductArtifact;
      const dpSev = ruleSeverity("ea:quality:data-product-missing-output-ports", "warning", q);
      if (!dp.outputPorts || dp.outputPorts.length === 0) {
        push(
          dpSev,
          "ea:quality:data-product-missing-output-ports",
          a.id,
          `Data product "${a.id}" has no output ports defined`
        );
      }
    }

    // ── Phase 2C: Information Layer Quality Rules ────────────────────────────

    // ── ea:quality:ce-missing-attributes ─────────────────────────────────────
    if (a.kind === "canonical-entity") {
      const ce = a as unknown as CanonicalEntityArtifact;
      const ceSev = ruleSeverity("ea:quality:ce-missing-attributes", "error", q);
      if (!ce.attributes || ce.attributes.length === 0) {
        push(
          ceSev,
          "ea:quality:ce-missing-attributes",
          a.id,
          `Canonical entity "${a.id}" has no attributes defined`
        );
      }
      // ── ea:quality:ce-attribute-missing-type ─────────────────────────────
      if (ce.attributes) {
        const attrSev = ruleSeverity("ea:quality:ce-attribute-missing-type", "error", q);
        for (const attr of ce.attributes) {
          if (!attr.type || attr.type.trim().length === 0) {
            push(
              attrSev,
              "ea:quality:ce-attribute-missing-type",
              a.id,
              `Canonical entity "${a.id}" has attribute "${attr.name}" without a type`
            );
          }
        }
      }
    }

    // ── ea:quality:exchange-missing-source-destination ───────────────────────
    if (a.kind === "information-exchange") {
      const exch = a as unknown as InformationExchangeArtifact;
      const exchSrcSev = ruleSeverity("ea:quality:exchange-missing-source-destination", "error", q);
      if (!exch.source || !exch.destination) {
        push(
          exchSrcSev,
          "ea:quality:exchange-missing-source-destination",
          a.id,
          `Information exchange "${a.id}" must specify both source and destination`
        );
      }
      // ── ea:quality:exchange-missing-purpose ──────────────────────────────
      const exchPurpSev = ruleSeverity("ea:quality:exchange-missing-purpose", "error", q);
      if (!exch.purpose || exch.purpose.trim().length === 0) {
        push(
          exchPurpSev,
          "ea:quality:exchange-missing-purpose",
          a.id,
          `Information exchange "${a.id}" must have a purpose`
        );
      }
    }

    // ── ea:quality:classification-missing-controls ───────────────────────────
    if (a.kind === "classification") {
      const cls = a as unknown as ClassificationArtifact;
      const clsSev = ruleSeverity("ea:quality:classification-missing-controls", "error", q);
      if (!cls.requiredControls || cls.requiredControls.length === 0) {
        push(
          clsSev,
          "ea:quality:classification-missing-controls",
          a.id,
          `Classification "${a.id}" has no required controls defined`
        );
      }
    }

    // ── ea:quality:retention-missing-duration ────────────────────────────────
    if (a.kind === "retention-policy") {
      const ret = a as unknown as RetentionPolicyArtifact;
      const retSev = ruleSeverity("ea:quality:retention-missing-duration", "error", q);
      if (!ret.retention || !ret.retention.duration || ret.retention.duration.trim().length === 0) {
        push(
          retSev,
          "ea:quality:retention-missing-duration",
          a.id,
          `Retention policy "${a.id}" must specify a retention duration`
        );
      }
    }

    // ── ea:quality:glossary-missing-definition ───────────────────────────────
    if (a.kind === "glossary-term") {
      const gt = a as unknown as GlossaryTermArtifact;
      const gtSev = ruleSeverity("ea:quality:glossary-missing-definition", "error", q);
      if (!gt.definition || gt.definition.trim().length === 0) {
        push(
          gtSev,
          "ea:quality:glossary-missing-definition",
          a.id,
          `Glossary term "${a.id}" must have a definition`
        );
      }
    }

    // ── Phase 2D: Business Layer Quality Rules ──────────────────────────────

    // ── ea:quality:capability-missing-level ──────────────────────────────────
    if (a.kind === "capability") {
      const cap = a as unknown as CapabilityArtifact;
      const capSev = ruleSeverity("ea:quality:capability-missing-level", "error", q);
      if (cap.level === undefined || cap.level === null) {
        push(
          capSev,
          "ea:quality:capability-missing-level",
          a.id,
          `Capability "${a.id}" must specify a level`
        );
      }
    }

    // ── ea:quality:process-missing-steps ─────────────────────────────────────
    if (a.kind === "process") {
      const proc = a as unknown as ProcessArtifact;
      const procSev = ruleSeverity("ea:quality:process-missing-steps", "warning", q);
      if (!proc.steps || proc.steps.length === 0) {
        push(
          procSev,
          "ea:quality:process-missing-steps",
          a.id,
          `Process "${a.id}" has no steps defined`
        );
      }
    }

    // ── ea:quality:value-stream-missing-stages ──────────────────────────────
    if (a.kind === "value-stream") {
      const vs = a as unknown as ValueStreamArtifact;
      const vsSev = ruleSeverity("ea:quality:value-stream-missing-stages", "error", q);
      if (!vs.stages || vs.stages.length === 0) {
        push(
          vsSev,
          "ea:quality:value-stream-missing-stages",
          a.id,
          `Value stream "${a.id}" has no stages defined`
        );
      }
    }

    // ── ea:quality:control-missing-assertion ─────────────────────────────────
    if (a.kind === "control") {
      const ctrl = a as unknown as ControlArtifact;
      const ctrlSev = ruleSeverity("ea:quality:control-missing-assertion", "error", q);
      if (!ctrl.assertion || ctrl.assertion.trim().length === 0) {
        push(
          ctrlSev,
          "ea:quality:control-missing-assertion",
          a.id,
          `Control "${a.id}" must have an assertion`
        );
      }
    }

    // ── ea:quality:org-unit-missing-type ─────────────────────────────────────
    if (a.kind === "org-unit") {
      const org = a as unknown as OrgUnitArtifact;
      const orgSev = ruleSeverity("ea:quality:org-unit-missing-type", "error", q);
      if (!org.unitType || org.unitType.trim().length === 0) {
        push(
          orgSev,
          "ea:quality:org-unit-missing-type",
          a.id,
          `Organization unit "${a.id}" must specify a unitType`
        );
      }
    }

    // ── ea:quality:policy-missing-objective ──────────────────────────────────
    if (a.kind === "policy-objective") {
      const pol = a as unknown as PolicyObjectiveArtifact;
      const polSev = ruleSeverity("ea:quality:policy-missing-objective", "error", q);
      if (!pol.objective || pol.objective.trim().length === 0) {
        push(
          polSev,
          "ea:quality:policy-missing-objective",
          a.id,
          `Policy objective "${a.id}" must have an objective`
        );
      }
    }

    // ── ea:quality:mission-missing-key-results ──────────────────────────────
    if (a.kind === "mission") {
      const mis = a as unknown as MissionArtifact;
      const misSev = ruleSeverity("ea:quality:mission-missing-key-results", "info", q);
      if (!mis.keyResults || mis.keyResults.length === 0) {
        push(
          misSev,
          "ea:quality:mission-missing-key-results",
          a.id,
          `Mission "${a.id}" has no key results defined`
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

    // ── ea:quality:baseline-empty-refs ──────────────────────────────────────
    if (a.kind === "baseline") {
      const bl = a as unknown as BaselineArtifact;
      const blSev = ruleSeverity("ea:quality:baseline-empty-refs", "warning", q);
      if (!bl.artifactRefs || bl.artifactRefs.length === 0) {
        push(blSev, "ea:quality:baseline-empty-refs", a.id, `Baseline "${a.id}" has no artifact references`);
      }
    }

    // ── ea:quality:target-missing-metrics ───────────────────────────────────
    if (a.kind === "target") {
      const tgt = a as unknown as TargetArtifact;
      const tgtSev = ruleSeverity("ea:quality:target-missing-metrics", "warning", q);
      if (!tgt.successMetrics || tgt.successMetrics.length === 0) {
        push(tgtSev, "ea:quality:target-missing-metrics", a.id, `Target "${a.id}" has no success metrics defined`);
      }
    }

    // ── ea:quality:plan-empty-milestones ────────────────────────────────────
    if (a.kind === "transition-plan") {
      const plan = a as unknown as TransitionPlanArtifact;
      const planSev = ruleSeverity("ea:quality:plan-empty-milestones", "warning", q);
      if (!plan.milestones || plan.milestones.length === 0) {
        push(planSev, "ea:quality:plan-empty-milestones", a.id, `Transition plan "${a.id}" has no milestones`);
      }
    }

    // ── ea:quality:exception-empty-scope ────────────────────────────────────
    if (a.kind === "exception") {
      const exc = a as unknown as ExceptionArtifact;
      const excSev = ruleSeverity("ea:quality:exception-empty-scope", "error", q);
      const hasScope = (exc.scope?.artifactIds?.length ?? 0) > 0 ||
        (exc.scope?.rules?.length ?? 0) > 0 ||
        (exc.scope?.domains?.length ?? 0) > 0;
      if (!hasScope) {
        push(excSev, "ea:quality:exception-empty-scope", a.id, `Exception "${a.id}" has empty scope (would suppress everything)`);
      }
    }

    // ── ea:quality:wave-empty-scope ─────────────────────────────────────────
    if (a.kind === "migration-wave") {
      const wave = a as unknown as MigrationWaveArtifact;
      const waveSev = ruleSeverity("ea:quality:wave-empty-scope", "warning", q);
      const hasScope = (wave.scope?.create?.length ?? 0) > 0 ||
        (wave.scope?.modify?.length ?? 0) > 0 ||
        (wave.scope?.retire?.length ?? 0) > 0;
      if (!hasScope) {
        push(waveSev, "ea:quality:wave-empty-scope", a.id, `Migration wave "${a.id}" has empty scope (no create/modify/retire)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Relation Validation ────────────────────────────────────────────────────────

/**
 * Validate relations across a set of loaded EA artifacts against registry rules.
 *
 * Rules (from docs/ea-relationship-model.md §Relation Validation Rules):
 *   1. Target exists
 *   2. Self-reference disallowed
 *   3. Relation type registered
 *   4. Source kind valid
 *   5. Target kind valid
 *   6. Target status compatibility
 *   7. Duplicate detection
 */
export function validateEaRelations(
  artifacts: EaArtifactBase[],
  registry: RelationRegistry,
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

  // Build artifact lookup by ID
  const artifactById = new Map<string, EaArtifactBase>();
  for (const a of artifacts) {
    artifactById.set(a.id, a);
  }

  for (const a of artifacts) {
    if (!a.relations) continue;

    const seen = new Set<string>();

    for (const rel of a.relations) {
      const relKey = `${rel.type}→${rel.target}`;

      // 1. Self-reference
      if (rel.target === a.id) {
        push(
          ruleSeverity("ea:relation:self-reference", "error", q),
          "ea:relation:self-reference",
          a.id,
          `Artifact "${a.id}" has a self-referencing relation of type "${rel.type}"`
        );
        continue;
      }

      // 2. Target exists
      const target = artifactById.get(rel.target);
      if (!target) {
        push(
          ruleSeverity("ea:relation:target-missing", "error", q),
          "ea:relation:target-missing",
          a.id,
          `Artifact "${a.id}" references unknown target "${rel.target}" via "${rel.type}"`
        );
        continue;
      }

      // 3. Relation type registered
      const entry = registry.get(rel.type);
      if (!entry) {
        push(
          ruleSeverity("ea:relation:unknown-type", "warning", q),
          "ea:relation:unknown-type",
          a.id,
          `Artifact "${a.id}" uses unregistered relation type "${rel.type}"`
        );
        // Skip further checks for unregistered types
        continue;
      }

      // 4. Source kind valid
      if (!registry.isValidSource(rel.type, a.kind)) {
        push(
          ruleSeverity("ea:relation:invalid-source", "error", q),
          "ea:relation:invalid-source",
          a.id,
          `Kind "${a.kind}" is not a valid source for relation type "${rel.type}"`
        );
      }

      // 5. Target kind valid
      if (!registry.isValidTarget(rel.type, target.kind)) {
        push(
          ruleSeverity("ea:relation:invalid-target", "error", q),
          "ea:relation:invalid-target",
          a.id,
          `Kind "${target.kind}" is not a valid target for relation type "${rel.type}" (target: "${target.id}")`
        );
      }

      // 6. Target status compatibility
      if (target.status === "retired") {
        const sev = q?.strictMode ? "error" : "warning";
        push(
          ruleSeverity("ea:relation:retired-target", sev as RuleSeverity, q),
          "ea:relation:retired-target",
          a.id,
          `Artifact "${a.id}" references retired artifact "${target.id}" via "${rel.type}"`
        );
      } else if (
        target.status === "draft" &&
        (a.status === "active" || a.status === "shipped")
      ) {
        push(
          ruleSeverity("ea:relation:draft-target", "warning", q),
          "ea:relation:draft-target",
          a.id,
          `Active artifact "${a.id}" references draft artifact "${target.id}" via "${rel.type}"`
        );
      }

      // 7. Duplicate detection
      if (seen.has(relKey)) {
        push(
          ruleSeverity("ea:relation:duplicate", "warning", q),
          "ea:relation:duplicate",
          a.id,
          `Artifact "${a.id}" has duplicate relation "${rel.type}" → "${rel.target}"`
        );
      }
      seen.add(relKey);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
