import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import type { BackstageEntity } from "../backstage/types.js";import type { EaResolverContext } from "../resolvers/types.js";
import { silentLogger } from "../resolvers/types.js";
import {
  OpenApiResolver,
  findOpenApiFiles,
  loadOpenApiSpec,
  hasEndpoint,
  extractAllEndpoints,
  parseSimpleYaml,
} from "../resolvers/openapi.js";
import { NoOpCache, DiskResolverCache } from "../cache.js";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const FIXTURES_DIR = join(__dirname, "fixtures", "openapi");
const TEST_CACHE_ROOT = join(tmpdir(), `ea-openapi-test-${Date.now()}`);

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
      name: "api-test",
      annotations: { "anchored-spec.dev/confidence": "declared" },
    },
    spec: {
      type: "api-contract",
      owner: "team-a",
      lifecycle: "production",
      ...specOverrides,
    },
  };
}

// ─── parseSimpleYaml ────────────────────────────────────────────────────────────

describe("parseSimpleYaml", () => {
  it("should parse a basic mapping", () => {
    const result = parseSimpleYaml("name: hello\nversion: 1") as Record<string, unknown>;
    expect(result).toEqual({ name: "hello", version: 1 });
  });

  it("should parse nested mappings", () => {
    const yaml = `
info:
  title: My API
  version: 1.0.0
`;
    const result = parseSimpleYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ info: { title: "My API", version: "1.0.0" } });
  });

  it("should parse sequences", () => {
    const yaml = `
tags:
  - users
  - pets
`;
    const result = parseSimpleYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ tags: ["users", "pets"] });
  });

  it("should parse booleans and null", () => {
    const yaml = `
active: true
deleted: false
notes: null
`;
    const result = parseSimpleYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ active: true, deleted: false, notes: null });
  });

  it("should parse quoted strings", () => {
    const yaml = `
name: "hello world"
version: '1.0'
`;
    const result = parseSimpleYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ name: "hello world", version: "1.0" });
  });

  it("should parse inline arrays", () => {
    const yaml = `tags: [a, b, c]`;
    const result = parseSimpleYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ tags: ["a", "b", "c"] });
  });

  it("should skip comments", () => {
    const yaml = `
# This is a comment
name: test
# Another comment
version: 1
`;
    const result = parseSimpleYaml(yaml) as Record<string, unknown>;
    expect(result).toEqual({ name: "test", version: 1 });
  });
});

// ─── findOpenApiFiles ───────────────────────────────────────────────────────────

describe("findOpenApiFiles", () => {
  it("should find OpenAPI JSON files", () => {
    const files = findOpenApiFiles(FIXTURES_DIR);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).toContain("petstore.json");
  });

  it("should find OpenAPI YAML files", () => {
    const files = findOpenApiFiles(FIXTURES_DIR);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).toContain("user-service.yaml");
  });

  it("should find Swagger 2.0 files", () => {
    const files = findOpenApiFiles(FIXTURES_DIR);
    const basenames = files.map((f) => f.split("/").pop());
    expect(basenames).toContain("legacy-billing.yaml");
  });

  it("should find all 3 fixture files", () => {
    const files = findOpenApiFiles(FIXTURES_DIR);
    expect(files.length).toBe(3);
  });

  it("should return empty for non-existent directory", () => {
    expect(findOpenApiFiles("/does/not/exist")).toEqual([]);
  });
});

// ─── loadOpenApiSpec ────────────────────────────────────────────────────────────

describe("loadOpenApiSpec", () => {
  it("should load a JSON OpenAPI spec", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "petstore.json"), FIXTURES_DIR);
    expect(spec).not.toBeNull();
    expect(spec!.openapi).toBe("3.1.0");
    expect(spec!.info?.title).toBe("Pet Store API");
    expect(spec!._sourceFile).toBe("petstore.json");
  });

  it("should load a YAML OpenAPI spec", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "user-service.yaml"), FIXTURES_DIR);
    expect(spec).not.toBeNull();
    expect(spec!.openapi).toBe("3.0.3");
    expect(spec!.info?.title).toBe("User Service");
  });

  it("should load a Swagger 2.0 spec", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "legacy-billing.yaml"), FIXTURES_DIR);
    expect(spec).not.toBeNull();
    expect(spec!.swagger).toBe("2.0");
    expect(spec!.info?.title).toBe("Legacy Billing API");
  });

  it("should return null for non-existent file", () => {
    expect(loadOpenApiSpec("/does/not/exist.json", FIXTURES_DIR)).toBeNull();
  });
});

// ─── hasEndpoint ────────────────────────────────────────────────────────────────

describe("hasEndpoint", () => {
  it("should find existing endpoint", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "petstore.json"), FIXTURES_DIR)!;
    expect(hasEndpoint(spec, "GET", "/pets")).toBe(true);
    expect(hasEndpoint(spec, "POST", "/pets")).toBe(true);
    expect(hasEndpoint(spec, "DELETE", "/pets/{petId}")).toBe(true);
  });

  it("should not find non-existent endpoint", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "petstore.json"), FIXTURES_DIR)!;
    expect(hasEndpoint(spec, "PUT", "/pets")).toBe(false);
    expect(hasEndpoint(spec, "GET", "/orders")).toBe(false);
  });

  it("should be case-insensitive on method", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "petstore.json"), FIXTURES_DIR)!;
    expect(hasEndpoint(spec, "get", "/pets")).toBe(true);
    expect(hasEndpoint(spec, "Get", "/pets")).toBe(true);
  });
});

// ─── extractAllEndpoints ────────────────────────────────────────────────────────

describe("extractAllEndpoints", () => {
  it("should extract all endpoints from petstore", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "petstore.json"), FIXTURES_DIR)!;
    const endpoints = extractAllEndpoints(spec);
    expect(endpoints).toEqual([
      "DELETE /pets/{petId}",
      "GET /pets",
      "GET /pets/{petId}",
      "GET /stores",
      "POST /pets",
    ]);
  });

  it("should extract endpoints from YAML spec", () => {
    const spec = loadOpenApiSpec(join(FIXTURES_DIR, "user-service.yaml"), FIXTURES_DIR)!;
    const endpoints = extractAllEndpoints(spec);
    expect(endpoints).toContain("GET /users");
    expect(endpoints).toContain("POST /users");
    expect(endpoints).toContain("GET /users/{userId}");
    expect(endpoints).toContain("PUT /users/{userId}");
    expect(endpoints).toContain("DELETE /users/{userId}");
    expect(endpoints).toContain("GET /users/{userId}/roles");
    expect(endpoints.length).toBe(6);
  });
});

// ─── OpenApiResolver.resolveAnchors ─────────────────────────────────────────────

describe("OpenApiResolver.resolveAnchors", () => {
  let resolver: OpenApiResolver;

  beforeEach(() => {
    resolver = new OpenApiResolver();
  });

  it("should return null when artifact has no api anchors", () => {
    const entity = makeEntity({ anchors: {} });
    const result = resolver.resolveAnchors(entity, makeCtx());
    expect(result).toBeNull();
  });

  it("should return null when artifact has empty api anchors", () => {
    const entity = makeEntity({ anchors: { apis: [] } });
    const result = resolver.resolveAnchors(entity, makeCtx());
    expect(result).toBeNull();
  });

  it("should resolve found anchors", () => {
    const entity = makeEntity({
      anchors: { apis: ["GET /pets", "POST /pets"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result).not.toBeNull();
    expect(result.length).toBe(2);
    expect(result[0]!.status).toBe("found");
    expect(result[0]!.anchorValue).toBe("GET /pets");
    expect(result[0]!.confidence).toBe("high");
    expect(result[0]!.foundIn).toBeDefined();
    expect(result[0]!.foundIn!.length).toBeGreaterThan(0);
  });

  it("should resolve missing anchors", () => {
    const entity = makeEntity({
      anchors: { apis: ["GET /nonexistent"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("missing");
    expect(result[0]!.message).toContain("not found");
  });

  it("should resolve mixed found and missing anchors", () => {
    const entity = makeEntity({
      anchors: { apis: ["GET /pets", "GET /nonexistent", "POST /pets"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(3);
    expect(result[0]!.status).toBe("found");
    expect(result[1]!.status).toBe("missing");
    expect(result[2]!.status).toBe("found");
  });

  it("should handle invalid anchor format", () => {
    const entity = makeEntity({
      anchors: { apis: ["invalid-format"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("unknown");
    expect(result[0]!.message).toContain("Invalid anchor format");
  });

  it("should resolve anchors across multiple spec files", () => {
    // GET /users is in user-service.yaml, GET /pets is in petstore.json
    const entity = makeEntity({
      anchors: { apis: ["GET /users", "GET /pets"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(2);
    expect(result[0]!.status).toBe("found");
    expect(result[1]!.status).toBe("found");
  });
});

// ─── OpenApiResolver.collectObservedState ───────────────────────────────────────

describe("OpenApiResolver.collectObservedState", () => {
  let resolver: OpenApiResolver;

  beforeEach(() => {
    resolver = new OpenApiResolver();
  });

  it("should collect observed state from all specs", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    expect(state).not.toBeNull();
    expect(state.source).toBe("openapi");
    expect(state.collectedAt).toBeDefined();
    // petstore: 5 endpoints, user-service: 6, legacy-billing: 4
    expect(state.entities.length).toBe(15);
  });

  it("should set inferredKind to api-contract", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    for (const entity of state.entities) {
      expect(entity.inferredKind).toBe("api-contract");
      expect(entity.inferredDomain).toBe("systems");
    }
  });

  it("should include metadata", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const getPets = state.entities.find((e) => e.externalId === "GET /pets");
    expect(getPets).toBeDefined();
    expect(getPets!.metadata?.operationId).toBe("listPets");
    expect(getPets!.metadata?.specFile).toBe("petstore.json");
  });

  it("should return null when no specs found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    const state = resolver.collectObservedState(ctx);
    expect(state).toBeNull();
  });
});

// ─── OpenApiResolver.discoverArtifacts ──────────────────────────────────────────

describe("OpenApiResolver.discoverArtifacts", () => {
  let resolver: OpenApiResolver;

  beforeEach(() => {
    resolver = new OpenApiResolver();
  });

  it("should discover api-contract drafts from specs", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    expect(drafts).not.toBeNull();
    expect(drafts.length).toBe(3);
  });

  it("should create drafts with correct kind and status", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.kind).toBe("api-contract");
      expect(draft.status).toBe("draft");
      expect(draft.confidence).toBe("observed");
      expect(draft.discoveredBy).toBe("openapi");
    }
  });

  it("should populate kind-specific fields", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const petStore = drafts.find((d) => d.title === "Pet Store API");
    expect(petStore).toBeDefined();
    expect(petStore!.kindSpecificFields?.protocol).toBe("rest");
    expect(petStore!.kindSpecificFields?.specFormat).toBe("openapi");
    expect(petStore!.kindSpecificFields?.specPath).toBe("petstore.json");
    expect(petStore!.kindSpecificFields?.version).toBe("1.0.0");
  });

  it("should include API endpoints as anchors", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const petStore = drafts.find((d) => d.title === "Pet Store API");
    expect(petStore!.anchors?.apis).toContain("GET /pets");
    expect(petStore!.anchors?.apis).toContain("POST /pets");
  });

  it("should generate slugified suggested IDs", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const petStore = drafts.find((d) => d.title === "Pet Store API");
    expect(petStore!.suggestedId).toBe("systems/API-pet-store-api");
  });

  it("should return null when no specs found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.discoverArtifacts(ctx)).toBeNull();
  });

  it("should discover Swagger 2.0 specs", () => {
    const drafts = resolver.discoverArtifacts(makeCtx())!;
    const billing = drafts.find((d) => d.title === "Legacy Billing API");
    expect(billing).toBeDefined();
    expect(billing!.kindSpecificFields?.version).toBe("1.5.0");
  });
});

// ─── Cache Integration ──────────────────────────────────────────────────────────

describe("OpenApiResolver cache integration", () => {
  let resolver: OpenApiResolver;
  let cache: DiskResolverCache;

  beforeEach(() => {
    resolver = new OpenApiResolver();
    cache = new DiskResolverCache(TEST_CACHE_ROOT);
  });

  afterEach(() => {
    if (existsSync(TEST_CACHE_ROOT)) {
      rmSync(TEST_CACHE_ROOT, { recursive: true, force: true });
    }
  });

  it("should cache specs after first load", () => {
    const ctx = makeCtx({ cache });
    resolver.collectObservedState(ctx);
    const stats = cache.stats();
    expect(stats.entries).toBeGreaterThan(0);
  });

  it("should use cached specs on second call", () => {
    const ctx = makeCtx({ cache });
    const state1 = resolver.collectObservedState(ctx)!;
    const state2 = resolver.collectObservedState(ctx)!;
    expect(state1.entities.length).toBe(state2.entities.length);
  });
});

// ─── Resolver Metadata ──────────────────────────────────────────────────────────

describe("OpenApiResolver metadata", () => {
  it("should have correct name", () => {
    expect(new OpenApiResolver().name).toBe("openapi");
  });

  it("should target systems domain", () => {
    expect(new OpenApiResolver().domains).toEqual(["systems"]);
  });

  it("should handle api-contract, application, service kinds", () => {
    expect(new OpenApiResolver().kinds).toContain("api-contract");
    expect(new OpenApiResolver().kinds).toContain("application");
    expect(new OpenApiResolver().kinds).toContain("service");
  });
});
