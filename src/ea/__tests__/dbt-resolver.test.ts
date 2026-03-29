import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import type { EaArtifactBase } from "../types.js";
import type { EaResolverContext } from "../resolvers/types.js";
import { silentLogger } from "../resolvers/types.js";
import {
  DbtResolver,
  loadDbtManifest,
  extractModels,
  extractTests,
  extractSources,
  extractExposures,
} from "../resolvers/dbt.js";
import { NoOpCache } from "../cache.js";

const FIXTURES_DIR = join(__dirname, "fixtures", "dbt");
const MANIFEST_FILE = join(FIXTURES_DIR, "target", "manifest.json");

function makeCtx(overrides?: Partial<EaResolverContext>): EaResolverContext {
  return {
    projectRoot: FIXTURES_DIR,
    artifacts: [],
    cache: new NoOpCache(),
    logger: silentLogger,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<EaArtifactBase> = {}): EaArtifactBase {
  return {
    id: "data/DPROD-dim-users",
    kind: "data-product",
    title: "dim_users",
    status: "active",
    owners: ["team-data"],
    anchors: {},
    ...overrides,
  } as EaArtifactBase;
}

// ─── loadDbtManifest ────────────────────────────────────────────────────────────

describe("loadDbtManifest", () => {
  it("should load a dbt manifest", () => {
    const manifest = loadDbtManifest(MANIFEST_FILE, FIXTURES_DIR);
    expect(manifest).not.toBeNull();
    expect(manifest!.metadata?.project_name).toBe("analytics");
    expect(manifest!._sourceFile).toBe("target/manifest.json");
  });

  it("should return null for non-existent file", () => {
    expect(loadDbtManifest("/does/not/exist.json", FIXTURES_DIR)).toBeNull();
  });
});

// ─── Extract functions ──────────────────────────────────────────────────────────

describe("extractModels", () => {
  it("should extract models from manifest", () => {
    const manifest = loadDbtManifest(MANIFEST_FILE, FIXTURES_DIR)!;
    const models = extractModels(manifest);
    expect(models.length).toBe(3);
    expect(models.map((m) => m.name)).toContain("dim_users");
    expect(models.map((m) => m.name)).toContain("fct_orders");
    expect(models.map((m) => m.name)).toContain("mart_revenue");
  });
});

describe("extractTests", () => {
  it("should extract tests from manifest", () => {
    const manifest = loadDbtManifest(MANIFEST_FILE, FIXTURES_DIR)!;
    const tests = extractTests(manifest);
    expect(tests.length).toBe(2);
    expect(tests.map((t) => t.name)).toContain("not_null_dim_users_user_id");
    expect(tests.map((t) => t.name)).toContain("unique_dim_users_email");
  });
});

describe("extractSources", () => {
  it("should extract sources from manifest", () => {
    const manifest = loadDbtManifest(MANIFEST_FILE, FIXTURES_DIR)!;
    const sources = extractSources(manifest);
    expect(sources.length).toBe(2);
    expect(sources.map((s) => s.name)).toContain("users");
    expect(sources.map((s) => s.name)).toContain("orders");
  });
});

describe("extractExposures", () => {
  it("should extract exposures from manifest", () => {
    const manifest = loadDbtManifest(MANIFEST_FILE, FIXTURES_DIR)!;
    const exposures = extractExposures(manifest);
    expect(exposures.length).toBe(1);
    expect(exposures[0]!.name).toBe("revenue_dashboard");
    expect(exposures[0]!.type).toBe("dashboard");
  });
});

// ─── DbtResolver.resolveAnchors ─────────────────────────────────────────────────

describe("DbtResolver.resolveAnchors", () => {
  let resolver: DbtResolver;

  beforeEach(() => {
    resolver = new DbtResolver();
  });

  it("should return null when no dbt anchors", () => {
    const artifact = makeArtifact({ anchors: {} });
    expect(resolver.resolveAnchors(artifact, makeCtx())).toBeNull();
  });

  it("should return null when other.dbt is empty", () => {
    const artifact = makeArtifact({ anchors: { other: { dbt: [] } } });
    expect(resolver.resolveAnchors(artifact, makeCtx())).toBeNull();
  });

  it("should resolve found model names", () => {
    const artifact = makeArtifact({
      anchors: { other: { dbt: ["dim_users"] } },
    });
    const result = resolver.resolveAnchors(artifact, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("found");
  });

  it("should resolve found unique_ids", () => {
    const artifact = makeArtifact({
      anchors: { other: { dbt: ["model.analytics.dim_users"] } },
    });
    const result = resolver.resolveAnchors(artifact, makeCtx())!;
    expect(result[0]!.status).toBe("found");
  });

  it("should resolve found source names", () => {
    const artifact = makeArtifact({
      anchors: { other: { dbt: ["raw.users"] } },
    });
    const result = resolver.resolveAnchors(artifact, makeCtx())!;
    expect(result[0]!.status).toBe("found");
  });

  it("should resolve missing anchors", () => {
    const artifact = makeArtifact({
      anchors: { other: { dbt: ["nonexistent_model"] } },
    });
    const result = resolver.resolveAnchors(artifact, makeCtx())!;
    expect(result[0]!.status).toBe("missing");
  });

  it("should resolve mixed found and missing", () => {
    const artifact = makeArtifact({
      anchors: { other: { dbt: ["dim_users", "nonexistent"] } },
    });
    const result = resolver.resolveAnchors(artifact, makeCtx())!;
    expect(result.length).toBe(2);
    expect(result[0]!.status).toBe("found");
    expect(result[1]!.status).toBe("missing");
  });
});

// ─── DbtResolver.collectObservedState ───────────────────────────────────────────

describe("DbtResolver.collectObservedState", () => {
  let resolver: DbtResolver;

  beforeEach(() => {
    resolver = new DbtResolver();
  });

  it("should collect state from all manifest sections", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    expect(state).not.toBeNull();
    expect(state.source).toBe("dbt");
    // 3 models + 2 tests + 2 sources + 1 exposure = 8
    expect(state.entities.length).toBe(8);
  });

  it("should include data-product entities for models", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const products = state.entities.filter((e) => e.inferredKind === "data-product");
    // 3 models + 1 exposure = 4
    expect(products.length).toBe(4);
  });

  it("should include data-quality-rule entities for tests", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const rules = state.entities.filter((e) => e.inferredKind === "data-quality-rule");
    expect(rules.length).toBe(2);
  });

  it("should include data-store entities for sources", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const stores = state.entities.filter((e) => e.inferredKind === "data-store");
    expect(stores.length).toBe(2);
  });

  it("should include lineage relationships", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    expect(state.relationships.length).toBeGreaterThan(0);
    const feeds = state.relationships.filter((r) => r.type === "feeds");
    // dim_users←raw.users, fct_orders←dim_users+raw.orders, mart_revenue←fct_orders = 4
    expect(feeds.length).toBe(4);
  });

  it("should return null when no manifest found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.collectObservedState(ctx)).toBeNull();
  });
});

// ─── DbtResolver.discoverArtifacts ──────────────────────────────────────────────

describe("DbtResolver.discoverArtifacts", () => {
  let resolver: DbtResolver;

  beforeEach(() => {
    resolver = new DbtResolver();
  });

  it("should discover artifacts from manifest", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    expect(drafts).not.toBeNull();
    expect(drafts.length).toBeGreaterThan(0);
  });

  it("should create data-product drafts for models", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const products = drafts.filter((d) => d.kind === "data-product");
    expect(products.length).toBe(3);
    expect(products.map((p) => p.title)).toContain("dim_users");
    expect(products.map((p) => p.title)).toContain("fct_orders");
  });

  it("should create data-quality-rule drafts for tests", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const rules = drafts.filter((d) => d.kind === "data-quality-rule");
    expect(rules.length).toBe(2);
  });

  it("should create data-store drafts for sources", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const stores = drafts.filter((d) => d.kind === "data-store");
    expect(stores.length).toBe(2);
    expect(stores.map((s) => s.title)).toContain("raw.users");
  });

  it("should create lineage drafts for models with dependencies", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const lineage = drafts.filter((d) => d.kind === "lineage");
    expect(lineage.length).toBe(3); // all 3 models have depends_on
  });

  it("should set correct draft structure", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.status).toBe("draft");
      expect(draft.confidence).toBe("observed");
      expect(draft.discoveredBy).toBe("dbt");
    }
  });

  it("should return null when no manifest found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.discoverArtifacts(ctx)).toBeNull();
  });
});

// ─── Resolver Metadata ──────────────────────────────────────────────────────────

describe("DbtResolver metadata", () => {
  it("should have correct name", () => {
    expect(new DbtResolver().name).toBe("dbt");
  });

  it("should target data domain", () => {
    expect(new DbtResolver().domains).toEqual(["data"]);
  });

  it("should handle data-layer kinds", () => {
    const kinds = new DbtResolver().kinds!;
    expect(kinds).toContain("data-product");
    expect(kinds).toContain("lineage");
    expect(kinds).toContain("data-quality-rule");
    expect(kinds).toContain("data-store");
  });
});
