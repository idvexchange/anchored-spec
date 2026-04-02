/**
 * Anchored Spec — Terraform Resolver
 *
 * Reads `terraform show -json` state/plan output to validate infrastructure
 * anchors, collect observed cloud resource state, and discover delivery/data
 * layer entities.
 *
 * Supports AWS, GCP, and Azure resource type mappings.
 *
 * Design reference: docs/delivery/discovery-drift-generation.md (Terraform Resolver)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { EntityDraft } from "../discovery.js";
import { getSchemaDescriptor } from "../backstage/kind-mapping.js";
import type { BackstageEntity } from "../backstage/types.js";
import { getEntityAnchors } from "../backstage/accessors.js";
import type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
} from "./types.js";

// ─── Terraform State Shape ──────────────────────────────────────────────────────

/** Root shape of `terraform show -json` output. */
export interface TerraformState {
  format_version?: string;
  terraform_version?: string;
  values?: {
    root_module?: TerraformModule;
  };
  /** For plan JSON: planned_values instead of values. */
  planned_values?: {
    root_module?: TerraformModule;
  };
  /** Internal: source file path relative to project root. */
  _sourceFile?: string;
}

/** A Terraform module containing resources and child modules. */
export interface TerraformModule {
  resources?: TerraformResource[];
  child_modules?: TerraformModule[];
}

/** A single Terraform resource in state/plan. */
export interface TerraformResource {
  /** Full resource address, e.g. "aws_rds_instance.main" or "module.db.aws_rds_instance.primary". */
  address: string;
  /** Resource type, e.g. "aws_rds_instance", "aws_s3_bucket". */
  type: string;
  /** Resource name in the config. */
  name: string;
  /** Provider, e.g. "provider[\"registry.terraform.io/hashicorp/aws\"]". */
  provider_name?: string;
  /** Resource attribute values. */
  values?: Record<string, unknown>;
  /** Resource mode: "managed" or "data". */
  mode?: string;
}

// ─── Resource Type → EA Kind Mapping ────────────────────────────────────────────

interface EaMapping {
  schema: string;
  /** Optional: also create a second entity for another schema profile. */
  alsoSchema?: string;
}

/** Map Terraform resource type patterns to EA kinds. */
const TF_RESOURCE_MAP: Array<{ pattern: RegExp; mapping: EaMapping }> = [
  // AWS RDS → cloud-resource + data-store
  {
    pattern: /^aws_rds_/,
    mapping: {
      schema: "cloud-resource",
      alsoSchema: "data-store",
    },
  },
  // AWS DynamoDB → cloud-resource + data-store
  {
    pattern: /^aws_dynamodb_/,
    mapping: {
      schema: "cloud-resource",
      alsoSchema: "data-store",
    },
  },
  // AWS ElastiCache → cloud-resource + data-store
  {
    pattern: /^aws_elasticache_/,
    mapping: {
      schema: "cloud-resource",
      alsoSchema: "data-store",
    },
  },
  // AWS ECS/EKS → platform
  { pattern: /^aws_ecs_/, mapping: { schema: "platform" } },
  { pattern: /^aws_eks_/, mapping: { schema: "platform" } },
  // AWS S3 → cloud-resource
  { pattern: /^aws_s3_/, mapping: { schema: "cloud-resource" } },
  // AWS Security Groups → network-zone
  { pattern: /^aws_security_group/, mapping: { schema: "network-zone" } },
  // AWS IAM roles → identity-boundary
  { pattern: /^aws_iam_role/, mapping: { schema: "identity-boundary" } },
  // AWS Lambda → cloud-resource
  { pattern: /^aws_lambda_/, mapping: { schema: "cloud-resource" } },
  // AWS SQS/SNS → cloud-resource
  { pattern: /^aws_sqs_/, mapping: { schema: "cloud-resource" } },
  { pattern: /^aws_sns_/, mapping: { schema: "cloud-resource" } },
  // GCP SQL → cloud-resource + data-store
  {
    pattern: /^google_sql_/,
    mapping: {
      schema: "cloud-resource",
      alsoSchema: "data-store",
    },
  },
  // GCP GKE → platform
  { pattern: /^google_container_/, mapping: { schema: "platform" } },
  // GCP Storage → cloud-resource
  { pattern: /^google_storage_/, mapping: { schema: "cloud-resource" } },
  // GCP IAM → identity-boundary
  { pattern: /^google_service_account/, mapping: { schema: "identity-boundary" } },
  // Azure SQL → cloud-resource + data-store
  {
    pattern: /^azurerm_(?:mssql|postgresql|mysql|cosmosdb)_/,
    mapping: {
      schema: "cloud-resource",
      alsoSchema: "data-store",
    },
  },
  // Azure AKS → platform
  { pattern: /^azurerm_kubernetes_/, mapping: { schema: "platform" } },
  // Azure Storage → cloud-resource
  { pattern: /^azurerm_storage_/, mapping: { schema: "cloud-resource" } },
  // Azure Network Security Group → network-zone
  { pattern: /^azurerm_network_security_group/, mapping: { schema: "network-zone" } },
];

/** Find the EA mapping for a Terraform resource type. */
function findMapping(resourceType: string): EaMapping | undefined {
  for (const { pattern, mapping } of TF_RESOURCE_MAP) {
    if (pattern.test(resourceType)) return mapping;
  }
  return undefined;
}

// ─── State Parsing ──────────────────────────────────────────────────────────────

/**
 * Flatten all resources from a Terraform state/plan JSON, including child modules.
 */
export function flattenResources(state: TerraformState): TerraformResource[] {
  const rootModule = state.values?.root_module ?? state.planned_values?.root_module;
  if (!rootModule) return [];

  const resources: TerraformResource[] = [];

  function collect(mod: TerraformModule): void {
    if (mod.resources) {
      for (const r of mod.resources) {
        if (r.mode === "data") continue; // skip data sources
        resources.push(r);
      }
    }
    if (mod.child_modules) {
      for (const child of mod.child_modules) {
        collect(child);
      }
    }
  }

  collect(rootModule);
  return resources;
}

// ─── File Discovery ─────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".anchored-spec", ".terraform"]);

/**
 * Find Terraform state/plan JSON files in a directory.
 * Looks for files containing Terraform state format markers.
 */
export function findTerraformStateFiles(rootDir: string, maxDepth = 3): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;

      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && extname(entry).toLowerCase() === ".json") {
        if (isTerraformState(full)) {
          results.push(full);
        }
      }
    }
  }

  walk(rootDir, 0);
  return results;
}

/** Quick check: does this JSON file look like Terraform state/plan output? */
function isTerraformState(filepath: string): boolean {
  try {
    const content = readFileSync(filepath, "utf-8").slice(0, 2000);
    return (
      content.includes('"format_version"') &&
      (content.includes('"terraform_version"') || content.includes('"values"') || content.includes('"planned_values"'))
    );
  } catch {
    return false;
  }
}

/**
 * Load and parse a Terraform state/plan JSON file.
 */
export function loadTerraformState(filepath: string, projectRoot: string): TerraformState | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = JSON.parse(content) as TerraformState;

    if (!parsed.format_version) return null;
    if (!parsed.values?.root_module && !parsed.planned_values?.root_module) return null;

    parsed._sourceFile = relative(projectRoot, filepath);
    return parsed;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Slugify a name for use as artifact ID. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Extract useful attributes from a resource for metadata. */
function extractResourceMeta(resource: TerraformResource): Record<string, unknown> {
  const vals = resource.values ?? {};
  const meta: Record<string, unknown> = {
    address: resource.address,
    type: resource.type,
    provider: resource.provider_name,
  };

  // Common useful attributes
  if (vals.arn) meta.arn = vals.arn;
  if (vals.id) meta.resourceId = vals.id;
  if (vals.name) meta.resourceName = vals.name;
  if (vals.tags) meta.tags = vals.tags;
  if (vals.region) meta.region = vals.region;
  if (vals.engine) meta.engine = vals.engine;
  if (vals.engine_version) meta.engineVersion = vals.engine_version;
  if (vals.instance_class) meta.instanceClass = vals.instance_class;
  if (vals.bucket) meta.bucket = vals.bucket;

  return meta;
}

// ─── Terraform Resolver ─────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "terraform:state";

/**
 * Terraform Resolver — resolves infra anchors against Terraform state,
 * collects observed cloud resource state, and discovers delivery/data entities.
 *
 * Reads `terraform show -json` output (state or plan).
 */
export class TerraformResolver implements EaResolver {
  readonly name = "terraform";
  readonly domains: EaResolver["domains"] = ["delivery", "data"];
  readonly schemas = ["cloud-resource", "data-store", "platform", "network-zone", "identity-boundary"];

  /**
   * Resolve infrastructure anchors against Terraform state.
   *
   * Anchors in the `infra` category matching `terraform:*` pattern are checked.
   * Format: `terraform:resource_address` (e.g., `terraform:aws_rds_instance.main`)
   */
  resolveAnchors(
    entity: BackstageEntity,
    ctx: EaResolverContext,
  ): EaAnchorResolution[] | null {
    const infraAnchors = getEntityAnchors(entity)?.infra;
    if (!infraAnchors || infraAnchors.length === 0) return null;

    const tfAnchors = infraAnchors.filter((a) => a.startsWith("terraform:"));
    if (tfAnchors.length === 0) return null;

    const resources = this.loadResources(ctx);
    if (resources.length === 0) {
      ctx.logger.warn("No Terraform state found", { projectRoot: ctx.projectRoot });
      return null;
    }

    const addressIndex = new Map<string, TerraformResource>();
    for (const r of resources) {
      addressIndex.set(r.address, r);
    }

    const resolutions: EaAnchorResolution[] = [];
    const now = new Date().toISOString();

    for (const anchor of tfAnchors) {
      const address = anchor.slice("terraform:".length);
      const resource = addressIndex.get(address);

      if (resource) {
        resolutions.push({
          anchorKind: "infra",
          anchorValue: anchor,
          status: "found",
          confidence: "high",
          resolvedAt: now,
          foundIn: resource.provider_name ? [resource.provider_name] : undefined,
          metadata: extractResourceMeta(resource),
        });
      } else {
        resolutions.push({
          anchorKind: "infra",
          anchorValue: anchor,
          status: "missing",
          confidence: "high",
          resolvedAt: now,
          message: `Terraform resource ${address} not found in state`,
        });
      }
    }

    return resolutions;
  }

  /**
   * Collect observed state from Terraform state/plan.
   */
  collectObservedState(ctx: EaResolverContext): ObservedEaState | null {
    const resources = this.loadResources(ctx);
    if (resources.length === 0) return null;

    const entities: ObservedEntity[] = [];

    for (const r of resources) {
      const mapping = findMapping(r.type);
      if (!mapping) continue;
      const descriptor = getSchemaDescriptor(mapping.schema);
      if (!descriptor) continue;

      entities.push({
        externalId: r.address,
        inferredSchema: descriptor.schema,
        inferredDomain: descriptor.domain as ObservedEntity["inferredDomain"],
        metadata: extractResourceMeta(r),
      });

      // Also create entity for secondary kind (e.g., data-store for RDS)
      if (mapping.alsoSchema) {
        const alsoDescriptor = getSchemaDescriptor(mapping.alsoSchema);
        if (!alsoDescriptor) continue;
        entities.push({
          externalId: `${r.address}:${alsoDescriptor.schema}`,
          inferredSchema: alsoDescriptor.schema,
          inferredDomain: alsoDescriptor.domain as ObservedEntity["inferredDomain"],
          metadata: { ...extractResourceMeta(r), derivedFrom: r.address },
        });
      }
    }

    return {
      source: "terraform",
      collectedAt: new Date().toISOString(),
      entities,
      relationships: [],
    };
  }

  /**
   * Discover EA entities from Terraform resources.
   *
   * Maps cloud resources to EA schema profiles based on resource type patterns.
   */
  discoverEntities(ctx: EaResolverContext): EntityDraft[] | null {
    const resources = this.loadResources(ctx);
    if (resources.length === 0) return null;

    const drafts: EntityDraft[] = [];
    const now = new Date().toISOString();
    const seen = new Set<string>();

    for (const r of resources) {
      const mapping = findMapping(r.type);
      if (!mapping) continue;
      const descriptor = getSchemaDescriptor(mapping.schema);
      if (!descriptor) continue;

      const slug = slugify(r.address);
      const dedupeKey = `${descriptor.schema}:${r.address}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const resourceName = (r.values?.name as string) ?? r.name;
      const title = `${r.type} ${resourceName}`;

      drafts.push({
        suggestedId: `${descriptor.kind.toLowerCase()}:${slug}`,
        apiVersion: descriptor.apiVersion,
        kind: descriptor.kind,
        type: descriptor.specType,
        schema: descriptor.schema,
        title,
        summary: `${descriptor.schema} discovered from Terraform resource ${r.address}`,
        status: "draft",
        confidence: "observed",
        anchors: { infra: [`terraform:${r.address}`] },
        discoveredBy: "terraform",
        discoveredAt: now,
        schemaFields: extractResourceMeta(r),
      });

      // Also create draft for secondary kind
      if (mapping.alsoSchema) {
        const alsoDescriptor = getSchemaDescriptor(mapping.alsoSchema);
        if (!alsoDescriptor) continue;
        const alsoKey = `${alsoDescriptor.schema}:${r.address}`;
        if (!seen.has(alsoKey)) {
          seen.add(alsoKey);
          const alsoSlug = slugify(`${r.address}-${alsoDescriptor.schema}`);
          drafts.push({
            suggestedId: `${alsoDescriptor.kind.toLowerCase()}:${alsoSlug}`,
            apiVersion: alsoDescriptor.apiVersion,
            kind: alsoDescriptor.kind,
            type: alsoDescriptor.specType,
            schema: alsoDescriptor.schema,
            title: `${resourceName} (${alsoDescriptor.schema})`,
            summary: `${alsoDescriptor.schema} discovered from Terraform resource ${r.address}`,
            status: "draft",
            confidence: "observed",
            anchors: { infra: [`terraform:${r.address}`] },
            discoveredBy: "terraform",
            discoveredAt: now,
            schemaFields: {
              ...extractResourceMeta(r),
              derivedFrom: r.address,
            },
          });
        }
      }
    }

    return drafts.length > 0 ? drafts : null;
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /** Load all Terraform resources, using cache when available. */
  private loadResources(ctx: EaResolverContext): TerraformResource[] {
    const cacheKey = `${CACHE_KEY_PREFIX}:${ctx.source ?? "default"}`;
    const cached = ctx.cache.get<TerraformResource[]>(cacheKey);
    if (cached) {
      ctx.logger.debug("Using cached Terraform resources", { count: cached.length });
      return cached;
    }

    const scanDir = ctx.source ? join(ctx.projectRoot, ctx.source) : ctx.projectRoot;
    ctx.logger.debug("Scanning for Terraform state files", { dir: scanDir });

    const files = findTerraformStateFiles(scanDir);
    const allResources: TerraformResource[] = [];

    for (const file of files) {
      const state = loadTerraformState(file, ctx.projectRoot);
      if (state) {
        const resources = flattenResources(state);
        allResources.push(...resources);
        ctx.logger.debug("Loaded Terraform state", {
          file: state._sourceFile,
          resources: resources.length,
        });
      }
    }

    if (allResources.length > 0) {
      ctx.cache.set(cacheKey, allResources);
    }

    ctx.logger.info(`Found ${allResources.length} Terraform resource(s)`, {
      files: files.map((f) => relative(ctx.projectRoot, f)),
    });

    return allResources;
  }
}
