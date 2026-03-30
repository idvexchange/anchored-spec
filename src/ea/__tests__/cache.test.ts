import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  DiskResolverCache,
  NoOpCache,
  createResolverCache,
  DEFAULT_CACHE_DIR,
  DEFAULT_TTL_SECONDS,
} from "../cache.js";

const TEST_ROOT = join(tmpdir(), `ea-cache-test-${Date.now()}`);

describe("DiskResolverCache", () => {
  let cache: DiskResolverCache;

  beforeEach(() => {
    cache = new DiskResolverCache(TEST_ROOT);
  });

  afterEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it("should use default cache dir and TTL", () => {
    expect(cache.cacheDir).toBe(join(TEST_ROOT, DEFAULT_CACHE_DIR));
    expect(cache.defaultTTL).toBe(DEFAULT_TTL_SECONDS);
  });

  it("should accept custom cache dir and TTL", () => {
    const custom = new DiskResolverCache(TEST_ROOT, { cacheDir: "my-cache", defaultTTL: 60 });
    expect(custom.cacheDir).toBe(join(TEST_ROOT, "my-cache"));
    expect(custom.defaultTTL).toBe(60);
  });

  it("should return null for non-existent key", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  it("should store and retrieve a value", () => {
    cache.set("test-key", { foo: "bar", count: 42 });
    const result = cache.get<{ foo: string; count: number }>("test-key");
    expect(result).toEqual({ foo: "bar", count: 42 });
  });

  it("should store cache entry as JSON on disk", () => {
    cache.set("disk-check", "hello");
    const cacheDir = cache.cacheDir;
    expect(existsSync(cacheDir)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const files = require("node:fs").readdirSync(cacheDir);
    expect(files.length).toBe(1);
    const content = JSON.parse(readFileSync(join(cacheDir, files[0]), "utf-8"));
    expect(content.value).toBe("hello");
    expect(content.cachedAt).toBeDefined();
    expect(content.cachedAtMs).toBeTypeOf("number");
  });

  it("should expire entries beyond maxAge", () => {
    // Manually write an entry with old timestamp
    mkdirSync(cache.cacheDir, { recursive: true });
    const entry = {
      value: "old-data",
      cachedAt: new Date(Date.now() - 120_000).toISOString(),
      cachedAtMs: Date.now() - 120_000, // 120 seconds ago
    };
    writeFileSync(join(cache.cacheDir, "old-entry.json"), JSON.stringify(entry));

    // With default TTL (3600s), this should still be valid
    const validResult = new DiskResolverCache(TEST_ROOT).get("old-entry", 3600);
    expect(validResult).toBe("old-data");

    // With maxAge of 60s, this should be expired
    const expiredResult = new DiskResolverCache(TEST_ROOT).get("old-entry", 60);
    expect(expiredResult).toBeNull();
  });

  it("should use defaultTTL when maxAge is not provided", () => {
    const shortTtl = new DiskResolverCache(TEST_ROOT, { defaultTTL: 1 });
    shortTtl.set("short-lived", "data");

    // Immediately, should be available
    expect(shortTtl.get("short-lived")).toBe("data");

    // Manually age the entry
    mkdirSync(shortTtl.cacheDir, { recursive: true });
    const filepath = join(shortTtl.cacheDir, "short-lived.json");
    const entry = JSON.parse(readFileSync(filepath, "utf-8"));
    entry.cachedAtMs = Date.now() - 2000; // 2 seconds ago
    writeFileSync(filepath, JSON.stringify(entry));

    // Now it should be expired (TTL=1s, age=2s)
    expect(shortTtl.get("short-lived")).toBeNull();
  });

  it("should invalidate a specific key", () => {
    cache.set("to-delete", "value");
    expect(cache.get("to-delete")).toBe("value");

    cache.invalidate("to-delete");
    expect(cache.get("to-delete")).toBeNull();
  });

  it("should not throw when invalidating non-existent key", () => {
    expect(() => cache.invalidate("does-not-exist")).not.toThrow();
  });

  it("should invalidateAll clearing the entire cache directory", () => {
    cache.set("key1", "val1");
    cache.set("key2", "val2");
    expect(cache.stats().entries).toBe(2);

    cache.invalidateAll();
    expect(existsSync(cache.cacheDir)).toBe(false);
    expect(cache.stats().entries).toBe(0);
  });

  it("should not throw when invalidateAll on empty cache", () => {
    expect(() => cache.invalidateAll()).not.toThrow();
  });

  it("should return stats", () => {
    cache.set("a", "hello");
    cache.set("b", { complex: true });
    const stats = cache.stats();
    expect(stats.entries).toBe(2);
    expect(stats.sizeBytes).toBeGreaterThan(0);
    expect(stats.cacheDir).toBe(cache.cacheDir);
  });

  it("should return zero stats for non-existent cache", () => {
    const stats = cache.stats();
    expect(stats.entries).toBe(0);
    expect(stats.sizeBytes).toBe(0);
  });

  it("should sanitize keys with special characters", () => {
    cache.set("org/repo:branch#123", "value");
    expect(cache.get("org/repo:branch#123")).toBe("value");
  });

  it("should handle has() method", () => {
    expect(cache.has("missing")).toBe(false);
    cache.set("present", "data");
    expect(cache.has("present")).toBe(true);
  });

  it("should handle corrupted cache files gracefully", () => {
    mkdirSync(cache.cacheDir, { recursive: true });
    writeFileSync(join(cache.cacheDir, "corrupted.json"), "not valid json{{{");
    expect(cache.get("corrupted")).toBeNull();
  });

  it("should cache arrays and nested objects", () => {
    const complex = {
      items: [1, 2, 3],
      nested: { a: { b: "c" } },
      tags: ["foo", "bar"],
    };
    cache.set("complex", complex);
    expect(cache.get("complex")).toEqual(complex);
  });

  it("should overwrite existing key", () => {
    cache.set("key", "v1");
    expect(cache.get("key")).toBe("v1");
    cache.set("key", "v2");
    expect(cache.get("key")).toBe("v2");
  });
});

describe("NoOpCache", () => {
  const cache = new NoOpCache();

  it("should always return null on get", () => {
    expect(cache.get("anything")).toBeNull();
  });

  it("should not throw on set", () => {
    expect(() => cache.set("key", "value")).not.toThrow();
  });

  it("should not throw on invalidate", () => {
    expect(() => cache.invalidate("key")).not.toThrow();
  });

  it("should not throw on invalidateAll", () => {
    expect(() => cache.invalidateAll()).not.toThrow();
  });

  it("should return disabled stats", () => {
    const stats = cache.stats();
    expect(stats.entries).toBe(0);
    expect(stats.cacheDir).toBe("(disabled)");
  });
});

describe("createResolverCache", () => {
  afterEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it("should return DiskResolverCache by default", () => {
    const c = createResolverCache(TEST_ROOT);
    expect(c).toBeInstanceOf(DiskResolverCache);
  });

  it("should return NoOpCache when noCache is true", () => {
    const c = createResolverCache(TEST_ROOT, { noCache: true });
    expect(c).toBeInstanceOf(NoOpCache);
  });

  it("should pass maxCacheAge as defaultTTL", () => {
    const c = createResolverCache(TEST_ROOT, { maxCacheAge: 120 }) as DiskResolverCache;
    expect(c.defaultTTL).toBe(120);
  });

  it("should pass custom cacheDir", () => {
    const c = createResolverCache(TEST_ROOT, { cacheDir: "custom/path" }) as DiskResolverCache;
    expect(c.cacheDir).toBe(join(TEST_ROOT, "custom/path"));
  });
});
