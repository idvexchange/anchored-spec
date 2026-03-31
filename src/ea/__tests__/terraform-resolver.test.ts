import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { BackstageEntity } from "../backstage/types.js";import type { EaResolverContext } from "../resolvers/types.js";
import { silentLogger } from "../resolvers/types.js";
import {
  TerraformResolver,
  findTerraformStateFiles,
  loadTerraformState,
  flattenResources,
} from "../resolvers/terraform.js";
import { NoOpCache, DiskResolverCache } from "../cache.js";

const FIXTURES_DIR = join(__dirname, "fixtures");
const TF_DIR = join(FIXTURES_DIR, "terraform");
const STATE_FILE = join(TF_DIR, "state.json");
const TEST_CACHE_ROOT = join(tmpdir(), `ea-tf-test-${Date.now()}`);

function makeCtx(overrides?: Partial<EaResolverContext>): EaResolverContext {
  return {
    projectRoot: FIXTURES_DIR,
    artifacts: [],
    cache: new NoOpCache(),
    logger: silentLogger,
    source: "terraform",
    ...overrides,
  };
}

function makeEntity(specOverrides: Record<string, unknown> = {}): BackstageEntity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name: "cloud-rds",
      annotations: { "anchored-spec.dev/confidence": "declared" },
    },
    spec: {
      type: "cloud-resource",
      owner: "team-commerce",
      lifecycle: "production",
      ...specOverrides,
    },
  };
}

// ─── findTerraformStateFiles ────────────────────────────────────────────────────

describe("findTerraformStateFiles", () => {
  it("should find Terraform state JSON files", () => {
    const files = findTerraformStateFiles(FIXTURES_DIR);
    expect(files.length).toBe(1);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).toContain("state.json");
  });

  it("should return empty for non-existent directory", () => {
    expect(findTerraformStateFiles("/does/not/exist")).toEqual([]);
  });
});

// ─── loadTerraformState ─────────────────────────────────────────────────────────

describe("loadTerraformState", () => {
  it("should load a Terraform state file", () => {
    const state = loadTerraformState(STATE_FILE, FIXTURES_DIR);
    expect(state).not.toBeNull();
    expect(state!.format_version).toBe("1.0");
    expect(state!.terraform_version).toBe("1.7.0");
    expect(state!._sourceFile).toBe("terraform/state.json");
  });

  it("should return null for non-existent file", () => {
    expect(loadTerraformState("/does/not/exist.json", FIXTURES_DIR)).toBeNull();
  });
});

// ─── flattenResources ───────────────────────────────────────────────────────────

describe("flattenResources", () => {
  it("should flatten resources including child modules", () => {
    const state = loadTerraformState(STATE_FILE, FIXTURES_DIR)!;
    const resources = flattenResources(state);
    // 6 root + 1 child module = 7
    expect(resources.length).toBe(7);
  });

  it("should include resource addresses", () => {
    const state = loadTerraformState(STATE_FILE, FIXTURES_DIR)!;
    const resources = flattenResources(state);
    const addresses = resources.map((r) => r.address);
    expect(addresses).toContain("aws_rds_instance.main");
    expect(addresses).toContain("aws_s3_bucket.assets");
    expect(addresses).toContain("aws_ecs_cluster.main");
    expect(addresses).toContain("module.cache.aws_elasticache_cluster.redis");
  });

  it("should include resource values", () => {
    const state = loadTerraformState(STATE_FILE, FIXTURES_DIR)!;
    const resources = flattenResources(state);
    const rds = resources.find((r) => r.address === "aws_rds_instance.main");
    expect(rds?.values?.engine).toBe("postgres");
    expect(rds?.values?.engine_version).toBe("15.4");
  });
});

// ─── TerraformResolver.resolveAnchors ───────────────────────────────────────────

describe("TerraformResolver.resolveAnchors", () => {
  let resolver: TerraformResolver;

  beforeEach(() => {
    resolver = new TerraformResolver();
  });

  it("should return null when artifact has no infra anchors", () => {
    const entity = makeEntity({ anchors: {} });
    expect(resolver.resolveAnchors(entity, makeCtx())).toBeNull();
  });

  it("should return null when no terraform: prefixed anchors", () => {
    const entity = makeEntity({ anchors: { infra: ["kubernetes:Deployment/prod/app"] } });
    expect(resolver.resolveAnchors(entity, makeCtx())).toBeNull();
  });

  it("should resolve found anchors", () => {
    const entity = makeEntity({
      anchors: { infra: ["terraform:aws_rds_instance.main"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result).not.toBeNull();
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("found");
    expect(result[0]!.confidence).toBe("high");
    expect(result[0]!.metadata?.engine).toBe("postgres");
  });

  it("should resolve missing anchors", () => {
    const entity = makeEntity({
      anchors: { infra: ["terraform:aws_rds_instance.nonexistent"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("missing");
    expect(result[0]!.message).toContain("not found");
  });

  it("should resolve mixed found and missing", () => {
    const entity = makeEntity({
      anchors: {
        infra: [
          "terraform:aws_rds_instance.main",
          "terraform:aws_rds_instance.nonexistent",
        ],
      },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(2);
    expect(result[0]!.status).toBe("found");
    expect(result[1]!.status).toBe("missing");
  });

  it("should resolve child module resources", () => {
    const entity = makeEntity({
      anchors: { infra: ["terraform:module.cache.aws_elasticache_cluster.redis"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("found");
  });
});

// ─── TerraformResolver.collectObservedState ─────────────────────────────────────

describe("TerraformResolver.collectObservedState", () => {
  let resolver: TerraformResolver;

  beforeEach(() => {
    resolver = new TerraformResolver();
  });

  it("should collect observed state from Terraform state", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    expect(state).not.toBeNull();
    expect(state.source).toBe("terraform");
    expect(state.entities.length).toBeGreaterThan(0);
  });

  it("should map RDS to cloud-resource and data-store", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const rdsCloud = state.entities.find(
      (e) => e.externalId === "aws_rds_instance.main" && e.inferredKind === "cloud-resource",
    );
    const rdsStore = state.entities.find(
      (e) => e.externalId === "aws_rds_instance.main:data-store" && e.inferredKind === "data-store",
    );
    expect(rdsCloud).toBeDefined();
    expect(rdsCloud!.inferredDomain).toBe("delivery");
    expect(rdsStore).toBeDefined();
    expect(rdsStore!.inferredDomain).toBe("data");
  });

  it("should map ECS to platform", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const ecs = state.entities.find((e) => e.externalId === "aws_ecs_cluster.main");
    expect(ecs?.inferredKind).toBe("platform");
  });

  it("should map security group to network-zone", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const sg = state.entities.find((e) => e.externalId === "aws_security_group.web");
    expect(sg?.inferredKind).toBe("network-zone");
  });

  it("should map IAM role to identity-boundary", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const iam = state.entities.find((e) => e.externalId === "aws_iam_role.app");
    expect(iam?.inferredKind).toBe("identity-boundary");
  });

  it("should include metadata", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const rds = state.entities.find((e) => e.externalId === "aws_rds_instance.main");
    expect(rds?.metadata?.engine).toBe("postgres");
    expect(rds?.metadata?.arn).toBeDefined();
  });

  it("should return null when no state found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.collectObservedState(ctx)).toBeNull();
  });
});

// ─── TerraformResolver.discoverArtifacts ────────────────────────────────────────

describe("TerraformResolver.discoverArtifacts", () => {
  let resolver: TerraformResolver;

  beforeEach(() => {
    resolver = new TerraformResolver();
  });

  it("should discover artifacts from Terraform state", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    expect(drafts).not.toBeNull();
    expect(drafts.length).toBeGreaterThan(0);
  });

  it("should create drafts with correct status and confidence", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.status).toBe("draft");
      expect(draft.confidence).toBe("observed");
      expect(draft.discoveredBy).toBe("terraform");
    }
  });

  it("should create cloud-resource draft for RDS", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const rds = drafts.find((d) => d.kind === "cloud-resource" && d.title.includes("aws_rds_instance"));
    expect(rds).toBeDefined();
    expect(rds!.suggestedId).toContain("delivery/CLOUD-");
    expect(rds!.anchors?.infra).toContain("terraform:aws_rds_instance.main");
  });

  it("should create data-store draft for RDS (secondary)", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const store = drafts.find(
      (d) => d.kind === "data-store" && d.kindSpecificFields?.derivedFrom === "aws_rds_instance.main",
    );
    expect(store).toBeDefined();
    expect(store!.suggestedId).toContain("data/STORE-");
  });

  it("should create platform draft for ECS", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const ecs = drafts.find((d) => d.kind === "platform" && d.title.includes("aws_ecs_cluster"));
    expect(ecs).toBeDefined();
    expect(ecs!.suggestedId).toContain("delivery/PLAT-");
  });

  it("should create network-zone draft for security group", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const sg = drafts.find((d) => d.kind === "network-zone");
    expect(sg).toBeDefined();
  });

  it("should create identity-boundary draft for IAM role", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const iam = drafts.find((d) => d.kind === "identity-boundary");
    expect(iam).toBeDefined();
  });

  it("should include Terraform anchors", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.anchors?.infra?.some((a) => a.startsWith("terraform:"))).toBe(true);
    }
  });

  it("should discover child module resources", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const redis = drafts.find((d) =>
      d.anchors?.infra?.includes("terraform:module.cache.aws_elasticache_cluster.redis"),
    );
    expect(redis).toBeDefined();
  });

  it("should return null when no state found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.discoverArtifacts(ctx)).toBeNull();
  });
});

// ─── Cache Integration ──────────────────────────────────────────────────────────

describe("TerraformResolver cache integration", () => {
  let resolver: TerraformResolver;
  let cache: DiskResolverCache;

  beforeEach(() => {
    resolver = new TerraformResolver();
    cache = new DiskResolverCache(TEST_CACHE_ROOT);
  });

  afterEach(() => {
    if (existsSync(TEST_CACHE_ROOT)) {
      rmSync(TEST_CACHE_ROOT, { recursive: true, force: true });
    }
  });

  it("should cache resources after first load", () => {
    const ctx = makeCtx({ cache });
    resolver.collectObservedState(ctx);
    expect(cache.stats().entries).toBeGreaterThan(0);
  });

  it("should use cached resources on second call", () => {
    const ctx = makeCtx({ cache });
    const s1 = resolver.collectObservedState(ctx)!;
    const s2 = resolver.collectObservedState(ctx)!;
    expect(s1.entities.length).toBe(s2.entities.length);
  });
});

// ─── Resolver Metadata ──────────────────────────────────────────────────────────

describe("TerraformResolver metadata", () => {
  it("should have correct name", () => {
    expect(new TerraformResolver().name).toBe("terraform");
  });

  it("should target delivery and data domains", () => {
    const domains = new TerraformResolver().domains!;
    expect(domains).toContain("delivery");
    expect(domains).toContain("data");
  });

  it("should handle infrastructure-related kinds", () => {
    const kinds = new TerraformResolver().kinds!;
    expect(kinds).toContain("cloud-resource");
    expect(kinds).toContain("data-store");
    expect(kinds).toContain("platform");
    expect(kinds).toContain("network-zone");
    expect(kinds).toContain("identity-boundary");
  });
});
