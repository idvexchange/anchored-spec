/**
 * Anchored Spec — Kubernetes Resolver
 *
 * Reads Kubernetes YAML manifests to validate deployment anchors,
 * collect observed infrastructure state, and discover delivery-layer artifacts.
 *
 * Supported resource kinds: Deployment, Service, Namespace, NetworkPolicy,
 * ServiceAccount, StatefulSet, DaemonSet, HorizontalPodAutoscaler.
 *
 * Design reference: docs/delivery/discovery-drift-generation.md (Kubernetes Resolver)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { getSchemaDescriptor } from "../backstage/kind-mapping.js";
import type { BackstageEntity } from "../backstage/types.js";
import { getEntityAnchors } from "../backstage/accessors.js";
import type { EaArtifactDraft } from "../discovery.js";
import { parseSimpleYaml } from "./openapi.js";
import type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
} from "./types.js";

// ─── K8s Manifest Shape ─────────────────────────────────────────────────────────

/** Minimal shape of a parsed Kubernetes manifest. */
export interface K8sManifest {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  /** Internal: source file path relative to project root. */
  _sourceFile: string;
}

/** Mapping from K8s resource kind to anchored-spec schema profiles. */
const K8S_KIND_MAP: Record<string, { schema: string }> = {
  Deployment: { schema: "deployment" },
  StatefulSet: { schema: "deployment" },
  DaemonSet: { schema: "deployment" },
  Service: { schema: "application" },
  Namespace: { schema: "environment" },
  NetworkPolicy: { schema: "network-zone" },
  ServiceAccount: { schema: "identity-boundary" },
  HorizontalPodAutoscaler: { schema: "deployment" },
};

// ─── File Discovery ─────────────────────────────────────────────────────────────

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".anchored-spec"]);
const K8S_DIRS = ["k8s", "kubernetes", "deploy", "manifests", "helm", "charts", "kustomize"];

/**
 * Find Kubernetes manifest files in a directory.
 * Scans common K8s directories first, then falls back to recursive search.
 */
export function findK8sFiles(rootDir: string, maxDepth = 5): string[] {
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
      if (entry.startsWith(".") && SKIP_DIRS.has(entry)) continue;
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
      } else if (stat.isFile() && YAML_EXTENSIONS.has(extname(entry).toLowerCase())) {
        if (isK8sManifest(full)) {
          results.push(full);
        }
      }
    }
  }

  // Check common K8s directories first
  let found = false;
  for (const dir of K8S_DIRS) {
    const candidate = join(rootDir, dir);
    if (existsSync(candidate)) {
      walk(candidate, 0);
      found = true;
    }
  }

  // If no common dirs found, scan from root
  if (!found) {
    walk(rootDir, 0);
  }

  return results;
}

/** Quick check: does this YAML file look like a K8s manifest? */
function isK8sManifest(filepath: string): boolean {
  try {
    const content = readFileSync(filepath, "utf-8").slice(0, 1500);
    return (
      (content.includes("apiVersion:") || content.includes('"apiVersion"')) &&
      (content.includes("kind:") || content.includes('"kind"')) &&
      (content.includes("metadata:") || content.includes('"metadata"'))
    );
  } catch {
    return false;
  }
}

/**
 * Load and parse a K8s manifest file.
 * Supports multi-document YAML (separated by `---`).
 */
export function loadK8sManifests(filepath: string, projectRoot: string): K8sManifest[] {
  try {
    const content = readFileSync(filepath, "utf-8");
    const relPath = relative(projectRoot, filepath);

    // Split on document separator
    const documents = content.split(/^---$/m).filter((d) => d.trim() !== "");

    const manifests: K8sManifest[] = [];
    for (const doc of documents) {
      try {
        let parsed: unknown;
        if (doc.trim().startsWith("{")) {
          parsed = JSON.parse(doc);
        } else {
          parsed = parseSimpleYaml(doc);
        }

        if (parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).kind) {
          manifests.push({
            ...(parsed as Record<string, unknown>),
            _sourceFile: relPath,
          } as unknown as K8sManifest);
        }
      } catch {
        // Skip unparseable documents
      }
    }

    return manifests;
  } catch {
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Build a K8s resource identifier: "kind/name" or "kind/namespace/name". */
export function k8sResourceId(manifest: K8sManifest): string {
  const kind = manifest.kind ?? "Unknown";
  const name = manifest.metadata?.name ?? "unnamed";
  const ns = manifest.metadata?.namespace;
  return ns ? `${kind}/${ns}/${name}` : `${kind}/${name}`;
}

/** Extract container images from a deployment-like manifest. */
export function extractImages(manifest: K8sManifest): string[] {
  const images: string[] = [];
  const spec = manifest.spec as Record<string, unknown> | undefined;
  if (!spec) return images;

  // Deployment/StatefulSet/DaemonSet → spec.template.spec.containers
  const template = spec.template as Record<string, unknown> | undefined;
  const podSpec = (template?.spec ?? spec) as Record<string, unknown> | undefined;
  const containers = (podSpec?.containers ?? []) as Array<Record<string, unknown>>;

  for (const container of containers) {
    if (typeof container.image === "string") {
      images.push(container.image);
    }
  }

  // Also check initContainers
  const initContainers = (podSpec?.initContainers ?? []) as Array<Record<string, unknown>>;
  for (const container of initContainers) {
    if (typeof container.image === "string") {
      images.push(container.image);
    }
  }

  return images;
}

/** Extract replica count from a deployment-like manifest. */
export function extractReplicas(manifest: K8sManifest): number | undefined {
  const spec = manifest.spec as Record<string, unknown> | undefined;
  if (!spec) return undefined;

  if (typeof spec.replicas === "number") return spec.replicas;

  // HPA → spec.minReplicas / spec.maxReplicas
  if (manifest.kind === "HorizontalPodAutoscaler") {
    return (spec.minReplicas ?? spec.maxReplicas) as number | undefined;
  }

  return undefined;
}

/** Slugify a name for use as artifact ID. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ─── Kubernetes Resolver ────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "kubernetes:manifests";

/**
 * Kubernetes Resolver — resolves infra anchors against K8s manifests,
 * collects observed deployment state, and discovers delivery-layer artifacts.
 */
export class KubernetesResolver implements EaResolver {
  readonly name = "kubernetes";
  readonly domains: EaResolver["domains"] = ["delivery", "systems"];
  readonly schemas = ["deployment", "application", "environment", "network-zone", "identity-boundary"];

  /**
   * Resolve infrastructure anchors against K8s manifests.
   *
   * Anchors in the `infra` category matching `kubernetes:*` pattern are checked.
   * Format: `kubernetes:kind/name` or `kubernetes:kind/namespace/name`
   */
  resolveAnchors(
    entity: BackstageEntity,
    ctx: EaResolverContext,
  ): EaAnchorResolution[] | null {
    const infraAnchors = getEntityAnchors(entity)?.infra;
    if (!infraAnchors || infraAnchors.length === 0) return null;

    // Only handle kubernetes: prefixed anchors
    const k8sAnchors = infraAnchors.filter((a) => a.startsWith("kubernetes:"));
    if (k8sAnchors.length === 0) return null;

    const manifests = this.loadManifests(ctx);
    if (manifests.length === 0) {
      ctx.logger.warn("No Kubernetes manifests found", { projectRoot: ctx.projectRoot });
      return null;
    }

    const resourceIndex = new Map<string, K8sManifest[]>();
    for (const m of manifests) {
      const id = k8sResourceId(m);
      const existing = resourceIndex.get(id) ?? [];
      existing.push(m);
      resourceIndex.set(id, existing);
    }

    const resolutions: EaAnchorResolution[] = [];
    const now = new Date().toISOString();

    for (const anchor of k8sAnchors) {
      const resourceRef = anchor.slice("kubernetes:".length);
      const matches = resourceIndex.get(resourceRef);

      if (matches && matches.length > 0) {
        resolutions.push({
          anchorKind: "infra",
          anchorValue: anchor,
          status: "found",
          confidence: "high",
          resolvedAt: now,
          foundIn: matches.map((m) => m._sourceFile),
          metadata: {
            resourceId: resourceRef,
            images: matches.flatMap((m) => extractImages(m)),
            replicas: matches.map((m) => extractReplicas(m)).find((r) => r !== undefined),
          },
        });
      } else {
        resolutions.push({
          anchorKind: "infra",
          anchorValue: anchor,
          status: "missing",
          confidence: "high",
          resolvedAt: now,
          message: `Kubernetes resource ${resourceRef} not found in any manifest`,
        });
      }
    }

    return resolutions;
  }

  /**
   * Collect observed state from all K8s manifests.
   */
  collectObservedState(ctx: EaResolverContext): ObservedEaState | null {
    const manifests = this.loadManifests(ctx);
    if (manifests.length === 0) return null;

    const entities: ObservedEntity[] = [];

    for (const m of manifests) {
      const mapping = K8S_KIND_MAP[m.kind ?? ""];
      if (!mapping) continue;
      const descriptor = getSchemaDescriptor(mapping.schema);
      if (!descriptor) continue;

      entities.push({
        externalId: k8sResourceId(m),
        inferredSchema: descriptor.schema,
        inferredDomain: descriptor.domain as ObservedEntity["inferredDomain"],
        metadata: {
          k8sKind: m.kind,
          name: m.metadata?.name,
          namespace: m.metadata?.namespace,
          labels: m.metadata?.labels,
          sourceFile: m._sourceFile,
          images: extractImages(m),
          replicas: extractReplicas(m),
        },
      });
    }

    return {
      source: "kubernetes",
      collectedAt: new Date().toISOString(),
      entities,
      relationships: [],
    };
  }

  /**
   * Discover EA entities from K8s manifests.
   *
   * Maps K8s resources to EA schema profiles:
   * - Deployment/StatefulSet/DaemonSet → deployment entity
   * - Service → application entity
   * - Namespace → environment entity
   * - NetworkPolicy → network-zone entity
   * - ServiceAccount → identity-boundary entity
   */
  discoverArtifacts(ctx: EaResolverContext): EaArtifactDraft[] | null {
    const manifests = this.loadManifests(ctx);
    if (manifests.length === 0) return null;

    const drafts: EaArtifactDraft[] = [];
    const now = new Date().toISOString();
    const seen = new Set<string>();

    for (const m of manifests) {
      const mapping = K8S_KIND_MAP[m.kind ?? ""];
      if (!mapping) continue;
      const descriptor = getSchemaDescriptor(mapping.schema);
      if (!descriptor) continue;

      const name = m.metadata?.name ?? "unnamed";
      const ns = m.metadata?.namespace;
      const dedupeKey = `${descriptor.schema}:${ns ?? "default"}:${name}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const slug = slugify(ns ? `${ns}-${name}` : name);
      const title = ns ? `${name} (${ns})` : name;
      const images = extractImages(m);
      const replicas = extractReplicas(m);

      const draft: EaArtifactDraft = {
        suggestedId: `${descriptor.kind.toLowerCase()}:${slug}`,
        apiVersion: descriptor.apiVersion,
        kind: descriptor.kind,
        type: descriptor.specType,
        schema: descriptor.schema,
        title,
        summary: `${m.kind} ${name} discovered from ${m._sourceFile}`,
        status: "draft",
        confidence: "observed",
        anchors: { infra: [`kubernetes:${k8sResourceId(m)}`] },
        discoveredBy: "kubernetes",
        discoveredAt: now,
        schemaFields: {
          k8sKind: m.kind,
          namespace: ns,
          ...(images.length > 0 ? { images } : {}),
          ...(replicas !== undefined ? { replicas } : {}),
          sourceFile: m._sourceFile,
        },
      };

      drafts.push(draft);
    }

    return drafts.length > 0 ? drafts : null;
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /** Load all K8s manifests, using cache when available. */
  private loadManifests(ctx: EaResolverContext): K8sManifest[] {
    const cacheKey = `${CACHE_KEY_PREFIX}:${ctx.source ?? "default"}`;
    const cached = ctx.cache.get<K8sManifest[]>(cacheKey);
    if (cached) {
      ctx.logger.debug("Using cached K8s manifests", { count: cached.length });
      return cached;
    }

    const scanDir = ctx.source ? join(ctx.projectRoot, ctx.source) : ctx.projectRoot;
    ctx.logger.debug("Scanning for K8s manifests", { dir: scanDir });

    const files = findK8sFiles(scanDir);
    const manifests: K8sManifest[] = [];

    for (const file of files) {
      const docs = loadK8sManifests(file, ctx.projectRoot);
      manifests.push(...docs);
    }

    if (manifests.length > 0) {
      ctx.cache.set(cacheKey, manifests);
    }

    ctx.logger.info(`Found ${manifests.length} K8s manifest(s)`, {
      files: [...new Set(manifests.map((m) => m._sourceFile))],
    });

    return manifests;
  }
}
