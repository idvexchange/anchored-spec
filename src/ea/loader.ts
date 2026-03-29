/**
 * Anchored Spec — EA Artifact Loader
 *
 * Loads EA artifacts from the filesystem, supporting both JSON and YAML formats.
 * YAML artifacts use a `metadata` envelope that is normalized to the flat
 * `EaArtifactBase` shape before validation.
 *
 * Design reference: docs/ea-implementation-guide.md §PR A3
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AnchoredSpecConfig } from "../core/types.js";
import type { EaArtifactBase, EaDomain, EaAnchors, EaRelation } from "./types.js";
import { EA_DOMAINS, getDomainForKind } from "./types.js";
import { resolveEaConfig, type EaConfig } from "./config.js";
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

// ─── EaRoot ─────────────────────────────────────────────────────────────────────

/**
 * EA artifact loader. Scans configured domain directories for `.json` and
 * `.yaml` files, normalizes YAML envelope format, and validates each artifact
 * against its kind-specific JSON Schema.
 */
export class EaRoot {
  readonly projectRoot: string;
  readonly eaConfig: EaConfig;

  private loaded: EaLoadResult | null = null;

  constructor(projectRoot: string, config: AnchoredSpecConfig) {
    this.projectRoot = projectRoot;
    this.eaConfig = resolveEaConfig(config.ea);
  }

  /** Resolve the absolute path for a domain directory. */
  private domainDir(domain: EaDomain): string {
    return join(this.projectRoot, this.eaConfig.domains[domain]);
  }

  /** Check if EA is initialized (root dir exists with at least one domain dir). */
  isInitialized(): boolean {
    const rootDir = join(this.projectRoot, this.eaConfig.rootDir);
    if (!existsSync(rootDir)) return false;

    // Check for at least one domain directory
    return EA_DOMAINS.some((d) => existsSync(this.domainDir(d)));
  }

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

  /** Get summary of loaded artifacts. Call after `loadArtifacts()`. */
  getSummary(): EaSummary {
    const artifacts = this.loaded?.artifacts ?? [];
    const errors = this.loaded?.errors ?? [];

    const byDomain: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let relationCount = 0;

    for (const a of artifacts) {
      // Domain from kind registry, or from ID prefix
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
}
