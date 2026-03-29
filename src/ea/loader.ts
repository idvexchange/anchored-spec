/**
 * Anchored Spec — EA Artifact Loader
 *
 * Loads EA artifacts from the filesystem, supporting both JSON and YAML formats.
 * YAML artifacts use a `metadata` envelope that is normalized to the flat
 * `EaArtifactBase` shape before validation.
 *
 * In v1.0 this is the primary loader — replaces SpecRoot from core.
 *
 * Design reference: docs/ea-implementation-guide.md §PR A3
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, extname, relative, resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EaArtifactBase, EaDomain, EaAnchors, EaRelation } from "./types.js";

/**
 * Minimal v0.x config shape — inlined after src/core removal.
 * Only the fields needed to construct EaRoot from a v0.x config.
 */
interface LegacyAnchoredSpecConfig {
  specRoot: string;
  sourceRoots?: string[];
  sourceGlobs?: string[];
  ea?: import("./config.js").EaConfig;
  [key: string]: unknown;
}
import { EA_DOMAINS, getDomainForKind } from "./types.js";
import {
  resolveEaConfig,
  resolveConfigV1,
  detectConfigVersion,
  migrateConfigV0ToV1,
  v1ConfigToEaConfig,
  type EaConfig,
  type AnchoredSpecConfigV1,
  type LegacyConfigInput,
} from "./config.js";
import { validateEaSchema, type EaValidationError } from "./validate.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Result from loading a single artifact file. */
export interface EaLoadedArtifact {
  /** The parsed and normalized artifact (undefined if parsing failed). */
  artifact?: EaArtifactBase;
  /** Absolute file path. */
  filePath: string;
  /** Path relative to project root. */
  relativePath: string;
  /** Domain this file was loaded from. */
  domain: EaDomain;
  /** Errors encountered during loading/parsing. */
  errors: EaValidationError[];
}

/** Aggregate result from loading all artifacts. */
export interface EaLoadResult {
  /** Successfully loaded artifacts. */
  artifacts: EaArtifactBase[];
  /** All load results (including failures) with per-file details. */
  details: EaLoadedArtifact[];
  /** Flat list of all errors across all files. */
  errors: EaValidationError[];
}

/** Summary stats for loaded EA artifacts. */
export interface EaSummary {
  /** Total artifacts loaded (valid only). */
  totalArtifacts: number;
  /** Count per domain. */
  byDomain: Record<string, number>;
  /** Count per kind. */
  byKind: Record<string, number>;
  /** Count per status. */
  byStatus: Record<string, number>;
  /** Total errors encountered. */
  errorCount: number;
  /** Total relations across all artifacts. */
  relationCount: number;
}

// ─── YAML → Flat Normalization ──────────────────────────────────────────────────

/**
 * Normalize a YAML-envelope artifact into the flat `EaArtifactBase` shape.
 *
 * YAML artifacts use:
 *   - `metadata.name`    → `title`
 *   - `metadata.summary` → `summary`
 *   - `metadata.owners`  → `owners`
 *   - `metadata.*`       → remaining metadata fields hoist to root
 *   - `spec.*`           → kind-specific fields hoist to root
 *   - `anchors`          → normalized from structured objects to string arrays
 *   - `relations`        → already matches EaRelation shape
 *
 * JSON artifacts (already flat) pass through unchanged.
 */
export function normalizeArtifact(raw: Record<string, unknown>): Record<string, unknown> {
  // If there's no `metadata` wrapper, assume it's already flat
  if (!raw.metadata || typeof raw.metadata !== "object") {
    return raw;
  }

  const metadata = raw.metadata as Record<string, unknown>;
  const spec = (raw.spec && typeof raw.spec === "object")
    ? raw.spec as Record<string, unknown>
    : {};

  const normalized: Record<string, unknown> = {
    // Core identity fields from root
    id: raw.id,
    kind: raw.kind,
    schemaVersion: metadata.schemaVersion ?? raw.schemaVersion,

    // Metadata fields lifted + renamed
    title: metadata.name ?? metadata.title,
    summary: metadata.summary,
    owners: metadata.owners,
    status: metadata.status,
    confidence: metadata.confidence,
    tags: metadata.tags,
  };

  // Hoist kind-specific fields from spec
  for (const [key, value] of Object.entries(spec)) {
    normalized[key] = value;
  }

  // Normalize anchors
  if (raw.anchors && typeof raw.anchors === "object") {
    normalized.anchors = normalizeAnchors(raw.anchors as Record<string, unknown>);
  }

  // Normalize relations
  if (Array.isArray(raw.relations)) {
    normalized.relations = normalizeRelations(raw.relations);
  }

  // Preserve any extra root fields not covered above
  const knownRootKeys = new Set([
    "id", "kind", "apiVersion", "metadata", "spec", "anchors", "relations",
    "traceRefs", "risk", "compliance", "extensions",
  ]);
  for (const [key, value] of Object.entries(raw)) {
    if (!knownRootKeys.has(key) && normalized[key] === undefined) {
      normalized[key] = value;
    }
  }
  for (const key of ["traceRefs", "risk", "compliance", "extensions"]) {
    if (raw[key] !== undefined) {
      normalized[key] = raw[key];
    }
  }

  return normalized;
}

/**
 * Normalize structured anchor objects into flat string arrays.
 *
 * YAML uses: `interfaces: [{symbol, file}]`, `apis: [{route, file}]`, etc.
 * TS expects: `symbols: string[]`, `apis: string[]`, etc.
 */
function normalizeAnchors(raw: Record<string, unknown>): EaAnchors {
  const anchors: EaAnchors = {};

  const extract = (
    items: unknown[],
    field: string
  ): string[] => {
    return items
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "object" && item !== null) {
          const obj = item as Record<string, unknown>;
          // Try the specified field first, then common field names
          return (
            obj[field] ?? obj.symbol ?? obj.route ?? obj.name ??
            obj.topic ?? obj.path ?? obj.ref
          );
        }
        return undefined;
      })
      .filter((v): v is string => typeof v === "string");
  };

  // Map YAML anchor categories to flat EaAnchors fields
  const mapping: Record<string, { target: keyof EaAnchors; field: string }> = {
    interfaces: { target: "symbols", field: "symbol" },
    symbols: { target: "symbols", field: "symbol" },
    apis: { target: "apis", field: "route" },
    events: { target: "events", field: "topic" },
    topics: { target: "events", field: "topic" },
    schemas: { target: "schemas", field: "name" },
    infra: { target: "infra", field: "path" },
    configs: { target: "infra", field: "path" },
    catalogRefs: { target: "catalogRefs", field: "ref" },
    iam: { target: "iam", field: "ref" },
    network: { target: "network", field: "ref" },
  };

  for (const [yamlKey, { target, field }] of Object.entries(mapping)) {
    const arr = raw[yamlKey];
    if (Array.isArray(arr) && arr.length > 0) {
      const existing = (anchors[target] as string[] | undefined) ?? [];
      (anchors as Record<string, unknown>)[target] = [
        ...existing,
        ...extract(arr, field),
      ];
    }
  }

  // Handle `other` — pass through if already a Record<string, string[]>
  if (raw.other && typeof raw.other === "object") {
    anchors.other = raw.other as Record<string, string[]>;
  }

  return anchors;
}

/**
 * Normalize YAML relations to match EaRelation shape.
 * YAML uses `metadata.criticality` / `metadata.description`; TS uses flat fields.
 */
function normalizeRelations(rawRelations: unknown[]): EaRelation[] {
  return rawRelations
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => {
      const relation: EaRelation = {
        type: r.type as string,
        target: r.target as string,
      };

      // Hoist from nested metadata if present
      const meta = (r.metadata && typeof r.metadata === "object")
        ? r.metadata as Record<string, unknown>
        : {};

      const desc = r.description ?? meta.description;
      if (typeof desc === "string") relation.description = desc;

      const crit = r.criticality ?? meta.criticality;
      if (typeof crit === "string") relation.criticality = crit as EaRelation["criticality"];

      const status = r.status ?? meta.status;
      if (typeof status === "string") relation.status = status as EaRelation["status"];

      return relation;
    });
}

// ─── File Loading ───────────────────────────────────────────────────────────────

const EA_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

async function parseArtifactFile(filePath: string): Promise<Record<string, unknown>> {
  const content = await readFile(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();

  if (ext === ".json") {
    return JSON.parse(content) as Record<string, unknown>;
  }

  if (ext === ".yaml" || ext === ".yml") {
    const parsed = parseYaml(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("YAML file does not contain an object");
    }
    return parsed as Record<string, unknown>;
  }

  throw new Error(`Unsupported file extension: ${ext}`);
}

/**
 * Recursively collect all EA artifact files from a directory.
 */
async function collectFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);

    if (s.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else if (s.isFile() && EA_EXTENSIONS.has(extname(entry).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

// ─── Config file path constant ──────────────────────────────────────────────────

const CONFIG_FILE = ".anchored-spec/config.json";

// ─── EaRoot ─────────────────────────────────────────────────────────────────────

/**
 * EA artifact loader and project root — the primary entry point for v1.0.
 *
 * Replaces SpecRoot from core. Scans configured domain directories for
 * `.json` and `.yaml` files, normalizes YAML envelope format, and validates
 * each artifact against its kind-specific JSON Schema.
 *
 * Supports both v0.x (nested config with `ea?` section) and v1.0
 * (`AnchoredSpecConfigV1`) config formats.
 */
export class EaRoot {
  readonly projectRoot: string;
  readonly eaConfig: EaConfig;
  /** The v1 config, if available (null when constructed from v0.x config). */
  readonly v1Config: AnchoredSpecConfigV1 | null;

  private loaded: EaLoadResult | null = null;

  /**
   * Construct from v0.x config (backward-compatible).
   */
  constructor(projectRoot: string, config: LegacyAnchoredSpecConfig);
  /**
   * Construct from v1.0 config directly.
   */
  constructor(projectRoot: string, config: AnchoredSpecConfigV1);
  constructor(projectRoot: string, config: LegacyAnchoredSpecConfig | AnchoredSpecConfigV1) {
    this.projectRoot = resolve(projectRoot);
    if ("schemaVersion" in config && config.schemaVersion === "1.0") {
      const v1 = config as AnchoredSpecConfigV1;
      this.v1Config = v1;
      this.eaConfig = v1ConfigToEaConfig(v1);
    } else {
      const legacy = config as LegacyAnchoredSpecConfig;
      this.v1Config = null;
      this.eaConfig = resolveEaConfig(legacy.ea);
    }
  }

  // ─── Static Factory Methods ─────────────────────────────────────────────────

  /**
   * Walk up from `startDir` to find the project root
   * (directory containing `.anchored-spec/config.json`).
   */
  static findProjectRoot(startDir: string): string | null {
    let current = resolve(startDir);

    while (true) {
      if (existsSync(join(current, CONFIG_FILE))) {
        return current;
      }
      // Also check for EA root dir
      if (existsSync(join(current, "ea", "systems"))) {
        return current;
      }
      // Legacy: check for specs/ dir
      if (
        existsSync(join(current, "specs", "requirements")) ||
        existsSync(join(current, "specs", "workflow-policy.json"))
      ) {
        return current;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return null;
  }

  /**
   * Read and resolve configuration from a project root directory.
   * Automatically detects v0.x vs v1.0 config format.
   */
  static resolveProjectConfig(projectRoot: string): AnchoredSpecConfigV1 {
    const absRoot = resolve(projectRoot);
    const configPath = join(absRoot, CONFIG_FILE);

    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      const version = detectConfigVersion(raw);

      if (version === "1.0") {
        return resolveConfigV1(raw as Partial<AnchoredSpecConfigV1>);
      }

      // v0.x — migrate on the fly
      return migrateConfigV0ToV1(raw as LegacyConfigInput);
    }

    // No config file — return defaults
    return resolveConfigV1();
  }

  /**
   * Create an EaRoot by finding the project root from a start directory
   * and loading its configuration.
   *
   * Returns null if no project root is found.
   */
  static fromDirectory(startDir: string): EaRoot | null {
    const projectRoot = EaRoot.findProjectRoot(startDir);
    if (!projectRoot) return null;

    const config = EaRoot.resolveProjectConfig(projectRoot);
    return new EaRoot(projectRoot, config);
  }

  // ─── Domain / Path Helpers ──────────────────────────────────────────────────

  /** Resolve the absolute path for a domain directory. */
  private domainDir(domain: EaDomain): string {
    return join(this.projectRoot, this.eaConfig.domains[domain]);
  }

  /** Check if EA is initialized (root dir exists with at least one domain dir). */
  isInitialized(): boolean {
    const rootDir = join(this.projectRoot, this.eaConfig.rootDir);
    if (!existsSync(rootDir)) return false;

    return EA_DOMAINS.some((d) => existsSync(this.domainDir(d)));
  }

  /** Absolute path to the workflow policy file. */
  get workflowPolicyPath(): string {
    const policyPath = this.v1Config?.workflowPolicyPath
      ?? `${this.eaConfig.rootDir}/workflow-policy.yaml`;
    return join(this.projectRoot, policyPath);
  }

  // ─── Artifact Loading ───────────────────────────────────────────────────────

  /** Load all EA artifacts across all configured domains. */
  async loadArtifacts(): Promise<EaLoadResult> {
    const allDetails: EaLoadedArtifact[] = [];

    for (const domain of EA_DOMAINS) {
      const domainResult = await this.loadDomain(domain);
      allDetails.push(...domainResult.details);
    }

    const artifacts = allDetails
      .filter((d) => d.artifact !== undefined)
      .map((d) => d.artifact!);
    const errors = allDetails.flatMap((d) => d.errors);

    this.loaded = { artifacts, details: allDetails, errors };
    return this.loaded;
  }

  /** Load artifacts from a specific domain. */
  async loadDomain(domain: EaDomain): Promise<EaLoadResult> {
    const dir = this.domainDir(domain);
    const files = await collectFiles(dir);
    const details: EaLoadedArtifact[] = [];

    for (const filePath of files) {
      const relativePath = relative(this.projectRoot, filePath);
      const loadResult: EaLoadedArtifact = {
        filePath,
        relativePath,
        domain,
        errors: [],
      };

      try {
        const raw = await parseArtifactFile(filePath);
        const normalized = normalizeArtifact(raw);

        // Validate against JSON schema
        const schemaResult = validateEaSchema(normalized);
        if (!schemaResult.valid) {
          loadResult.errors.push(
            ...schemaResult.errors.map((e) => ({
              ...e,
              message: `${relativePath}: ${e.message}`,
              rule: e.rule,
            }))
          );
        }

        // Even if schema validation fails, keep the artifact for quality rules
        loadResult.artifact = normalized as unknown as EaArtifactBase;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        loadResult.errors.push({
          path: relativePath,
          message: `${relativePath}: Parse error — ${message}`,
          severity: "error",
          rule: "ea:loader:parse-error",
        });
      }

      details.push(loadResult);
    }

    const artifacts = details
      .filter((d) => d.artifact !== undefined)
      .map((d) => d.artifact!);
    const errors = details.flatMap((d) => d.errors);

    return { artifacts, details, errors };
  }

  // ─── Policy & Verifications ─────────────────────────────────────────────────

  /**
   * Load the workflow policy file (JSON or YAML).
   * Returns null if the file doesn't exist.
   */
  loadPolicy(): Record<string, unknown> | null {
    const policyPath = this.workflowPolicyPath;
    if (!existsSync(policyPath)) return null;

    try {
      const content = readFileSync(policyPath, "utf-8");
      const ext = extname(policyPath).toLowerCase();

      if (ext === ".yaml" || ext === ".yml") {
        return parseYaml(content) as Record<string, unknown>;
      }
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Load change verification files from the transitions domain.
   */
  loadVerifications(): Record<string, unknown>[] {
    const transitionsDir = this.domainDir("transitions");
    if (!existsSync(transitionsDir)) return [];

    const verifications: Record<string, unknown>[] = [];
    try {
      const entries = readdirSync(transitionsDir);
      for (const entry of entries) {
        const fullPath = join(transitionsDir, entry);
        if (statSync(fullPath).isDirectory()) {
          const verifyPath = join(fullPath, "verification.json");
          if (existsSync(verifyPath)) {
            verifications.push(
              JSON.parse(readFileSync(verifyPath, "utf-8")) as Record<string, unknown>
            );
          }
          const verifyYaml = join(fullPath, "verification.yaml");
          if (existsSync(verifyYaml)) {
            verifications.push(
              parseYaml(readFileSync(verifyYaml, "utf-8")) as Record<string, unknown>
            );
          }
        }
      }
    } catch {
      // Non-fatal
    }
    return verifications;
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  /** Get summary of loaded artifacts. Call after `loadArtifacts()`. */
  getSummary(): EaSummary {
    const artifacts = this.loaded?.artifacts ?? [];
    const errors = this.loaded?.errors ?? [];

    const byDomain: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let relationCount = 0;

    for (const a of artifacts) {
      const domain = getDomainForKind(a.kind) ?? "unknown";
      byDomain[domain] = (byDomain[domain] ?? 0) + 1;
      byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      relationCount += a.relations?.length ?? 0;
    }

    return {
      totalArtifacts: artifacts.length,
      byDomain,
      byKind,
      byStatus,
      errorCount: errors.length,
      relationCount,
    };
  }

  /**
   * Quick summary using filesystem scan — no JSON parsing needed.
   * Counts artifact files per domain.
   */
  getQuickSummary(): {
    initialized: boolean;
    fileCountByDomain: Record<string, number>;
    totalFiles: number;
    hasPolicy: boolean;
  } {
    if (!this.isInitialized()) {
      return { initialized: false, fileCountByDomain: {}, totalFiles: 0, hasPolicy: false };
    }

    const fileCountByDomain: Record<string, number> = {};
    let totalFiles = 0;

    for (const domain of EA_DOMAINS) {
      const dir = this.domainDir(domain);
      const count = countArtifactFiles(dir);
      if (count > 0) {
        fileCountByDomain[domain] = count;
        totalFiles += count;
      }
    }

    return {
      initialized: true,
      fileCountByDomain,
      totalFiles,
      hasPolicy: existsSync(this.workflowPolicyPath),
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Recursively count artifact files in a directory without parsing. */
function countArtifactFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const s = statSync(fullPath);
      if (s.isDirectory()) {
        count += countArtifactFiles(fullPath);
      } else if (s.isFile() && EA_EXTENSIONS.has(extname(entry).toLowerCase())) {
        count++;
      }
    }
  } catch {
    // Non-fatal
  }
  return count;
}
