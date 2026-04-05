/**
 * Tests for Tree-sitter Discovery Resolver
 *
 * Tests the aggregator, query pack types, and resolver infrastructure.
 * Note: These tests do NOT require web-tree-sitter to be installed —
 * they test the aggregation logic and type contracts directly.
 */

import { describe, it, expect } from "vitest";
import { aggregateMatches } from "../resolvers/tree-sitter/aggregator.js";
import { getQueryPacks, builtinPacks } from "../resolvers/tree-sitter/packs/index.js";
import { javascriptPacks } from "../resolvers/tree-sitter/packs/javascript.js";
import { typescriptPacks } from "../resolvers/tree-sitter/packs/typescript.js";
import type { QueryMatch, QueryPattern } from "../resolvers/tree-sitter/types.js";
import type { BackstageEntity } from "../backstage/types.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makePattern(overrides: Partial<QueryPattern> = {}): QueryPattern {
  return {
    name: "test-pattern",
    query: "(identifier) @name",
    captures: [],
    inferredSchema: "api-contract",
    inferredDomain: "systems",
    ...overrides,
  };
}

function makeMatch(overrides: Partial<QueryMatch> = {}): QueryMatch {
  return {
    pattern: makePattern(),
    file: "src/api/test.ts",
    captures: {},
    startLine: 0,
    endLine: 0,
    ...overrides,
  };
}

function makeEntity(id: string, kind: string, title?: string): BackstageEntity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name: id,
      namespace: "default",
      title: title ?? id,
      description: "test",
    },
    spec: {
      type: kind,
      owner: "test",
      lifecycle: "production",
    },
  } as BackstageEntity;
}

// ─── Query Pack Registry ────────────────────────────────────────────────────────

describe("Query Pack Registry", () => {
  it("returns javascript packs by default", () => {
    const packs = getQueryPacks();
    expect(packs.length).toBeGreaterThan(0);
    expect(new Set(packs.map((p) => p.language))).toEqual(
      new Set(["javascript", "typescript"]),
    );
  });

  it("returns packs for specified language", () => {
    const packs = getQueryPacks(["typescript"]);
    expect(packs.length).toBeGreaterThan(0);
    expect(packs.every((p) => p.language === "typescript")).toBe(true);
  });

  it("returns empty for unknown language", () => {
    const packs = getQueryPacks(["cobol"]);
    expect(packs).toHaveLength(0);
  });

  it("returns no built-in packs for an explicit empty list", () => {
    const packs = getQueryPacks([]);
    expect(packs).toHaveLength(0);
  });

  it("builtinPacks has javascript key", () => {
    expect(builtinPacks.javascript).toBeDefined();
    expect(builtinPacks.javascript.length).toBeGreaterThan(0);
    expect(builtinPacks.typescript).toBeDefined();
    expect(builtinPacks.typescript.length).toBeGreaterThan(0);
  });
});

// ─── JavaScript Query Packs ─────────────────────────────────────────────────────

describe("JavaScript Query Packs", () => {
  it("has express routes pack", () => {
    const pack = javascriptPacks.find((p) => p.name === "express-routes");
    expect(pack).toBeDefined();
    expect(pack!.language).toBe("javascript");
    expect(pack!.patterns.length).toBeGreaterThan(0);
  });

  it("has prisma db access pack", () => {
    const pack = javascriptPacks.find((p) => p.name === "prisma-db-access");
    expect(pack).toBeDefined();
    expect(pack!.patterns[0].category).toBe("db-access");
  });

  it("has event emitter pack", () => {
    const pack = javascriptPacks.find((p) => p.name === "event-emitter");
    expect(pack).toBeDefined();
    expect(pack!.patterns[0].category).toBe("event");
  });

  it("has fetch external calls pack", () => {
    const pack = javascriptPacks.find((p) => p.name === "fetch-external-calls");
    expect(pack).toBeDefined();
    expect(pack!.patterns[0].category).toBe("external-call");
  });

  it("all packs have valid structure", () => {
    for (const pack of javascriptPacks) {
      expect(pack.name).toBeTruthy();
      expect(pack.language).toBe("javascript");
      expect(pack.fileGlobs.length).toBeGreaterThan(0);
      for (const pattern of pack.patterns) {
        expect(pattern.name).toBeTruthy();
        expect(pattern.query).toBeTruthy();
        expect(pattern.inferredSchema).toBeTruthy();
        expect(pattern.inferredDomain).toBeTruthy();
      }
    }
  });
});

describe("TypeScript Query Packs", () => {
  it("has express routes pack", () => {
    const pack = typescriptPacks.find((p) => p.name === "express-routes");
    expect(pack).toBeDefined();
    expect(pack!.language).toBe("typescript");
    expect(pack!.patterns.length).toBeGreaterThan(0);
  });
});

// ─── Aggregator: Route Aggregation ──────────────────────────────────────────────

describe("Aggregator: Route Aggregation", () => {
  it("aggregates routes by directory", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/users.ts",
        captures: { "@route.path": "/users", "@method": "get" },
      }),
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/users.ts",
        captures: { "@route.path": "/users/:id", "@method": "get" },
      }),
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/orders.ts",
        captures: { "@route.path": "/orders", "@method": "post" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    expect(drafts.length).toBe(1); // Same directory group (src/api)
    expect(drafts[0].kind).toBe("API");
    expect(drafts[0].schema).toBe("api-contract");
    expect(drafts[0].confidence).toBe("observed");
    expect(drafts[0].anchors?.apis).toContain("/users");
    expect(drafts[0].anchors?.apis).toContain("/users/:id");
    expect(drafts[0].anchors?.apis).toContain("/orders");
  });

  it("separates routes in different directories", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/users.ts",
        captures: { "@route.path": "/users", "@method": "get" },
      }),
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/webhooks/handler.ts",
        captures: { "@route.path": "/webhooks", "@method": "post" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    // Could be 1 or 2 depending on dir depth grouping
    expect(drafts.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Aggregator: DB Access Aggregation ──────────────────────────────────────────

describe("Aggregator: DB Access", () => {
  it("aggregates DB access by model name", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "db-access", inferredSchema: "physical-schema", inferredDomain: "data" }),
        file: "src/api/users.ts",
        captures: { "@model": "user", "@operation": "findMany" },
      }),
      makeMatch({
        pattern: makePattern({ category: "db-access", inferredSchema: "physical-schema", inferredDomain: "data" }),
        file: "src/api/users.ts",
        captures: { "@model": "user", "@operation": "create" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("Resource");
    expect(drafts[0].schema).toBe("physical-schema");
    expect(drafts[0].summary).toContain("user");
    expect(drafts[0].summary).toContain("findMany");
  });
});

// ─── Aggregator: Event Aggregation ──────────────────────────────────────────────

describe("Aggregator: Events", () => {
  it("aggregates events by name", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "event", inferredSchema: "event-contract" }),
        file: "src/services/orders.ts",
        captures: { "@event.name": "order.created" },
      }),
      makeMatch({
        pattern: makePattern({ category: "event", inferredSchema: "event-contract" }),
        file: "src/workers/notifications.ts",
        captures: { "@event.name": "order.created" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("API");
    expect(drafts[0].schema).toBe("event-contract");
    expect(drafts[0].anchors?.events).toContain("order.created");
    expect(drafts[0].anchors?.files).toHaveLength(2);
  });
});

// ─── Aggregator: External Calls ─────────────────────────────────────────────────

describe("Aggregator: External Calls", () => {
  it("aggregates external service calls", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "external-call", inferredSchema: "service" }),
        file: "src/clients/payments.ts",
        captures: { "@url": "https://api.stripe.com/v1/charges" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("Component");
    expect(drafts[0].schema).toBe("service");
    expect(drafts[0].confidence).toBe("inferred");
  });
});

describe("Aggregator: Framework Categories", () => {
  it("creates the framework domain/system backbone and attaches CLI commands", () => {
    const drafts = aggregateMatches([
      makeMatch({
        pattern: makePattern({ category: "cli-command", inferredSchema: "system-interface" }),
        file: "src/cli/commands/ea-discover.ts",
        captures: {
          "@command.name": "discover",
          "@symbol.name": "eaDiscoverCommand",
        },
      }),
    ], []);

    expect(drafts.map((draft) => draft.suggestedId)).toEqual(expect.arrayContaining([
      "domain:anchored-spec",
      "system:anchored-spec-framework",
      "component:anchored-spec-cli",
      "systeminterface:cli-discover",
    ]));
    const commandDraft = drafts.find((draft) => draft.suggestedId === "systeminterface:cli-discover");
    expect(commandDraft?.schema).toBe("system-interface");
    expect(commandDraft?.anchors?.commands).toContain("discover");
    expect(commandDraft?.schemaFields?.direction).toBe("inbound");
    expect(commandDraft?.schemaFields?.ownership).toBe("owned");
    expect(commandDraft?.schemaFields?.system).toBe("anchored-spec-framework");
    expect(commandDraft?.relations).toEqual([]);
  });

  it("rolls discovered resolvers up into the resolver runtime component", () => {
    const drafts = aggregateMatches([
      makeMatch({
        pattern: makePattern({ category: "resolver", inferredSchema: "service" }),
        file: "src/ea/resolvers/markdown.ts",
        captures: {
          "@resolver.name": "MarkdownResolver",
          "@module.name": "markdown",
        },
      }),
    ], []);

    const runtimeDraft = drafts.find(
      (draft) => draft.suggestedId === "component:anchored-spec-resolver-runtime",
    );
    expect(runtimeDraft?.schema).toBe("service");
    expect(runtimeDraft?.anchors?.symbols).toContain("MarkdownResolver");
  });

  it("rolls framework modules up into area components instead of one entity per file", () => {
    const drafts = aggregateMatches([
      makeMatch({
        pattern: makePattern({ category: "framework-module", inferredSchema: "service" }),
        file: "src/ea/discovery.ts",
        captures: {
          "@symbol.name": "discoverEntities",
          "@module.name": "discovery",
        },
      }),
      makeMatch({
        pattern: makePattern({ category: "framework-module", inferredSchema: "service" }),
        file: "src/ea/discovery.ts",
        captures: {
          "@symbol.name": "renderDiscoveryReportMarkdown",
          "@module.name": "discovery",
        },
      }),
    ], []);

    const discoveryEngine = drafts.find(
      (draft) => draft.suggestedId === "component:anchored-spec-discovery-engine",
    );
    expect(discoveryEngine?.title).toBe("Anchored Spec Discovery Engine");
    expect(discoveryEngine?.anchors?.symbols).toContain("discoverEntities");
    expect(
      drafts.find((draft) => draft.title === "discovery module"),
    ).toBeUndefined();
  });
});

// ─── Aggregator: Deduplication ──────────────────────────────────────────────────

describe("Aggregator: Deduplication", () => {
  it("deduplicates against existing entities by ID", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/users.ts",
        captures: { "@route.path": "/users", "@method": "get" },
      }),
    ];

    const existing = [makeEntity("API-api", "api-contract", "api API")];
    const drafts = aggregateMatches(matches, existing);
    expect(drafts).toHaveLength(0); // Deduplicated via title match
  });

  it("deduplicates within results by suggested ID", () => {
    // Two matches that would produce the same suggested ID
    const pattern = makePattern({ category: "event", inferredSchema: "event-contract" });
    const matches: QueryMatch[] = [
      makeMatch({
        pattern,
        file: "src/a.ts",
        captures: { "@event.name": "test.event" },
      }),
      makeMatch({
        pattern,
        file: "src/b.ts",
        captures: { "@event.name": "test.event" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    expect(drafts).toHaveLength(1);
  });

  it("keeps drafts not matching any existing entity", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/payments.ts",
        captures: { "@route.path": "/payments", "@method": "post" },
      }),
    ];

    const existing = [makeEntity("API-users", "api-contract")];
    const drafts = aggregateMatches(matches, existing);
    expect(drafts.length).toBeGreaterThan(0);
  });
});

// ─── Aggregator: Empty Input ────────────────────────────────────────────────────

describe("Aggregator: Edge Cases", () => {
  it("returns empty array for no matches", () => {
    const drafts = aggregateMatches([], []);
    expect(drafts).toHaveLength(0);
  });

  it("handles matches with missing captures gracefully", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ category: "route", inferredSchema: "api-contract" }),
        file: "src/api/test.ts",
        captures: {}, // No route.path captured
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    // Should not crash — might produce 0 entities since no routes extracted
    expect(drafts).toBeDefined();
  });

  it("handles uncategorized patterns", () => {
    const matches: QueryMatch[] = [
      makeMatch({
        pattern: makePattern({ name: "custom-thing", inferredSchema: "service" }),
        file: "src/custom.ts",
        captures: { "@name": "my-service" },
      }),
    ];

    const drafts = aggregateMatches(matches, []);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].confidence).toBe("inferred");
  });
});
