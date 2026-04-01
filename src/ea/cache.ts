/**
 * Anchored Spec — EA Resolver Cache
 *
 * Disk-based cache with TTL-based expiry for resolver observed state.
 * Cache is stored at `.anchored-spec/cache/ea/` as JSON files.
 *
 * Design reference: docs/delivery/discovery-drift-generation.md (Resolver Cache)
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

// ─── Cache Interface ────────────────────────────────────────────────────────────

/** Cache interface for storing/retrieving resolver observed state. */
export interface ResolverCache {
  /**
   * Get cached data. Returns null if not cached or expired.
   * @param key - Cache key (resolver chooses its own key space)
   * @param maxAge - Maximum age in seconds. If the cached entry is older, returns null.
   */
  get<T = unknown>(key: string, maxAge?: number): T | null;

  /**
   * Store data in cache.
   * @param key - Cache key
   * @param value - Data to cache
   */
  set<T = unknown>(key: string, value: T): void;

  /** Invalidate a specific cache key. */
  invalidate(key: string): void;

  /** Invalidate all cached data. */
  invalidateAll(): void;

  /** Get cache stats. */
  stats(): CacheStats;
}

/** Cache entry stored on disk. */
export interface CacheEntry<T = unknown> {
  /** The cached value. */
  value: T;
  /** ISO 8601 timestamp when cached. */
  cachedAt: string;
  /** Unix timestamp (ms) for fast TTL comparison. */
  cachedAtMs: number;
  /** Optional metadata about the cache entry. */
  metadata?: {
    resolver?: string;
    source?: string;
  };
}

/** Statistics about the cache. */
export interface CacheStats {
  /** Number of entries in cache. */
  entries: number;
  /** Total size in bytes of cache directory. */
  sizeBytes: number;
  /** Path to cache directory. */
  cacheDir: string;
}

// ─── Disk-Based Cache Implementation ────────────────────────────────────────────

/** Default cache directory relative to project root. */
export const DEFAULT_CACHE_DIR = ".anchored-spec/cache/ea";

/** Default TTL in seconds (1 hour). */
export const DEFAULT_TTL_SECONDS = 3600;

/**
 * Disk-based resolver cache.
 *
 * Each cache entry is stored as a separate JSON file keyed by a
 * sanitized version of the cache key. TTL is checked on read.
 */
export class DiskResolverCache implements ResolverCache {
  readonly cacheDir: string;
  readonly defaultTTL: number;

  constructor(projectRoot: string, options?: { cacheDir?: string; defaultTTL?: number }) {
    this.cacheDir = join(projectRoot, options?.cacheDir ?? DEFAULT_CACHE_DIR);
    this.defaultTTL = options?.defaultTTL ?? DEFAULT_TTL_SECONDS;
  }

  get<T = unknown>(key: string, maxAge?: number): T | null {
    const filepath = this.keyToPath(key);
    if (!existsSync(filepath)) return null;

    try {
      const raw = readFileSync(filepath, "utf-8");
      const entry: CacheEntry<T> = JSON.parse(raw);

      // Check TTL
      const ttl = maxAge ?? this.defaultTTL;
      const ageMs = Date.now() - entry.cachedAtMs;
      if (ageMs > ttl * 1000) {
        // Expired — remove and return null
        this.invalidate(key);
        return null;
      }

      return entry.value;
    } catch {
      // Corrupted entry — remove it
      this.invalidate(key);
      return null;
    }
  }

  set<T = unknown>(key: string, value: T): void {
    mkdirSync(this.cacheDir, { recursive: true });

    const entry: CacheEntry<T> = {
      value,
      cachedAt: new Date().toISOString(),
      cachedAtMs: Date.now(),
    };

    const filepath = this.keyToPath(key);
    writeFileSync(filepath, JSON.stringify(entry, null, 2) + "\n");
  }

  invalidate(key: string): void {
    const filepath = this.keyToPath(key);
    if (existsSync(filepath)) {
      rmSync(filepath);
    }
  }

  invalidateAll(): void {
    if (existsSync(this.cacheDir)) {
      rmSync(this.cacheDir, { recursive: true, force: true });
    }
  }

  stats(): CacheStats {
    if (!existsSync(this.cacheDir)) {
      return { entries: 0, sizeBytes: 0, cacheDir: this.cacheDir };
    }

    const files = readdirSync(this.cacheDir).filter((f) => f.endsWith(".json"));
    let sizeBytes = 0;
    for (const f of files) {
      try {
        sizeBytes += statSync(join(this.cacheDir, f)).size;
      } catch {
        // ignore stat errors
      }
    }

    return { entries: files.length, sizeBytes, cacheDir: this.cacheDir };
  }

  /** Check if a key exists and is not expired. */
  has(key: string, maxAge?: number): boolean {
    return this.get(key, maxAge) !== null;
  }

  /**
   * Sanitize a cache key to a safe filename.
   * Replaces non-alphanumeric chars with dashes, limits length.
   */
  private keyToPath(key: string): string {
    const sanitized = key
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 200);
    return join(this.cacheDir, `${sanitized}.json`);
  }
}

// ─── No-Op Cache ────────────────────────────────────────────────────────────────

/**
 * A no-op cache that never stores anything (used with --no-cache).
 */
export class NoOpCache implements ResolverCache {
  get<T = unknown>(): T | null {
    return null;
  }

  set(): void {
    // no-op
  }

  invalidate(): void {
    // no-op
  }

  invalidateAll(): void {
    // no-op
  }

  stats(): CacheStats {
    return { entries: 0, sizeBytes: 0, cacheDir: "(disabled)" };
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create a resolver cache based on options.
 *
 * If `noCache` is true, returns a NoOpCache.
 * Otherwise returns a DiskResolverCache with the specified TTL.
 */
export function createResolverCache(
  projectRoot: string,
  options?: { noCache?: boolean; maxCacheAge?: number; cacheDir?: string },
): ResolverCache {
  if (options?.noCache) {
    return new NoOpCache();
  }

  return new DiskResolverCache(projectRoot, {
    cacheDir: options?.cacheDir,
    defaultTTL: options?.maxCacheAge,
  });
}
