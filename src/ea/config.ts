/**
 * Anchored Spec — EA Configuration
 *
 * Defines both the v0.x nested EaConfig and the v1.0 flattened
 * AnchoredSpecConfigV1 where EA fields are promoted to top-level.
 *
 * Design reference: docs/ea-implementation-guide.md
 */

import type { EaDomain } from "./types.js";

// ─── Shared Sub-Config Types ────────────────────────────────────────────────────

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

/** Hook event types. */
export type EaHookEvent =
  | "post-create"
  | "post-transition"
  | `post-create:${string}`
  | `post-transition:${string}`;

/** Lifecycle hook definition. */
export interface EaHookDefinition {
  event: EaHookEvent;
  run: string;
}

/** Test metadata linking configuration. */
export interface EaTestMetadataConfig {
  /** Glob patterns for test files. */
  testGlobs?: string[];
  /** Regex pattern(s) to extract artifact IDs from test files. */
  requirementPattern?: string | string[];
}

// ─── v0.x EA Configuration (nested under AnchoredSpecConfig.ea) ─────────────────

/**
 * v0.x EA configuration shape (nested inside `AnchoredSpecConfig.ea`).
 * Retained for backward compatibility with v0.x config files.
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

// ─── v1.0 Configuration (EA fields promoted to top-level) ───────────────────────

/**
 * v1.0 unified configuration — EA-only, no legacy dual-mode.
 *
 * Breaking changes from v0.x `AnchoredSpecConfig`:
 * - `ea.enabled` removed (always on)
 * - `ea.*` fields promoted to top-level
 * - `specRoot`, `requirementsDir`, `changesDir`, `decisionsDir` removed
 *   (requirements live under `domains.business`, changes/decisions under `domains.transitions`)
 * - `workflowPolicyPath` moved to top-level (default: "ea/workflow-policy.yaml")
 * - `sourceRoots`, `sourceGlobs`, `hooks`, `testMetadata` moved to top-level
 */
export interface AnchoredSpecConfigV1 {
  /** Config format version. Must be "1.0". */
  schemaVersion: "1.0";

  /** Root directory for EA artifacts. Default: "ea". */
  rootDir: string;

  /** Directory for generated output files. Default: "ea/generated". */
  generatedDir: string;

  /** Optional organizational prefix for artifact IDs (e.g., "acme"). */
  idPrefix?: string | null;

  /** Per-domain subdirectory paths. */
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

  /** Source code root directories for anchor resolution. */
  sourceRoots?: string[];

  /** Source code glob patterns for anchor resolution. */
  sourceGlobs?: string[];

  /** Plugin module paths. */
  plugins?: string[];

  /** Glob patterns for files to exclude from artifact loading. */
  exclude?: string[];

  /** Pluggable drift resolver module paths. */
  driftResolvers?: string[];

  /** Lifecycle hooks. */
  hooks?: EaHookDefinition[];

  /** Test metadata linking configuration. */
  testMetadata?: EaTestMetadataConfig;

  /** Path to workflow policy file. Default: "ea/workflow-policy.yaml". */
  workflowPolicyPath?: string;

  /** Custom change types beyond built-in types. */
  customChangeTypes?: string[];
}

// ─── v0.x Defaults & Resolution ─────────────────────────────────────────────────

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

// ─── v1.0 Defaults & Resolution ─────────────────────────────────────────────────

function buildV1Defaults(rootDir: string): AnchoredSpecConfigV1 {
  return {
    schemaVersion: "1.0",
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
      dir: ".anchored-spec/cache",
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
    workflowPolicyPath: `${rootDir}/workflow-policy.yaml`,
  };
}

/**
 * Resolve a complete v1.0 config from a partial user-provided config.
 */
export function resolveConfigV1(
  partial?: Partial<AnchoredSpecConfigV1> | null
): AnchoredSpecConfigV1 {
  const rootDir = partial?.rootDir ?? "ea";
  const defaults = buildV1Defaults(rootDir);

  if (!partial) return defaults;

  return {
    schemaVersion: "1.0",
    rootDir,
    generatedDir: partial.generatedDir ?? defaults.generatedDir,
    idPrefix: partial.idPrefix ?? defaults.idPrefix,
    domains: { ...defaults.domains, ...partial.domains },
    resolvers: partial.resolvers ?? defaults.resolvers,
    generators: partial.generators ?? defaults.generators,
    evidenceSources: partial.evidenceSources ?? defaults.evidenceSources,
    cache: { ...defaults.cache, ...partial.cache },
    quality: { ...defaults.quality, ...partial.quality },
    sourceRoots: partial.sourceRoots,
    sourceGlobs: partial.sourceGlobs,
    plugins: partial.plugins,
    exclude: partial.exclude,
    driftResolvers: partial.driftResolvers,
    hooks: partial.hooks,
    testMetadata: partial.testMetadata,
    workflowPolicyPath: partial.workflowPolicyPath ?? defaults.workflowPolicyPath,
    customChangeTypes: partial.customChangeTypes,
  };
}

// ─── Config Migration (v0.x → v1.0) ────────────────────────────────────────────

/** Input type for the v0.x config migration — the raw JSON object from config.json. */
export interface LegacyConfigInput {
  specRoot?: string;
  schemasDir?: string;
  requirementsDir?: string;
  changesDir?: string;
  decisionsDir?: string;
  workflowPolicyPath?: string;
  generatedDir?: string;
  sourceRoots?: string[];
  sourceGlobs?: string[];
  plugins?: string[];
  exclude?: string[];
  driftResolvers?: string[];
  hooks?: Array<{ event: string; run: string }>;
  testMetadata?: { testGlobs?: string[]; requirementPattern?: string | string[] };
  customChangeTypes?: string[];
  quality?: { validateFilePaths?: boolean; rules?: Record<string, string> };
  ea?: Partial<EaConfig>;
}

/**
 * Migrate a v0.x `AnchoredSpecConfig` (with nested `ea?`) to v1.0 flat format.
 *
 * Strategy:
 * - EA fields from `ea.*` are promoted to top-level
 * - Core fields (`sourceRoots`, `sourceGlobs`, `hooks`, `testMetadata`, etc.)
 *   are hoisted to top-level
 * - Legacy dir fields (`specRoot`, `requirementsDir`, `changesDir`, `decisionsDir`)
 *   are dropped — requirements go to `business`, changes/decisions go to `transitions`
 * - `ea.enabled` is dropped (always on in v1.0)
 */
export function migrateConfigV0ToV1(legacy: LegacyConfigInput): AnchoredSpecConfigV1 {
  const ea = legacy.ea ?? {};
  const rootDir = ea.rootDir ?? "ea";

  const v1: AnchoredSpecConfigV1 = {
    schemaVersion: "1.0",
    rootDir,
    generatedDir: ea.generatedDir ?? `${rootDir}/generated`,
    idPrefix: ea.idPrefix ?? null,
    domains: {
      systems: `${rootDir}/systems`,
      delivery: `${rootDir}/delivery`,
      data: `${rootDir}/data`,
      information: `${rootDir}/information`,
      business: `${rootDir}/business`,
      transitions: `${rootDir}/transitions`,
      ...ea.domains,
    },
    resolvers: ea.resolvers ?? [],
    generators: ea.generators ?? [],
    evidenceSources: ea.evidenceSources ?? [],
    cache: {
      dir: ea.cache?.dir ?? ".anchored-spec/cache",
      defaultTTL: ea.cache?.defaultTTL ?? 3600,
    },
    quality: {
      requireOwners: ea.quality?.requireOwners ?? true,
      requireSummary: ea.quality?.requireSummary ?? true,
      requireRelations: ea.quality?.requireRelations ?? false,
      requireAnchors: ea.quality?.requireAnchors ?? false,
      strictMode: ea.quality?.strictMode ?? false,
      rules: ea.quality?.rules ?? {},
    },
    workflowPolicyPath: legacy.workflowPolicyPath ?? `${rootDir}/workflow-policy.yaml`,
  };

  // Hoist core fields that still apply
  if (legacy.sourceRoots) v1.sourceRoots = legacy.sourceRoots;
  if (legacy.sourceGlobs) v1.sourceGlobs = legacy.sourceGlobs;
  if (legacy.plugins) v1.plugins = legacy.plugins;
  if (legacy.exclude) v1.exclude = legacy.exclude;
  if (legacy.driftResolvers) v1.driftResolvers = legacy.driftResolvers;
  if (legacy.hooks) v1.hooks = legacy.hooks as EaHookDefinition[];
  if (legacy.testMetadata) v1.testMetadata = legacy.testMetadata;
  if (legacy.customChangeTypes) v1.customChangeTypes = legacy.customChangeTypes;

  return v1;
}

/**
 * Detect which config version a raw JSON object represents.
 */
export function detectConfigVersion(raw: Record<string, unknown>): "1.0" | "0.x" {
  if (raw.schemaVersion === "1.0") return "1.0";
  return "0.x";
}

/**
 * Convert an `AnchoredSpecConfigV1` to the `EaConfig` shape used internally
 * by EaRoot. This bridges v1 config files with the existing EA engine.
 */
export function v1ConfigToEaConfig(v1: AnchoredSpecConfigV1): EaConfig {
  return {
    enabled: true,
    rootDir: v1.rootDir,
    generatedDir: v1.generatedDir,
    idPrefix: v1.idPrefix,
    domains: { ...v1.domains },
    resolvers: [...v1.resolvers],
    generators: [...v1.generators],
    evidenceSources: [...v1.evidenceSources],
    cache: { ...v1.cache },
    quality: { ...v1.quality },
  };
}
