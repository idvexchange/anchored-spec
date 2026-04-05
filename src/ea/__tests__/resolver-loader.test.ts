/**
 * Tests for config-driven resolver loading.
 */
import { describe, it, expect, vi } from "vitest";
import { loadResolver, loadResolversFromConfig } from "../resolvers/loader.js";
import type { EaResolver } from "../resolvers/types.js";
import type { EaResolverConfig } from "../config.js";

// ── Mock built-in resolver map ──────────────────────────────────────────────

class MockOpenApiResolver implements EaResolver {
  name = "openapi";
  discoverEntities() {
    return [
      {
        kind: "api-contract" as const,
        title: "Mock API",
        domain: "application" as const,
        sourceFile: "openapi.yaml",
        resolver: "openapi",
        confidence: "observed" as const,
      },
    ];
  }
}

const builtinMap: Record<string, new () => EaResolver> = {
  openapi: MockOpenApiResolver as unknown as new () => EaResolver,
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("loadResolver", () => {
  it("loads a built-in resolver by name", async () => {
    const config: EaResolverConfig = { name: "openapi" };
    const loaded = await loadResolver(config, builtinMap, "/tmp");

    expect(loaded.name).toBe("openapi");
    expect(loaded.isAsync).toBe(false);
    expect(loaded.discoverSync).toBeDefined();
  });

  it("throws for unknown built-in name", async () => {
    const config: EaResolverConfig = { name: "nonexistent" };
    await expect(loadResolver(config, builtinMap, "/tmp")).rejects.toThrow(
      /Unknown built-in resolver "nonexistent"/,
    );
  });

  it("throws when neither name nor path is provided", async () => {
    const config: EaResolverConfig = {};
    await expect(loadResolver(config, builtinMap, "/tmp")).rejects.toThrow(
      /must have either "name".*or "path"/,
    );
  });

  it("throws for invalid custom resolver path", async () => {
    const config: EaResolverConfig = { path: "./nonexistent-module.js" };
    await expect(loadResolver(config, builtinMap, "/tmp")).rejects.toThrow(
      /Failed to load custom resolver/,
    );
  });

  it("loads tree-sitter resolver by name", async () => {
    const config: EaResolverConfig = {
      name: "tree-sitter",
      options: { queryPacks: ["javascript"] },
    };
    const loaded = await loadResolver(config, builtinMap, "/tmp");

    expect(loaded.name).toBe("tree-sitter");
    expect(loaded.isAsync).toBe(true);
    expect(loaded.discoverAsync).toBeDefined();
  });

  it("passes options to tree-sitter resolver", async () => {
    const config: EaResolverConfig = {
      name: "tree-sitter",
      options: { queryPacks: ["javascript"] },
    };
    const loaded = await loadResolver(config, builtinMap, "/tmp");
    // Verify it's created (async resolver) — full execution
    // would need web-tree-sitter which is optional
    expect(loaded.isAsync).toBe(true);
  });
});

describe("loadResolversFromConfig", () => {
  it("loads multiple resolvers from config array", async () => {
    const configs: EaResolverConfig[] = [
      { name: "openapi" },
      { name: "tree-sitter", options: { queryPacks: ["javascript"] } },
    ];

    const loaded = await loadResolversFromConfig(configs, builtinMap, "/tmp");

    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.name).toBe("openapi");
    expect(loaded[0]!.isAsync).toBe(false);
    expect(loaded[1]!.name).toBe("tree-sitter");
    expect(loaded[1]!.isAsync).toBe(true);
  });

  it("returns empty array for empty config", async () => {
    const loaded = await loadResolversFromConfig([], builtinMap, "/tmp");
    expect(loaded).toHaveLength(0);
  });

  it("built-in sync resolver produces entities", async () => {
    const config: EaResolverConfig = { name: "openapi" };
    const loaded = await loadResolver(config, builtinMap, "/tmp");

    expect(loaded.discoverSync).toBeDefined();
    const drafts = loaded.discoverSync!({
      projectRoot: "/tmp",
      entities: [],
      cache: { get: vi.fn(), set: vi.fn(), clear: vi.fn() },
      logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    });

    expect(drafts).toHaveLength(1);
    expect(drafts![0]!.kind).toBe("api-contract");
  });
});
