/**
 * Tests for EA Reverse Resolution.
 *
 * Covers:
 *   - buildReverseIndex: file/symbol index from traceRefs, docs, anchors
 *   - resolveFromFiles: high/medium/low confidence, dedup, sorting
 *   - resolveFromSymbols: anchor match, no heuristic fallback
 *   - resolveFromDiff: raw diff parsing, inputKind tagging
 *   - extractChangedFiles: unified diff parsing
 *   - buildReverseIndexCached: cache hit/miss behavior
 */

import { describe, it, expect, vi } from "vitest";
import type { BackstageEntity } from "../backstage/types.js";
import type { ScannedDoc } from "../docs/scanner.js";
import type { ResolverCache } from "../cache.js";
import { NoOpCache } from "../cache.js";
import {
  buildReverseIndex,
  buildReverseIndexCached,
  resolveFromFiles,
  resolveFromSymbols,
  resolveFromDiff,
  extractChangedFiles,
} from "../reverse-resolution.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeEntity(
  overrides: Partial<BackstageEntity> & { kind: string; name: string },
): BackstageEntity {
  const { name, kind, ...rest } = overrides;
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind,
    metadata: {
      name,
      title: `Test ${kind}`,
      description: "A test entity for reverse-resolution testing.",
      ...(rest.metadata ?? {}),
    },
    spec: {
      type: "service",
      lifecycle: "production",
      owner: "group:default/test-team",
      ...(rest.spec ?? {}),
    },
  };
}

function makeDoc(overrides: Partial<ScannedDoc> & Pick<ScannedDoc, "relativePath" | "entityRefs">): ScannedDoc {
  return {
    path: `/project/${overrides.relativePath}`,
    frontmatter: {},
    ...overrides,
  };
}

// ─── buildReverseIndex ──────────────────────────────────────────────────────────

describe("buildReverseIndex", () => {
  it("builds file index from entity traceRefs", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "order-service",
      spec: {
        traceRefs: [
          { path: "src/orders/handler.ts", role: "implementation" },
          { path: "docs/orders.md", role: "specification" },
        ],
      },
    });

    const index = buildReverseIndex([entity]);

    expect(index.fileToEntities.get("src/orders/handler.ts")).toEqual([
      {
        entityRef: "component:default/order-service",
        confidence: "high",
        evidence: "traceRef[role=implementation]",
        strategy: "source-annotation",
      },
    ]);
    expect(index.fileToEntities.get("docs/orders.md")).toEqual([
      {
        entityRef: "component:default/order-service",
        confidence: "high",
        evidence: "traceRef[role=specification]",
        strategy: "source-annotation",
      },
    ]);
  });

  it("builds file index from doc frontmatter", () => {
    const doc = makeDoc({
      relativePath: "docs/api.md",
      entityRefs: ["api:default/dossier-lifecycle"],
    });

    const index = buildReverseIndex([], [doc]);

    expect(index.fileToEntities.get("docs/api.md")).toEqual([
      {
        entityRef: "api:default/dossier-lifecycle",
        confidence: "high",
        evidence: 'doc frontmatter ea-entities includes "api:default/dossier-lifecycle"',
        strategy: "doc-frontmatter",
      },
    ]);
  });

  it("builds symbol index from entity anchors (symbols, apis, events)", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "auth-service",
      spec: {
        anchors: {
          symbols: ["AuthController", "loginHandler"],
          apis: ["/api/v1/login"],
          events: ["user.login", "user.logout"],
        },
      },
    });

    const index = buildReverseIndex([entity]);

    expect(index.symbolToEntities.get("AuthController")).toEqual([
      {
        entityRef: "component:default/auth-service",
        confidence: "medium",
        evidence: "anchor:symbols",
        strategy: "anchor-match",
      },
    ]);
    expect(index.symbolToEntities.get("/api/v1/login")).toEqual([
      {
        entityRef: "component:default/auth-service",
        confidence: "medium",
        evidence: "anchor:apis",
        strategy: "anchor-match",
      },
    ]);
    expect(index.symbolToEntities.get("user.login")).toEqual([
      {
        entityRef: "component:default/auth-service",
        confidence: "medium",
        evidence: "anchor:events",
        strategy: "anchor-match",
      },
    ]);
  });

  it("adds anchor values that look like file paths to file index", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "billing",
      spec: {
        anchors: {
          schemas: ["schemas/billing.json", "BillingRecord"],
        },
      },
    });

    const index = buildReverseIndex([entity]);

    // "schemas/billing.json" has "/" so it should be in fileToEntities
    expect(index.fileToEntities.get("schemas/billing.json")).toEqual([
      {
        entityRef: "component:default/billing",
        confidence: "medium",
        evidence: "anchor:schemas",
        strategy: "anchor-match",
      },
    ]);

    // "BillingRecord" has no "/" or "." — should NOT be in fileToEntities
    expect(index.fileToEntities.has("BillingRecord")).toBe(false);

    // Both should be in symbolToEntities
    expect(index.symbolToEntities.has("schemas/billing.json")).toBe(true);
    expect(index.symbolToEntities.has("BillingRecord")).toBe(true);
  });

  it("deduplicates entries for same entity+path+strategy", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "svc",
      spec: {
        traceRefs: [
          { path: "src/main.ts", role: "implementation" },
          { path: "src/main.ts", role: "test" },
        ],
      },
    });

    const index = buildReverseIndex([entity]);

    // Two traceRefs for same path+entity+strategy should deduplicate
    const entries = index.fileToEntities.get("src/main.ts");
    expect(entries).toHaveLength(1);
  });

  it("skips URL traceRefs (http/https)", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "external-svc",
      spec: {
        traceRefs: [
          { path: "https://example.com/api-docs", role: "specification" },
          { path: "http://internal/docs", role: "context" },
          { path: "src/client.ts", role: "implementation" },
        ],
      },
    });

    const index = buildReverseIndex([entity]);

    expect(index.fileToEntities.has("https://example.com/api-docs")).toBe(false);
    expect(index.fileToEntities.has("http://internal/docs")).toBe(false);
    expect(index.fileToEntities.has("src/client.ts")).toBe(true);
  });

  it("indexes infra anchors as symbols", () => {
    const entity = makeEntity({
      kind: "Resource",
      name: "db-cluster",
      spec: {
        anchors: {
          infra: ["rds:us-east-1:prod-db", "ec2:us-east-1:bastion"],
        },
      },
    });

    const index = buildReverseIndex([entity]);

    expect(index.symbolToEntities.get("rds:us-east-1:prod-db")).toEqual([
      {
        entityRef: "resource:default/db-cluster",
        confidence: "medium",
        evidence: "anchor:infra",
        strategy: "anchor-match",
      },
    ]);
  });

  it("normalizes leading ./ in file paths", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "svc",
      spec: {
        traceRefs: [{ path: "./src/main.ts", role: "implementation" }],
      },
    });

    const index = buildReverseIndex([entity]);

    expect(index.fileToEntities.has("src/main.ts")).toBe(true);
    expect(index.fileToEntities.has("./src/main.ts")).toBe(false);
  });
});

// ─── resolveFromFiles ───────────────────────────────────────────────────────────

describe("resolveFromFiles", () => {
  const entityWithTrace = makeEntity({
    kind: "Component",
    name: "order-service",
    spec: {
      traceRefs: [
        { path: "src/orders/handler.ts", role: "implementation" },
      ],
    },
  });

  const entityWithAnchors = makeEntity({
    kind: "Component",
    name: "billing",
    spec: {
      anchors: {
        schemas: ["src/billing/schema.graphql"],
      },
    },
  });

  const doc = makeDoc({
    relativePath: "docs/api.md",
    entityRefs: ["api:default/dossier-lifecycle"],
  });

  it("resolves file to entity via traceRef (high confidence)", () => {
    const results = resolveFromFiles(
      ["src/orders/handler.ts"],
      [entityWithTrace],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "file",
      inputValue: "src/orders/handler.ts",
      resolvedEntityRef: "component:default/order-service",
      confidence: "high",
      strategy: "source-annotation",
    });
  });

  it("resolves file to entity via doc frontmatter (high confidence)", () => {
    const results = resolveFromFiles(["docs/api.md"], [], [doc]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "file",
      inputValue: "docs/api.md",
      resolvedEntityRef: "api:default/dossier-lifecycle",
      confidence: "high",
      strategy: "doc-frontmatter",
    });
  });

  it("resolves file to entity via anchor match (medium confidence)", () => {
    const results = resolveFromFiles(
      ["src/billing/schema.graphql"],
      [entityWithAnchors],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "file",
      inputValue: "src/billing/schema.graphql",
      confidence: "medium",
      strategy: "anchor-match",
    });
  });

  it("returns multiple matches for multi-match files", () => {
    const entity2 = makeEntity({
      kind: "API",
      name: "order-api",
      spec: {
        traceRefs: [
          { path: "src/orders/handler.ts", role: "specification" },
        ],
      },
    });

    const results = resolveFromFiles(
      ["src/orders/handler.ts"],
      [entityWithTrace, entity2],
    );

    expect(results.length).toBeGreaterThanOrEqual(2);
    const refs = results.map((r) => r.resolvedEntityRef);
    expect(refs).toContain("component:default/order-service");
    expect(refs).toContain("api:default/order-api");
  });

  it("sorts results by confidence (high first)", () => {
    // entity with anchor (medium) + entity with traceRef (high) for different files
    const entities = [entityWithAnchors, entityWithTrace];
    const results = resolveFromFiles(
      ["src/billing/schema.graphql", "src/orders/handler.ts"],
      entities,
    );

    expect(results.length).toBeGreaterThanOrEqual(2);
    // High confidence results should come first
    const firstHighIdx = results.findIndex((r) => r.confidence === "high");
    const lastMediumIdx = results.findLastIndex((r) => r.confidence === "medium");
    if (firstHighIdx >= 0 && lastMediumIdx >= 0) {
      expect(firstHighIdx).toBeLessThan(lastMediumIdx);
    }
  });

  it("uses heuristic fallback for partial path overlap (low confidence)", () => {
    const entity = makeEntity({
      kind: "Component",
      name: "payments",
      spec: {
        traceRefs: [{ path: "src/payments/", role: "implementation" }],
      },
    });

    const results = resolveFromFiles(
      ["src/payments/stripe.ts"],
      [entity],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "file",
      confidence: "low",
      strategy: "heuristic",
      resolvedEntityRef: "component:default/payments",
    });
  });

  it("returns empty array for unknown files", () => {
    const results = resolveFromFiles(
      ["totally/unknown/file.ts"],
      [entityWithTrace],
    );

    expect(results).toEqual([]);
  });
});

// ─── resolveFromSymbols ─────────────────────────────────────────────────────────

describe("resolveFromSymbols", () => {
  const entity = makeEntity({
    kind: "Component",
    name: "auth-service",
    spec: {
      anchors: {
        symbols: ["AuthController"],
        apis: ["/api/v1/login"],
      },
    },
  });

  it("resolves symbol via anchor match", () => {
    const results = resolveFromSymbols(["AuthController"], [entity]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "symbol",
      inputValue: "AuthController",
      resolvedEntityRef: "component:default/auth-service",
      confidence: "medium",
      strategy: "anchor-match",
      evidence: "anchor:symbols",
    });
  });

  it("resolves API paths via anchor match", () => {
    const results = resolveFromSymbols(["/api/v1/login"], [entity]);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "symbol",
      inputValue: "/api/v1/login",
      resolvedEntityRef: "component:default/auth-service",
    });
  });

  it("returns empty for unknown symbols (no heuristic fallback)", () => {
    const results = resolveFromSymbols(["UnknownClass"], [entity]);

    expect(results).toEqual([]);
  });
});

// ─── resolveFromDiff ────────────────────────────────────────────────────────────

describe("resolveFromDiff", () => {
  const entity = makeEntity({
    kind: "Component",
    name: "order-service",
    spec: {
      traceRefs: [
        { path: "src/orders/handler.ts", role: "implementation" },
      ],
    },
  });

  it("parses raw diff text and resolves changed files", () => {
    const rawDiff = [
      "diff --git a/src/orders/handler.ts b/src/orders/handler.ts",
      "index abc1234..def5678 100644",
      "--- a/src/orders/handler.ts",
      "+++ b/src/orders/handler.ts",
      "@@ -1,3 +1,4 @@",
      " import { foo } from 'bar';",
      "+import { baz } from 'qux';",
    ].join("\n");

    const results = resolveFromDiff(
      { raw: rawDiff },
      [entity],
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      inputKind: "diff",
      inputValue: "src/orders/handler.ts",
      resolvedEntityRef: "component:default/order-service",
      confidence: "high",
    });
  });

  it("returns empty for diff with no matching files", () => {
    const rawDiff = [
      "diff --git a/unrelated/file.ts b/unrelated/file.ts",
      "+++ b/unrelated/file.ts",
    ].join("\n");

    const results = resolveFromDiff({ raw: rawDiff }, [entity]);

    expect(results).toEqual([]);
  });
});

// ─── extractChangedFiles ────────────────────────────────────────────────────────

describe("extractChangedFiles", () => {
  it("parses unified diff format with diff --git headers", () => {
    const rawDiff = [
      "diff --git a/src/main.ts b/src/main.ts",
      "index abc..def 100644",
      "--- a/src/main.ts",
      "+++ b/src/main.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");

    const files = extractChangedFiles({ raw: rawDiff });

    expect(files).toContain("src/main.ts");
  });

  it("parses +++ b/ lines", () => {
    const rawDiff = [
      "+++ b/lib/utils.js",
    ].join("\n");

    const files = extractChangedFiles({ raw: rawDiff });

    expect(files).toContain("lib/utils.js");
  });

  it("handles multiple files in a single diff", () => {
    const rawDiff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "+++ b/src/a.ts",
      "diff --git a/src/b.ts b/src/b.ts",
      "+++ b/src/b.ts",
      "diff --git a/src/c.ts b/src/c.ts",
      "+++ b/src/c.ts",
    ].join("\n");

    const files = extractChangedFiles({ raw: rawDiff });

    expect(files).toHaveLength(3);
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/b.ts");
    expect(files).toContain("src/c.ts");
  });

  it("deduplicates files appearing in both header and +++ line", () => {
    const rawDiff = [
      "diff --git a/src/main.ts b/src/main.ts",
      "--- a/src/main.ts",
      "+++ b/src/main.ts",
    ].join("\n");

    const files = extractChangedFiles({ raw: rawDiff });

    expect(files).toHaveLength(1);
    expect(files[0]).toBe("src/main.ts");
  });

  it("returns empty for empty raw input", () => {
    const files = extractChangedFiles({ raw: "" });
    expect(files).toEqual([]);
  });
});

// ─── buildReverseIndexCached ────────────────────────────────────────────────────

describe("buildReverseIndexCached", () => {
  const entity = makeEntity({
    kind: "Component",
    name: "cached-svc",
    spec: {
      traceRefs: [{ path: "src/cached.ts", role: "implementation" }],
    },
  });

  it("returns cached index on cache hit", () => {
    const mockCache: ResolverCache = {
      get: vi.fn().mockReturnValue({
        fileToEntities: {
          "src/cached.ts": [
            {
              entityRef: "component:cached-svc",
              confidence: "high",
              evidence: "traceRef[role=implementation]",
              strategy: "source-annotation",
            },
          ],
        },
        symbolToEntities: {},
      }),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      stats: vi.fn().mockReturnValue({ entries: 1, sizeBytes: 100, cacheDir: "test" }),
    };

    const index = buildReverseIndexCached([entity], undefined, undefined, mockCache);

    expect(mockCache.get).toHaveBeenCalledWith("reverse-resolution-index");
    expect(mockCache.set).not.toHaveBeenCalled();
    expect(index.fileToEntities.get("src/cached.ts")).toHaveLength(1);
  });

  it("builds and caches on cache miss", () => {
    const mockCache: ResolverCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      stats: vi.fn().mockReturnValue({ entries: 0, sizeBytes: 0, cacheDir: "test" }),
    };

    const index = buildReverseIndexCached([entity], undefined, undefined, mockCache);

    expect(mockCache.get).toHaveBeenCalledWith("reverse-resolution-index");
    expect(mockCache.set).toHaveBeenCalledWith(
      "reverse-resolution-index",
      expect.objectContaining({
        fileToEntities: expect.any(Object),
        symbolToEntities: expect.any(Object),
      }),
    );
    expect(index.fileToEntities.get("src/cached.ts")).toHaveLength(1);
  });

  it("works with NoOpCache (always builds fresh)", () => {
    const cache = new NoOpCache();

    const index = buildReverseIndexCached([entity], undefined, undefined, cache);

    expect(index.fileToEntities.get("src/cached.ts")).toHaveLength(1);
  });
});
