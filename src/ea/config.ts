/**
 * Anchored Spec — EA Configuration
 *
 * Defines the EA configuration shape and resolution function.
 * Follows the same `buildDefaults → spread merge` pattern as the core config.
 *
 * Design reference: docs/ea-implementation-guide.md
 */

import type { EaDomain } from "./types.js";

// ─── EA Configuration ───────────────────────────────────────────────────────────

/** Resolver plugin configuration. */
export interface EaResolverConfig {
  /** Module path to the resolver (.js/.mjs/.cjs). */
  path: string;
  /** Cache TTL in seconds for this resolver. Overrides the global default. */
  cacheTTL?: number;
  /** Resolver-specific options. */
  options?: Record<string, unknown>;
}

/** Generator plugin configuration. */
export interface EaGeneratorConfig {
  /** Module path to the generator (.js/.mjs/.cjs). */
  path: string;
  /** Output directory for generated files. */
  outputDir: string;
  /** Generator-specific options. */
  options?: Record<string, unknown>;
}

/** Quality rules configuration for EA validation. */
export interface EaQualityConfig {
  /** Active artifacts must have at least one owner. Default: true. */
  requireOwners: boolean;
  /** Active artifacts must have a non-empty summary. Default: true. */
  requireSummary: boolean;
  /** Active artifacts should have at least one relation. Default: false. */
  requireRelations: boolean;
  /** Active system/delivery artifacts should have anchors. Default: false. */
  requireAnchors: boolean;
  /** Treat warnings as errors. Default: false. */
  strictMode: boolean;
  /** Per-rule severity overrides. */
  rules: Record<string, "error" | "warning" | "info" | "off">;
}

/** Cache configuration for resolver results. */
export interface EaCacheConfig {
  /** Cache directory. Default: ".anchored-spec/cache/ea". */
  dir: string;
  /** Default TTL in seconds. Default: 3600. */
  defaultTTL: number;
}

/**
 * Complete EA configuration shape.
 *
 * Added to `AnchoredSpecConfig.ea` when EA is enabled.
 */
export interface EaConfig {
  /** Whether EA features are enabled. Default: false. */
  enabled: boolean;

  /** Root directory for EA artifacts. Default: "ea". */
  rootDir: string;

  /** Directory for generated output files. Default: "ea/generated". */
  generatedDir: string;

  /** Optional organizational prefix for IDs (e.g., "acme"). */
  idPrefix?: string | null;

  /** Per-domain subdirectory paths, relative to rootDir. */
  domains: Record<EaDomain, string>;

  /** Configured resolver plugins. */
  resolvers: EaResolverConfig[];

  /** Configured generator plugins. */
  generators: EaGeneratorConfig[];

  /** Evidence source paths. */
  evidenceSources: string[];

  /** Resolver cache settings. */
  cache: EaCacheConfig;

  /** Quality rule settings. */
  quality: EaQualityConfig;
}

// ─── Defaults & Resolution ──────────────────────────────────────────────────────

function buildEaDefaults(rootDir: string): EaConfig {
  return {
    enabled: false,
    rootDir,
    generatedDir: `${rootDir}/generated`,
    idPrefix: null,
    domains: {
      systems: `${rootDir}/systems`,
      delivery: `${rootDir}/delivery`,
      data: `${rootDir}/data`,
      information: `${rootDir}/information`,
      business: `${rootDir}/business`,
      transitions: `${rootDir}/transitions`,
    },
    resolvers: [],
    generators: [],
    evidenceSources: [],
    cache: {
      dir: ".anchored-spec/cache/ea",
      defaultTTL: 3600,
    },
    quality: {
      requireOwners: true,
      requireSummary: true,
      requireRelations: false,
      requireAnchors: false,
      strictMode: false,
      rules: {},
    },
  };
}

/**
 * Resolve a complete `EaConfig` from a partial user-provided config.
 *
 * Merges user overrides onto defaults. Nested objects (`domains`, `cache`,
 * `quality`) are shallow-merged individually so partial overrides work.
 */
export function resolveEaConfig(
  partial?: Partial<EaConfig> | null
): EaConfig {
  const rootDir = partial?.rootDir ?? "ea";
  const defaults = buildEaDefaults(rootDir);

  if (!partial) return defaults;

  return {
    enabled: partial.enabled ?? defaults.enabled,
    rootDir,
    generatedDir: partial.generatedDir ?? defaults.generatedDir,
    idPrefix: partial.idPrefix ?? defaults.idPrefix,
    domains: { ...defaults.domains, ...partial.domains },
    resolvers: partial.resolvers ?? defaults.resolvers,
    generators: partial.generators ?? defaults.generators,
    evidenceSources: partial.evidenceSources ?? defaults.evidenceSources,
    cache: { ...defaults.cache, ...partial.cache },
    quality: { ...defaults.quality, ...partial.quality },
  };
}
