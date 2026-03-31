import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { BackstageEntity } from "../backstage/types.js";import type { EaResolverContext } from "../resolvers/types.js";
import { silentLogger } from "../resolvers/types.js";
import {
  KubernetesResolver,
  findK8sFiles,
  loadK8sManifests,
  k8sResourceId,
  extractImages,
  extractReplicas,
} from "../resolvers/kubernetes.js";
import { NoOpCache, DiskResolverCache } from "../cache.js";

const FIXTURES_DIR = join(__dirname, "fixtures");
const K8S_DIR = join(FIXTURES_DIR, "k8s");
const TEST_CACHE_ROOT = join(tmpdir(), `ea-k8s-test-${Date.now()}`);

function makeCtx(overrides?: Partial<EaResolverContext>): EaResolverContext {
  return {
    projectRoot: FIXTURES_DIR,
    artifacts: [],
    cache: new NoOpCache(),
    logger: silentLogger,
    ...overrides,
  };
}

function makeEntity(specOverrides: Record<string, unknown> = {}): BackstageEntity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name: "deploy-order-service",
      annotations: { "anchored-spec.dev/confidence": "declared" },
    },
    spec: {
      type: "deployment",
      owner: "team-commerce",
      lifecycle: "production",
      ...specOverrides,
    },
  };
}

// ─── findK8sFiles ───────────────────────────────────────────────────────────────

describe("findK8sFiles", () => {
  it("should find K8s manifest files", () => {
    const files = findK8sFiles(FIXTURES_DIR);
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("should find files in k8s subdirectory", () => {
    const files = findK8sFiles(FIXTURES_DIR);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).toContain("order-service.yaml");
    expect(basenames).toContain("infrastructure.yaml");
    expect(basenames).toContain("stateful.yaml");
  });

  it("should return empty for non-existent directory", () => {
    expect(findK8sFiles("/does/not/exist")).toEqual([]);
  });
});

// ─── loadK8sManifests ───────────────────────────────────────────────────────────

describe("loadK8sManifests", () => {
  it("should load multi-document YAML", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    expect(manifests.length).toBe(3); // Deployment + Service + HPA
  });

  it("should parse Deployment", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    const deployment = manifests.find((m) => m.kind === "Deployment");
    expect(deployment).toBeDefined();
    expect(deployment!.metadata?.name).toBe("order-service");
    expect(deployment!.metadata?.namespace).toBe("production");
  });

  it("should parse Service", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    const svc = manifests.find((m) => m.kind === "Service");
    expect(svc).toBeDefined();
    expect(svc!.metadata?.name).toBe("order-service");
  });

  it("should parse Namespace", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "infrastructure.yaml"), FIXTURES_DIR);
    const ns = manifests.filter((m) => m.kind === "Namespace");
    expect(ns.length).toBe(2);
  });

  it("should parse NetworkPolicy and ServiceAccount", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "infrastructure.yaml"), FIXTURES_DIR);
    expect(manifests.find((m) => m.kind === "NetworkPolicy")).toBeDefined();
    expect(manifests.find((m) => m.kind === "ServiceAccount")).toBeDefined();
  });

  it("should parse StatefulSet and DaemonSet", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "stateful.yaml"), FIXTURES_DIR);
    expect(manifests.find((m) => m.kind === "StatefulSet")).toBeDefined();
    expect(manifests.find((m) => m.kind === "DaemonSet")).toBeDefined();
  });

  it("should set _sourceFile relative to project root", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    for (const m of manifests) {
      expect(m._sourceFile).toBe("k8s/order-service.yaml");
    }
  });

  it("should return empty for non-existent file", () => {
    expect(loadK8sManifests("/does/not/exist.yaml", FIXTURES_DIR)).toEqual([]);
  });
});

// ─── k8sResourceId ──────────────────────────────────────────────────────────────

describe("k8sResourceId", () => {
  it("should build id with namespace", () => {
    const id = k8sResourceId({
      kind: "Deployment",
      metadata: { name: "order-service", namespace: "production" },
      _sourceFile: "test.yaml",
    });
    expect(id).toBe("Deployment/production/order-service");
  });

  it("should build id without namespace", () => {
    const id = k8sResourceId({
      kind: "Namespace",
      metadata: { name: "production" },
      _sourceFile: "test.yaml",
    });
    expect(id).toBe("Namespace/production");
  });
});

// ─── extractImages ──────────────────────────────────────────────────────────────

describe("extractImages", () => {
  it("should extract container images from Deployment", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    const deployment = manifests.find((m) => m.kind === "Deployment")!;
    const images = extractImages(deployment);
    expect(images).toContain("registry.example.com/order-service:v2.1.0");
    expect(images).toContain("envoyproxy/envoy:v1.28");
  });

  it("should extract images from StatefulSet", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "stateful.yaml"), FIXTURES_DIR);
    const ss = manifests.find((m) => m.kind === "StatefulSet")!;
    const images = extractImages(ss);
    expect(images).toContain("redis:7.2-alpine");
  });

  it("should return empty for non-pod manifests", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "infrastructure.yaml"), FIXTURES_DIR);
    const ns = manifests.find((m) => m.kind === "Namespace")!;
    expect(extractImages(ns)).toEqual([]);
  });
});

// ─── extractReplicas ────────────────────────────────────────────────────────────

describe("extractReplicas", () => {
  it("should extract replicas from Deployment", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    const deployment = manifests.find((m) => m.kind === "Deployment")!;
    expect(extractReplicas(deployment)).toBe(3);
  });

  it("should extract replicas from StatefulSet", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "stateful.yaml"), FIXTURES_DIR);
    const ss = manifests.find((m) => m.kind === "StatefulSet")!;
    expect(extractReplicas(ss)).toBe(3);
  });

  it("should extract minReplicas from HPA", () => {
    const manifests = loadK8sManifests(join(K8S_DIR, "order-service.yaml"), FIXTURES_DIR);
    const hpa = manifests.find((m) => m.kind === "HorizontalPodAutoscaler")!;
    expect(extractReplicas(hpa)).toBe(2);
  });
});

// ─── KubernetesResolver.resolveAnchors ──────────────────────────────────────────

describe("KubernetesResolver.resolveAnchors", () => {
  let resolver: KubernetesResolver;

  beforeEach(() => {
    resolver = new KubernetesResolver();
  });

  it("should return null when artifact has no infra anchors", () => {
    const entity = makeEntity({ anchors: {} });
    expect(resolver.resolveAnchors(entity, makeCtx())).toBeNull();
  });

  it("should return null when no kubernetes: prefixed anchors", () => {
    const entity = makeEntity({ anchors: { infra: ["terraform:aws_rds.main"] } });
    expect(resolver.resolveAnchors(entity, makeCtx())).toBeNull();
  });

  it("should resolve found anchors", () => {
    const entity = makeEntity({
      anchors: { infra: ["kubernetes:Deployment/production/order-service"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result).not.toBeNull();
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("found");
    expect(result[0]!.confidence).toBe("high");
    expect(result[0]!.foundIn).toBeDefined();
  });

  it("should resolve missing anchors", () => {
    const entity = makeEntity({
      anchors: { infra: ["kubernetes:Deployment/production/nonexistent"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("missing");
    expect(result[0]!.message).toContain("not found");
  });

  it("should include metadata for found resources", () => {
    const entity = makeEntity({
      anchors: { infra: ["kubernetes:Deployment/production/order-service"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result[0]!.metadata?.images).toBeDefined();
    expect(result[0]!.metadata?.replicas).toBe(3);
  });

  it("should resolve mixed found and missing", () => {
    const entity = makeEntity({
      anchors: {
        infra: [
          "kubernetes:Deployment/production/order-service",
          "kubernetes:Deployment/production/nonexistent",
        ],
      },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(2);
    expect(result[0]!.status).toBe("found");
    expect(result[1]!.status).toBe("missing");
  });
});

// ─── KubernetesResolver.collectObservedState ────────────────────────────────────

describe("KubernetesResolver.collectObservedState", () => {
  let resolver: KubernetesResolver;

  beforeEach(() => {
    resolver = new KubernetesResolver();
  });

  it("should collect observed state from all manifests", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    expect(state).not.toBeNull();
    expect(state.source).toBe("kubernetes");
    // Deployment + Service + HPA + 2 Namespace + NetworkPolicy + ServiceAccount + StatefulSet + DaemonSet = 9
    expect(state.entities.length).toBe(9);
  });

  it("should set correct inferred kinds", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const deployment = state.entities.find((e) => e.externalId.startsWith("Deployment/"));
    expect(deployment?.inferredKind).toBe("deployment");
    expect(deployment?.inferredDomain).toBe("delivery");

    const svc = state.entities.find((e) => e.externalId.startsWith("Service/"));
    expect(svc?.inferredKind).toBe("application");
    expect(svc?.inferredDomain).toBe("systems");
  });

  it("should include metadata", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const deployment = state.entities.find((e) => e.externalId === "Deployment/production/order-service");
    expect(deployment?.metadata?.images).toBeDefined();
    expect(deployment?.metadata?.replicas).toBe(3);
    expect(deployment?.metadata?.namespace).toBe("production");
  });

  it("should return null when no manifests found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.collectObservedState(ctx)).toBeNull();
  });
});

// ─── KubernetesResolver.discoverArtifacts ───────────────────────────────────────

describe("KubernetesResolver.discoverArtifacts", () => {
  let resolver: KubernetesResolver;

  beforeEach(() => {
    resolver = new KubernetesResolver();
  });

  it("should discover artifacts from manifests", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    expect(drafts).not.toBeNull();
    expect(drafts.length).toBeGreaterThan(0);
  });

  it("should create drafts with correct kind and status", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.status).toBe("draft");
      expect(draft.confidence).toBe("observed");
      expect(draft.discoveredBy).toBe("kubernetes");
    }
  });

  it("should create deployment draft from Deployment", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const deploy = drafts.find(
      (d) => d.kind === "deployment" && d.title.includes("order-service"),
    );
    expect(deploy).toBeDefined();
    expect(deploy!.suggestedId).toContain("delivery/DEPLOY-");
    expect(deploy!.kindSpecificFields?.k8sKind).toBe("Deployment");
    expect(deploy!.kindSpecificFields?.images).toBeDefined();
    expect(deploy!.kindSpecificFields?.replicas).toBe(3);
  });

  it("should create environment draft from Namespace", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const env = drafts.find((d) => d.kind === "environment");
    expect(env).toBeDefined();
    expect(env!.suggestedId).toContain("delivery/ENV-");
  });

  it("should create network-zone draft from NetworkPolicy", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const zone = drafts.find((d) => d.kind === "network-zone");
    expect(zone).toBeDefined();
    expect(zone!.suggestedId).toContain("delivery/ZONE-");
  });

  it("should create identity-boundary draft from ServiceAccount", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const idb = drafts.find((d) => d.kind === "identity-boundary");
    expect(idb).toBeDefined();
    expect(idb!.suggestedId).toContain("delivery/IDB-");
  });

  it("should include K8s anchors", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.anchors?.infra?.some((a) => a.startsWith("kubernetes:"))).toBe(true);
    }
  });

  it("should deduplicate manifests", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const ids = drafts.map((d) => d.suggestedId);
    const unique = [...new Set(ids)];
    expect(ids.length).toBe(unique.length);
  });

  it("should return null when no manifests found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.discoverArtifacts(ctx)).toBeNull();
  });
});

// ─── Cache Integration ──────────────────────────────────────────────────────────

describe("KubernetesResolver cache integration", () => {
  let resolver: KubernetesResolver;
  let cache: DiskResolverCache;

  beforeEach(() => {
    resolver = new KubernetesResolver();
    cache = new DiskResolverCache(TEST_CACHE_ROOT);
  });

  afterEach(() => {
    if (existsSync(TEST_CACHE_ROOT)) {
      rmSync(TEST_CACHE_ROOT, { recursive: true, force: true });
    }
  });

  it("should cache manifests after first load", () => {
    const ctx = makeCtx({ cache });
    resolver.collectObservedState(ctx);
    expect(cache.stats().entries).toBeGreaterThan(0);
  });

  it("should use cached manifests on second call", () => {
    const ctx = makeCtx({ cache });
    const s1 = resolver.collectObservedState(ctx)!;
    const s2 = resolver.collectObservedState(ctx)!;
    expect(s1.entities.length).toBe(s2.entities.length);
  });
});

// ─── Resolver Metadata ──────────────────────────────────────────────────────────

describe("KubernetesResolver metadata", () => {
  it("should have correct name", () => {
    expect(new KubernetesResolver().name).toBe("kubernetes");
  });

  it("should target delivery and systems domains", () => {
    expect(new KubernetesResolver().domains).toContain("delivery");
    expect(new KubernetesResolver().domains).toContain("systems");
  });

  it("should handle delivery-related kinds", () => {
    const kinds = new KubernetesResolver().kinds!;
    expect(kinds).toContain("deployment");
    expect(kinds).toContain("environment");
    expect(kinds).toContain("network-zone");
    expect(kinds).toContain("identity-boundary");
  });
});
