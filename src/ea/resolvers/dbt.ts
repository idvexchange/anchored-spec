/**
 * Anchored Spec — dbt Resolver
 *
 * Parses dbt manifest.json to validate data anchors, collect observed
 * data lineage state, and discover data-product/data-quality-rule/lineage entities.
 *
 * Design reference: docs/delivery/discovery-drift-generation.md (dbt Resolver)
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { getSchemaDescriptor } from "../backstage/kind-mapping.js";
import type { BackstageEntity } from "../backstage/types.js";
import { getEntityAnchors } from "../backstage/accessors.js";
import type { EaArtifactDraft } from "../discovery.js";
import type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
  ObservedRelationship,
} from "./types.js";

// ─── dbt Manifest Types ─────────────────────────────────────────────────────────

/** Minimal shape of dbt manifest.json. */
export interface DbtManifest {
  metadata?: {
    dbt_schema_version?: string;
    project_name?: string;
    generated_at?: string;
  };
  nodes?: Record<string, DbtNode>;
  sources?: Record<string, DbtSource>;
  exposures?: Record<string, DbtExposure>;
  /** Internal: source file path relative to project root. */
  _sourceFile?: string;
}

/** A node in the dbt DAG (model, test, seed, snapshot). */
export interface DbtNode {
  unique_id: string;
  name: string;
  resource_type: "model" | "test" | "seed" | "snapshot" | "analysis";
  description?: string;
  schema?: string;
  database?: string;
  depends_on?: { nodes?: string[] };
  tags?: string[];
  config?: {
    materialized?: string;
    tags?: string[];
  };
  columns?: Record<string, { name: string; description?: string; data_type?: string }>;
  /** For tests: test metadata. */
  test_metadata?: {
    name?: string;
    kwargs?: Record<string, unknown>;
  };
}

/** A dbt source definition. */
export interface DbtSource {
  unique_id: string;
  name: string;
  source_name: string;
  source_description?: string;
  description?: string;
  schema?: string;
  database?: string;
  columns?: Record<string, { name: string; description?: string }>;
}

/** A dbt exposure. */
export interface DbtExposure {
  unique_id: string;
  name: string;
  type?: string;
  description?: string;
  depends_on?: { nodes?: string[] };
  owner?: { name?: string; email?: string };
}

// ─── File Discovery ─────────────────────────────────────────────────────────────

const DBT_MANIFEST_PATHS = [
  "target/manifest.json",
  "dbt_packages/manifest.json",
  "logs/manifest.json",
];

/** Find dbt manifest.json files in the project. */
export function findDbtManifests(rootDir: string): string[] {
  const results: string[] = [];

  // Check common dbt output locations
  for (const relPath of DBT_MANIFEST_PATHS) {
    const full = join(rootDir, relPath);
    if (existsSync(full)) {
      results.push(full);
    }
  }

  // Also scan for any manifest.json that looks like dbt output
  try {
    const entries = readdirSync(rootDir);
    for (const entry of entries) {
      if (entry === "target" || entry === "dbt_packages") continue; // already checked
      const candidate = join(rootDir, entry, "manifest.json");
      if (existsSync(candidate) && isDbtManifest(candidate)) {
        results.push(candidate);
      }
    }
  } catch {
    // skip
  }

  return results;
}

function isDbtManifest(filepath: string): boolean {
  try {
    const content = readFileSync(filepath, "utf-8").slice(0, 2000);
    return content.includes('"dbt_schema_version"') || content.includes('"dbt_version"');
  } catch {
    return false;
  }
}

/** Load and parse a dbt manifest.json file. */
export function loadDbtManifest(filepath: string, projectRoot: string): DbtManifest | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = JSON.parse(content) as DbtManifest;

    if (!parsed.nodes && !parsed.sources) return null;

    parsed._sourceFile = relative(projectRoot, filepath);
    return parsed;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Extract models (resource_type === "model") from manifest nodes. */
export function extractModels(manifest: DbtManifest): DbtNode[] {
  if (!manifest.nodes) return [];
  return Object.values(manifest.nodes).filter((n) => n.resource_type === "model");
}

/** Extract tests from manifest nodes. */
export function extractTests(manifest: DbtManifest): DbtNode[] {
  if (!manifest.nodes) return [];
  return Object.values(manifest.nodes).filter((n) => n.resource_type === "test");
}

/** Extract sources from manifest. */
export function extractSources(manifest: DbtManifest): DbtSource[] {
  if (!manifest.sources) return [];
  return Object.values(manifest.sources);
}

/** Extract exposures from manifest. */
export function extractExposures(manifest: DbtManifest): DbtExposure[] {
  if (!manifest.exposures) return [];
  return Object.values(manifest.exposures);
}

// ─── dbt Resolver ───────────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "dbt:manifest";

/**
 * dbt Resolver — resolves dbt anchors against manifest.json,
 * collects observed data lineage state, and discovers data-layer artifacts.
 */
export class DbtResolver implements EaResolver {
  readonly name = "dbt";
  readonly domains: EaResolver["domains"] = ["data"];
  readonly schemas = ["data-product", "lineage", "data-quality-rule", "data-store"];

  /**
   * Resolve dbt anchors against manifest.
   * Anchors in `other.dbt` category are matched against model/test/source names.
   */
  resolveAnchors(
    entity: BackstageEntity,
    ctx: EaResolverContext,
  ): EaAnchorResolution[] | null {
    const dbtAnchors = getEntityAnchors(entity)?.other?.dbt;
    if (!dbtAnchors || dbtAnchors.length === 0) return null;

    const manifest = this.loadManifest(ctx);
    if (!manifest) {
      ctx.logger.warn("No dbt manifest found", { projectRoot: ctx.projectRoot });
      return null;
    }

    // Build index of all node/source names
    const nameIndex = new Set<string>();
    const models = extractModels(manifest);
    const tests = extractTests(manifest);
    const sources = extractSources(manifest);

    for (const m of models) nameIndex.add(m.name);
    for (const t of tests) nameIndex.add(t.name);
    for (const s of sources) {
      nameIndex.add(s.name);
      nameIndex.add(`${s.source_name}.${s.name}`);
    }

    // Also add unique_ids
    if (manifest.nodes) {
      for (const id of Object.keys(manifest.nodes)) {
        nameIndex.add(id);
      }
    }
    if (manifest.sources) {
      for (const id of Object.keys(manifest.sources)) {
        nameIndex.add(id);
      }
    }

    const resolutions: EaAnchorResolution[] = [];
    const now = new Date().toISOString();

    for (const anchor of dbtAnchors) {
      if (nameIndex.has(anchor)) {
        resolutions.push({
          anchorKind: "other.dbt",
          anchorValue: anchor,
          status: "found",
          confidence: "high",
          resolvedAt: now,
          foundIn: manifest._sourceFile ? [manifest._sourceFile] : undefined,
        });
      } else {
        resolutions.push({
          anchorKind: "other.dbt",
          anchorValue: anchor,
          status: "missing",
          confidence: "high",
          resolvedAt: now,
          message: `dbt node "${anchor}" not found in manifest`,
        });
      }
    }

    return resolutions;
  }

  /**
   * Collect observed state from dbt manifest — models, sources, tests, exposures.
   */
  collectObservedState(ctx: EaResolverContext): ObservedEaState | null {
    const manifest = this.loadManifest(ctx);
    if (!manifest) return null;

    const entities: ObservedEntity[] = [];
    const relationships: ObservedRelationship[] = [];

    // Models → data-product or lineage
    for (const model of extractModels(manifest)) {
      entities.push({
        externalId: model.unique_id,
        inferredSchema: "data-product",
        inferredDomain: "data",
        metadata: {
          name: model.name,
          schema: model.schema,
          database: model.database,
          materialized: model.config?.materialized,
          description: model.description,
          tags: model.tags,
          columnCount: model.columns ? Object.keys(model.columns).length : 0,
        },
      });

      // Lineage relationships (depends_on)
      if (model.depends_on?.nodes) {
        for (const dep of model.depends_on.nodes) {
          relationships.push({
            sourceExternalId: dep,
            targetExternalId: model.unique_id,
            type: "feeds",
          });
        }
      }
    }

    // Tests → data-quality-rule
    for (const test of extractTests(manifest)) {
      entities.push({
        externalId: test.unique_id,
        inferredSchema: "data-quality-rule",
        inferredDomain: "data",
        metadata: {
          name: test.name,
          testType: test.test_metadata?.name,
          kwargs: test.test_metadata?.kwargs,
          tags: test.tags,
        },
      });
    }

    // Sources → data-store
    for (const source of extractSources(manifest)) {
      entities.push({
        externalId: source.unique_id,
        inferredSchema: "data-store",
        inferredDomain: "data",
        metadata: {
          name: source.name,
          sourceName: source.source_name,
          schema: source.schema,
          database: source.database,
          description: source.description,
        },
      });
    }

    // Exposures
    for (const exposure of extractExposures(manifest)) {
      entities.push({
        externalId: exposure.unique_id,
        inferredSchema: "data-product",
        inferredDomain: "data",
        metadata: {
          name: exposure.name,
          type: exposure.type,
          description: exposure.description,
          owner: exposure.owner?.name,
        },
      });
    }

    return {
      source: "dbt",
      collectedAt: new Date().toISOString(),
      entities,
      relationships,
    };
  }

  /**
   * Discover data-layer entities from dbt manifest.
   */
  discoverArtifacts(ctx: EaResolverContext): EaArtifactDraft[] | null {
    const manifest = this.loadManifest(ctx);
    if (!manifest) return null;

    const drafts: EaArtifactDraft[] = [];
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const dataProduct = getSchemaDescriptor("data-product")!;
    const dataQualityRule = getSchemaDescriptor("data-quality-rule")!;
    const dataStore = getSchemaDescriptor("data-store")!;
    const lineage = getSchemaDescriptor("lineage")!;

    // Models → data-product drafts
    for (const model of extractModels(manifest)) {
      const key = `data-product:${model.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      drafts.push({
        suggestedId: `resource:${slugify(model.name)}`,
        apiVersion: dataProduct.apiVersion,
        kind: dataProduct.kind,
        type: dataProduct.specType,
        schema: dataProduct.schema,
        title: model.name,
        summary: model.description ?? `dbt model ${model.name}`,
        status: "draft",
        confidence: "observed",
        anchors: { dbt: [model.name] },
        discoveredBy: "dbt",
        discoveredAt: now,
        schemaFields: {
          schema: model.schema,
          database: model.database,
          materialized: model.config?.materialized,
          tags: model.tags,
        },
      });
    }

    // Tests → data-quality-rule drafts
    for (const test of extractTests(manifest)) {
      const key = `dqr:${test.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      drafts.push({
        suggestedId: `control:${slugify(test.name)}`,
        apiVersion: dataQualityRule.apiVersion,
        kind: dataQualityRule.kind,
        type: dataQualityRule.specType,
        schema: dataQualityRule.schema,
        title: test.name,
        summary: `dbt test: ${test.test_metadata?.name ?? test.name}`,
        status: "draft",
        confidence: "observed",
        anchors: { dbt: [test.name] },
        discoveredBy: "dbt",
        discoveredAt: now,
        schemaFields: {
          testType: test.test_metadata?.name,
          tags: test.tags,
        },
      });
    }

    // Sources → data-store drafts
    for (const source of extractSources(manifest)) {
      const key = `data-store:${source.source_name}.${source.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      drafts.push({
        suggestedId: `resource:${slugify(`${source.source_name}-${source.name}`)}`,
        apiVersion: dataStore.apiVersion,
        kind: dataStore.kind,
        type: dataStore.specType,
        schema: dataStore.schema,
        title: `${source.source_name}.${source.name}`,
        summary: source.description ?? `dbt source ${source.source_name}.${source.name}`,
        status: "draft",
        confidence: "observed",
        anchors: { dbt: [`${source.source_name}.${source.name}`] },
        discoveredBy: "dbt",
        discoveredAt: now,
        schemaFields: {
          schema: source.schema,
          database: source.database,
          sourceName: source.source_name,
        },
      });
    }

    // Lineage drafts from model dependencies
    const models = extractModels(manifest);
    for (const model of models) {
      if (!model.depends_on?.nodes?.length) continue;

      const key = `lineage:${model.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const upstreamNames = model.depends_on.nodes.map((n) => n.split(".").pop() ?? n);
      drafts.push({
        suggestedId: `exchange:${slugify(model.name)}`,
        apiVersion: lineage.apiVersion,
        kind: lineage.kind,
        type: lineage.specType,
        schema: lineage.schema,
        title: `Lineage: ${model.name}`,
        summary: `Data lineage from ${upstreamNames.join(", ")} to ${model.name}`,
        status: "draft",
        confidence: "observed",
        anchors: { dbt: [model.name] },
        discoveredBy: "dbt",
        discoveredAt: now,
        schemaFields: {
          upstream: model.depends_on.nodes,
          target: model.unique_id,
        },
      });
    }

    return drafts.length > 0 ? drafts : null;
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private loadManifest(ctx: EaResolverContext): DbtManifest | null {
    const cacheKey = `${CACHE_KEY_PREFIX}:${ctx.source ?? "default"}`;
    const cached = ctx.cache.get<DbtManifest>(cacheKey);
    if (cached) {
      ctx.logger.debug("Using cached dbt manifest");
      return cached;
    }

    const scanDir = ctx.source ? join(ctx.projectRoot, ctx.source) : ctx.projectRoot;
    ctx.logger.debug("Scanning for dbt manifest", { dir: scanDir });

    const files = findDbtManifests(scanDir);
    if (files.length === 0) return null;

    // Use the first manifest found
    const manifest = loadDbtManifest(files[0]!, ctx.projectRoot);
    if (manifest) {
      ctx.cache.set(cacheKey, manifest);
      ctx.logger.info("Loaded dbt manifest", { file: manifest._sourceFile });
    }

    return manifest;
  }
}
