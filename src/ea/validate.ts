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
import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityId,
  getEntityLegacyKind,
  getEntityStatus,
  getEntityDescription,
  getEntityOwners,
  getEntitySpecRelations,
} from "./backstage/accessors.js";
import { formatEntityRef, parseEntityRef } from "./backstage/types.js";
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
  | "exception"
  | "requirement"
  | "security-requirement"
  | "data-requirement"
  | "technical-requirement"
  | "information-requirement"
  | "change"
  | "decision"
  | "config-v1"
  | "workflow-policy"
  | "ea-evidence"
  | "ea-verification";

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
  "requirement",
  "security-requirement",
  "data-requirement",
  "technical-requirement",
  "information-requirement",
  "change",
  "decision",
  "config-v1",
  "workflow-policy",
  "ea-evidence",
  "ea-verification",
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
  /** Quality rule settings. When omitted, defaults from `resolveConfigV1()` apply. */
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
 * Run quality rules across a set of loaded EA entities.
 *
 * Rules:
 *   - `ea:quality:active-needs-owner`  (error)   — Active artifacts must have owners
 *   - `ea:quality:active-needs-summary`(warning)  — Active artifacts should have a summary
 *   - `ea:quality:duplicate-id`        (error)   — No duplicate artifact IDs
 *   - `ea:quality:orphan-artifact`     (warning)  — Artifacts with zero relations
 */
export function validateEaArtifacts(
  entities: BackstageEntity[],
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
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i]!;
    const entityId = getEntityId(a);
    const prev = seenIds.get(entityId);
    if (prev !== undefined) {
      push(dupSev, "ea:quality:duplicate-id", entityId, `Duplicate artifact ID "${entityId}" (first seen at index ${prev})`);
    } else {
      seenIds.set(entityId, i);
    }
  }

  // Build relation target set for orphan check
  const allTargets = new Set<string>();
  for (const a of entities) {
    for (const { legacyType, targets } of getEntitySpecRelations(a)) {
      for (const t of targets) {
        allTargets.add(t);
        if (legacyType === "ownedBy") {
          for (const candidate of resolveOwnerRefCandidates(t)) {
            allTargets.add(candidate);
          }
        }
      }
    }
    for (const rel of a.relations ?? []) { allTargets.add(rel.targetRef); }
  }

  for (const a of entities) {
    const entityId = getEntityId(a);
    const kind = getEntityLegacyKind(a);
    const status = getEntityStatus(a);
    const isActive = status === "active" || status === "shipped";

    if (q?.requireOwners !== false) {
      const ownerSev = ruleSeverity("ea:quality:active-needs-owner", "error", q);
      const owners = getEntityOwners(a);
      const isOwnershipPrincipal = kind === "org-unit" || kind === "user";
      if (!isOwnershipPrincipal && isActive && (owners.length === 0 || (owners.length === 1 && owners[0] === "unassigned"))) {
        push(ownerSev, "ea:quality:active-needs-owner", entityId, `Active artifact "${entityId}" must have at least one owner`);
      }
    }

    if (q?.requireSummary !== false) {
      const sumSev = ruleSeverity("ea:quality:active-needs-summary", "warning", q);
      const summary = getEntityDescription(a);
      if (isActive && (!summary || summary.trim().length < 10)) {
        push(sumSev, "ea:quality:active-needs-summary", entityId, `Active artifact "${entityId}" should have a meaningful summary (≥10 chars)`);
      }
    }

    if (kind === "system-interface") {
      const sifSev = ruleSeverity("ea:quality:system-interface-missing-direction", "error", q);
      if (!a.spec?.direction) { push(sifSev, "ea:quality:system-interface-missing-direction", entityId, `System interface "${entityId}" must have a direction (inbound, outbound, or bidirectional)`); }
    }
    if (kind === "consumer") {
      const conSev = ruleSeverity("ea:quality:consumer-missing-contract", "warning", q);
      const cc = a.spec?.consumesContracts as unknown[] | undefined;
      if (!cc || cc.length === 0) { push(conSev, "ea:quality:consumer-missing-contract", entityId, `Consumer "${entityId}" has no consumesContracts — link it to at least one API or event contract`); }
    }
    if (kind === "cloud-resource") {
      const cSev = ruleSeverity("ea:quality:cloud-resource-missing-provider", "error", q);
      if (!a.spec?.provider) { push(cSev, "ea:quality:cloud-resource-missing-provider", entityId, `Cloud resource "${entityId}" must specify a provider (aws, gcp, azure, or other)`); }
    }
    if (kind === "environment") {
      const eSev = ruleSeverity("ea:quality:environment-production-not-restricted", "warning", q);
      if (a.spec?.isProduction && a.spec?.accessLevel && a.spec.accessLevel !== "restricted") {
        push(eSev, "ea:quality:environment-production-not-restricted", entityId, `Production environment "${entityId}" should have accessLevel "restricted" (currently "${a.spec.accessLevel as string}")`);
      }
    }
    if (kind === "technology-standard") {
      const tSev = ruleSeverity("ea:quality:technology-standard-expired-review", "warning", q);
      const reviewBy = a.spec?.reviewBy;
      if (typeof reviewBy === "string" && isActive) {
        const rd = new Date(reviewBy);
        if (!isNaN(rd.getTime()) && rd < new Date()) { push(tSev, "ea:quality:technology-standard-expired-review", entityId, `Technology standard "${entityId}" has passed its review date (${reviewBy})`); }
      }
    }
    if (kind === "logical-data-model") {
      const lSev = ruleSeverity("ea:quality:ldm-missing-attributes", "warning", q);
      const attrs = a.spec?.attributes as unknown[] | undefined;
      if (!attrs || attrs.length === 0) { push(lSev, "ea:quality:ldm-missing-attributes", entityId, `Logical data model "${entityId}" has no attributes defined`); }
    }
    if (kind === "physical-schema") {
      const pSev = ruleSeverity("ea:quality:physical-schema-missing-tables", "warning", q);
      const tables = a.spec?.tables as unknown[] | undefined;
      if (!tables || tables.length === 0) { push(pSev, "ea:quality:physical-schema-missing-tables", entityId, `Physical schema "${entityId}" has no tables defined`); }
    }
    if (kind === "data-store") {
      const dSev = ruleSeverity("ea:quality:data-store-missing-technology", "error", q);
      if (!a.spec?.technology) { push(dSev, "ea:quality:data-store-missing-technology", entityId, `Data store "${entityId}" must specify a technology (engine + category)`); }
    }
    if (kind === "lineage") {
      const lnSev = ruleSeverity("ea:quality:lineage-missing-source-destination", "error", q);
      if (!a.spec?.source || !a.spec?.destination) { push(lnSev, "ea:quality:lineage-missing-source-destination", entityId, `Lineage "${entityId}" must specify both source and destination`); }
    }
    if (kind === "data-quality-rule") {
      const dqSev = ruleSeverity("ea:quality:dqr-missing-assertion", "error", q);
      const assertion = a.spec?.assertion;
      if (!assertion || (typeof assertion === "string" && assertion.trim().length === 0)) { push(dqSev, "ea:quality:dqr-missing-assertion", entityId, `Data quality rule "${entityId}" must have an assertion`); }
    }
    if (kind === "data-product") {
      const dpSev = ruleSeverity("ea:quality:data-product-missing-output-ports", "warning", q);
      const op = a.spec?.outputPorts as unknown[] | undefined;
      if (!op || op.length === 0) { push(dpSev, "ea:quality:data-product-missing-output-ports", entityId, `Data product "${entityId}" has no output ports defined`); }
    }
    if (kind === "canonical-entity") {
      const attributes = a.spec?.attributes as Array<Record<string, unknown>> | undefined;
      const ceSev = ruleSeverity("ea:quality:ce-missing-attributes", "error", q);
      if (!attributes || attributes.length === 0) { push(ceSev, "ea:quality:ce-missing-attributes", entityId, `Canonical entity "${entityId}" has no attributes defined`); }
      if (attributes) {
        const atSev = ruleSeverity("ea:quality:ce-attribute-missing-type", "error", q);
        for (const attr of attributes) {
          const at = typeof attr.type === "string" ? attr.type : "";
          const an = typeof attr.name === "string" ? attr.name : "unknown";
          if (!at || at.trim().length === 0) { push(atSev, "ea:quality:ce-attribute-missing-type", entityId, `Canonical entity "${entityId}" has attribute "${an}" without a type`); }
        }
      }
    }
    if (kind === "information-exchange") {
      const exSev = ruleSeverity("ea:quality:exchange-missing-source-destination", "error", q);
      if (!a.spec?.source || !a.spec?.destination) { push(exSev, "ea:quality:exchange-missing-source-destination", entityId, `Information exchange "${entityId}" must specify both source and destination`); }
      const epSev = ruleSeverity("ea:quality:exchange-missing-purpose", "error", q);
      const purpose = a.spec?.purpose;
      if (!purpose || (typeof purpose === "string" && purpose.trim().length === 0)) { push(epSev, "ea:quality:exchange-missing-purpose", entityId, `Information exchange "${entityId}" must have a purpose`); }
    }
    if (kind === "classification") {
      const clSev = ruleSeverity("ea:quality:classification-missing-controls", "error", q);
      const rc = a.spec?.requiredControls as unknown[] | undefined;
      if (!rc || rc.length === 0) { push(clSev, "ea:quality:classification-missing-controls", entityId, `Classification "${entityId}" has no required controls defined`); }
    }
    if (kind === "retention-policy") {
      const rtSev = ruleSeverity("ea:quality:retention-missing-duration", "error", q);
      const ret = a.spec?.retention as Record<string, unknown> | undefined;
      const dur = typeof ret?.duration === "string" ? ret.duration : "";
      if (!ret || !dur || dur.trim().length === 0) { push(rtSev, "ea:quality:retention-missing-duration", entityId, `Retention policy "${entityId}" must specify a retention duration`); }
    }
    if (kind === "glossary-term") {
      const gtSev = ruleSeverity("ea:quality:glossary-missing-definition", "error", q);
      const def_ = a.spec?.definition;
      if (!def_ || (typeof def_ === "string" && def_.trim().length === 0)) { push(gtSev, "ea:quality:glossary-missing-definition", entityId, `Glossary term "${entityId}" must have a definition`); }
    }
    if (kind === "capability") {
      const cpSev = ruleSeverity("ea:quality:capability-missing-level", "error", q);
      if (a.spec?.level === undefined || a.spec?.level === null) { push(cpSev, "ea:quality:capability-missing-level", entityId, `Capability "${entityId}" must specify a level`); }
    }
    if (kind === "process") {
      const prSev = ruleSeverity("ea:quality:process-missing-steps", "warning", q);
      const steps = a.spec?.steps as unknown[] | undefined;
      if (!steps || steps.length === 0) { push(prSev, "ea:quality:process-missing-steps", entityId, `Process "${entityId}" has no steps defined`); }
    }
    if (kind === "value-stream") {
      const vsSev = ruleSeverity("ea:quality:value-stream-missing-stages", "error", q);
      const stages = a.spec?.stages as unknown[] | undefined;
      if (!stages || stages.length === 0) { push(vsSev, "ea:quality:value-stream-missing-stages", entityId, `Value stream "${entityId}" has no stages defined`); }
    }
    if (kind === "control") {
      const ctSev = ruleSeverity("ea:quality:control-missing-assertion", "error", q);
      const asrt = a.spec?.assertion;
      if (!asrt || (typeof asrt === "string" && asrt.trim().length === 0)) { push(ctSev, "ea:quality:control-missing-assertion", entityId, `Control "${entityId}" must have an assertion`); }
    }
    if (kind === "org-unit") {
      const ouSev = ruleSeverity("ea:quality:org-unit-missing-type", "error", q);
      const ut = a.spec?.unitType;
      if (!ut || (typeof ut === "string" && ut.trim().length === 0)) { push(ouSev, "ea:quality:org-unit-missing-type", entityId, `Organization unit "${entityId}" must specify a unitType`); }
    }
    if (kind === "policy-objective") {
      const poSev = ruleSeverity("ea:quality:policy-missing-objective", "error", q);
      const obj = a.spec?.objective;
      if (!obj || (typeof obj === "string" && obj.trim().length === 0)) { push(poSev, "ea:quality:policy-missing-objective", entityId, `Policy objective "${entityId}" must have an objective`); }
    }
    if (kind === "mission") {
      const miSev = ruleSeverity("ea:quality:mission-missing-key-results", "info", q);
      const kr = a.spec?.keyResults as unknown[] | undefined;
      if (!kr || kr.length === 0) { push(miSev, "ea:quality:mission-missing-key-results", entityId, `Mission "${entityId}" has no key results defined`); }
    }
    {
      const orphanSev = ruleSeverity("ea:quality:orphan-artifact", "warning", q);
      const specRels = getEntitySpecRelations(a).filter((r) => r.legacyType !== "owns");
      const compRels = a.relations ?? [];
      const hasOwn = specRels.some(r => r.targets.length > 0) || compRels.length > 0;
      const isTargeted = allTargets.has(entityId);
      if (!hasOwn && !isTargeted) { push(orphanSev, "ea:quality:orphan-artifact", entityId, `Artifact "${entityId}" has no relations and is not referenced by any other artifact`); }
    }
    if (kind === "baseline") {
      const blSev = ruleSeverity("ea:quality:baseline-empty-refs", "warning", q);
      const ar = a.spec?.artifactRefs as unknown[] | undefined;
      if (!ar || ar.length === 0) { push(blSev, "ea:quality:baseline-empty-refs", entityId, `Baseline "${entityId}" has no artifact references`); }
    }
    if (kind === "target") {
      const tgSev = ruleSeverity("ea:quality:target-missing-metrics", "warning", q);
      const sm = a.spec?.successMetrics as unknown[] | undefined;
      if (!sm || sm.length === 0) { push(tgSev, "ea:quality:target-missing-metrics", entityId, `Target "${entityId}" has no success metrics defined`); }
    }
    if (kind === "transition-plan") {
      const plSev = ruleSeverity("ea:quality:plan-empty-milestones", "warning", q);
      const ms = a.spec?.milestones as unknown[] | undefined;
      if (!ms || ms.length === 0) { push(plSev, "ea:quality:plan-empty-milestones", entityId, `Transition plan "${entityId}" has no milestones`); }
    }
    if (kind === "exception") {
      const excSev = ruleSeverity("ea:quality:exception-empty-scope", "error", q);
      const scope = a.spec?.scope as Record<string, unknown> | undefined;
      const hs = ((scope?.artifactIds as unknown[] | undefined)?.length ?? 0) > 0 ||
        ((scope?.rules as unknown[] | undefined)?.length ?? 0) > 0 ||
        ((scope?.domains as unknown[] | undefined)?.length ?? 0) > 0;
      if (!hs) { push(excSev, "ea:quality:exception-empty-scope", entityId, `Exception "${entityId}" has empty scope (would suppress everything)`); }
    }
    if (kind === "migration-wave") {
      const wvSev = ruleSeverity("ea:quality:wave-empty-scope", "warning", q);
      const scope = a.spec?.scope as Record<string, unknown> | undefined;
      const hs = ((scope?.create as unknown[] | undefined)?.length ?? 0) > 0 ||
        ((scope?.modify as unknown[] | undefined)?.length ?? 0) > 0 ||
        ((scope?.retire as unknown[] | undefined)?.length ?? 0) > 0;
      if (!hs) { push(wvSev, "ea:quality:wave-empty-scope", entityId, `Migration wave "${entityId}" has empty scope (no create/modify/retire)`); }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Relation Validation ──────────────────────────────────────────────────────────────────

/**
 * Extract a flat list of relations from a BackstageEntity.
 * Combines spec-field relations (mapped to legacy types) and computed relations.
 */
function extractFlatRelations(entity: BackstageEntity): Array<{ type: string; target: string; isBackstageOwner?: boolean }> {
  const result: Array<{ type: string; target: string; isBackstageOwner?: boolean }> = [];
  for (const { legacyType, targets } of getEntitySpecRelations(entity)) {
    for (const target of targets) {
      result.push({
        type: legacyType,
        target,
        ...(legacyType === "ownedBy" && { isBackstageOwner: true }),
      });
    }
  }
  for (const rel of entity.relations ?? []) {
    result.push({ type: rel.type, target: rel.targetRef });
  }
  return result;
}

function resolveOwnerRefCandidates(ownerRef: string): string[] {
  const parsed = parseEntityRef(ownerRef);

  if (parsed.kind) {
    return [formatEntityRef(parsed.kind, parsed.namespace ?? "default", parsed.name)];
  }

  return [
    formatEntityRef("group", parsed.namespace ?? "default", parsed.name),
    formatEntityRef("user", parsed.namespace ?? "default", parsed.name),
  ];
}

/**
 * Validate relations across a set of loaded EA entities against registry rules.
 */
export function validateEaRelations(
  entities: BackstageEntity[],
  registry: RelationRegistry,
  options?: EaValidationOptions
): EaValidationResult {
  const q = options?.quality;
  const errors: EaValidationError[] = [];
  const warnings: EaValidationError[] = [];

  const push = (sev: RuleSeverity, rule: string, path: string, message: string): void => {
    if (sev === "off") return;
    const entry: EaValidationError = { path, message, severity: sev === "info" ? "warning" : sev, rule };
    if (sev === "error") { errors.push(entry); } else { warnings.push(entry); }
  };

  const entityById = new Map<string, BackstageEntity>();
  for (const a of entities) { entityById.set(getEntityId(a), a); }

  for (const a of entities) {
    const aId = getEntityId(a);
    const aKind = getEntityLegacyKind(a);
    const aStatus = getEntityStatus(a);
    const flatRelations = extractFlatRelations(a);
    if (flatRelations.length === 0) continue;

    const seen = new Set<string>();

    for (const rel of flatRelations) {
      const relKey = `${rel.type}→${rel.target}`;

      if (rel.target === aId) {
        push(ruleSeverity("ea:relation:self-reference", "error", q), "ea:relation:self-reference", aId, `Artifact "${aId}" has a self-referencing relation of type "${rel.type}"`);
        continue;
      }

      let target = entityById.get(rel.target);
      if (!target && rel.isBackstageOwner) {
        for (const candidate of resolveOwnerRefCandidates(rel.target)) {
          target = entityById.get(candidate);
          if (target) break;
        }
      }

      if (!target) {
        push(ruleSeverity("ea:relation:target-missing", "error", q), "ea:relation:target-missing", aId, `Artifact "${aId}" references unknown target "${rel.target}" via "${rel.type}"`);
        continue;
      }

      if (rel.isBackstageOwner) {
        const targetKind = getEntityLegacyKind(target);
        if (targetKind !== "org-unit" && targetKind !== "user") {
          push(ruleSeverity("ea:relation:invalid-target", "error", q), "ea:relation:invalid-target", aId, `Kind "${targetKind}" is not a valid target for relation type "${rel.type}" (target: "${getEntityId(target)}")`);
        }

        const targetStatus = getEntityStatus(target);
        if (targetStatus === "retired") {
          const sev = q?.strictMode ? "error" : "warning";
          push(ruleSeverity("ea:relation:retired-target", sev as RuleSeverity, q), "ea:relation:retired-target", aId, `Artifact "${aId}" references retired artifact "${getEntityId(target)}" via "${rel.type}"`);
        } else if (targetStatus === "draft" && (aStatus === "active" || aStatus === "shipped")) {
          push(ruleSeverity("ea:relation:draft-target", "warning", q), "ea:relation:draft-target", aId, `Active artifact "${aId}" references draft artifact "${getEntityId(target)}" via "${rel.type}"`);
        }

        if (seen.has(relKey)) {
          push(ruleSeverity("ea:relation:duplicate", "warning", q), "ea:relation:duplicate", aId, `Artifact "${aId}" has duplicate relation "${rel.type}" → "${rel.target}"`);
        }
        seen.add(relKey);
        continue;
      }

      const regEntry = registry.get(rel.type);
      if (!regEntry) {
        const canonicalEntry = registry.getCanonicalEntry(rel.type);
        if (canonicalEntry) {
          push(ruleSeverity("ea:relation:unknown-type", "warning", q), "ea:relation:unknown-type", aId, `Artifact "${aId}" relation type "${rel.type}" is a virtual inverse — use "${canonicalEntry.type}" as the canonical direction instead`);
        } else {
          push(ruleSeverity("ea:relation:unknown-type", "warning", q), "ea:relation:unknown-type", aId, `Artifact "${aId}" uses unregistered relation type "${rel.type}"`);
        }
        continue;
      }

      if (!registry.isValidSource(rel.type, aKind)) {
        push(ruleSeverity("ea:relation:invalid-source", "error", q), "ea:relation:invalid-source", aId, `Kind "${aKind}" is not a valid source for relation type "${rel.type}"`);
      }

      const targetKind = getEntityLegacyKind(target);
      if (!registry.isValidTarget(rel.type, targetKind)) {
        push(ruleSeverity("ea:relation:invalid-target", "error", q), "ea:relation:invalid-target", aId, `Kind "${targetKind}" is not a valid target for relation type "${rel.type}" (target: "${getEntityId(target)}")`);
      }

      const targetStatus = getEntityStatus(target);
      if (targetStatus === "retired") {
        const sev = q?.strictMode ? "error" : "warning";
        push(ruleSeverity("ea:relation:retired-target", sev as RuleSeverity, q), "ea:relation:retired-target", aId, `Artifact "${aId}" references retired artifact "${getEntityId(target)}" via "${rel.type}"`);
      } else if (targetStatus === "draft" && (aStatus === "active" || aStatus === "shipped")) {
        push(ruleSeverity("ea:relation:draft-target", "warning", q), "ea:relation:draft-target", aId, `Active artifact "${aId}" references draft artifact "${getEntityId(target)}" via "${rel.type}"`);
      }

      if (seen.has(relKey)) {
        push(ruleSeverity("ea:relation:duplicate", "warning", q), "ea:relation:duplicate", aId, `Artifact "${aId}" has duplicate relation "${rel.type}" → "${rel.target}"`);
      }
      seen.add(relKey);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
