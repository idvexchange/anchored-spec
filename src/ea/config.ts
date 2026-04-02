/**
 * Anchored Spec — EA Configuration
 *
 * Defines the current v1.0 Anchored Spec configuration.
 */

import type { EaDomain } from "./types.js";

// ─── Shared Sub-Config Types ────────────────────────────────────────────────────

/** Resolver plugin configuration. */
export interface EaResolverConfig {
  /** Built-in resolver name (e.g. "openapi", "tree-sitter"). Mutually exclusive with path. */
  name?: string;
  /** Module path to a custom resolver (.js/.mjs/.cjs). Mutually exclusive with name. */
  path?: string;
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
  /** Active entities must have at least one owner. Default: true. */
  requireOwners: boolean;
  /** Active entities must have a non-empty summary. Default: true. */
  requireSummary: boolean;
  /** Active entities should have at least one relation. Default: false. */
  requireRelations: boolean;
  /** Active system/delivery entities should have anchors. Default: false. */
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
  /** Regex pattern(s) to extract entity IDs from test files. */
  requirementPattern?: string | string[];
}

/**
 * Current Anchored Spec configuration.
 */
export interface AnchoredSpecConfigV1 {
  /** Config format version. Must be "1.0". */
  schemaVersion: "1.0";

  /** Root directory for EA entities. Default: "docs". */
  rootDir: string;

  /** Directory for generated output files. Default: "ea/generated". */
  generatedDir: string;

  /** Optional organizational prefix for entity IDs (e.g., "acme"). */
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

  /** Source file annotation scanning configuration. */
  sourceAnnotations?: {
    enabled?: boolean;
    sourceRoots?: string[];
    sourceGlobs?: string[];
  };

  /** Version compatibility policy enforcement configuration. */
  versionPolicy?: {
    defaultCompatibility?: "backward-only" | "full" | "breaking-allowed" | "frozen";
    perSchema?: Record<string, { compatibility?: "backward-only" | "full" | "breaking-allowed" | "frozen"; deprecationWindow?: string }>;
    perDomain?: Record<string, { compatibility?: "backward-only" | "full" | "breaking-allowed" | "frozen"; deprecationWindow?: string }>;
  };

  /** Plugin module paths. */
  plugins?: string[];

  /** Glob patterns for files to exclude from entity loading. */
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

  /**
   * Entity storage mode.
   * - `"manifest"` — single or multi-doc Backstage YAML catalog file
   * - `"inline"`   — Backstage YAML frontmatter in markdown docs
   */
  entityMode?: "manifest" | "inline";

  /**
   * Path to the manifest file (relative to project root).
   * Only used when `entityMode` is `"manifest"`.
   * Default: `"catalog-info.yaml"`.
   */
  manifestPath?: string;

  /**
   * Directory containing individual Backstage entity YAML files.
   * Only used when `entityMode` is `"manifest"` and entities are
   * split across multiple catalog files.
   * Default: `"catalog"`.
   */
  catalogDir?: string;

  /**
   * Directories containing markdown docs with Backstage YAML frontmatter.
   * Only used when `entityMode` is `"inline"`.
   * Default: `["docs"]`.
   */
  inlineDocDirs?: string[];
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
    entityMode: "manifest",
    manifestPath: "catalog-info.yaml",
  };
}

/**
 * Resolve a complete v1.0 config from a partial user-provided config.
 */
export function resolveConfigV1(
  partial?: Partial<AnchoredSpecConfigV1> | null
): AnchoredSpecConfigV1 {
  const rootDir = partial?.rootDir ?? "docs";
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
    sourceAnnotations: partial.sourceAnnotations,
    versionPolicy: partial.versionPolicy,
    plugins: partial.plugins,
    exclude: partial.exclude,
    driftResolvers: partial.driftResolvers,
    hooks: partial.hooks,
    testMetadata: partial.testMetadata,
    workflowPolicyPath: partial.workflowPolicyPath ?? defaults.workflowPolicyPath,
    customChangeTypes: partial.customChangeTypes,
    entityMode: partial.entityMode ?? defaults.entityMode,
    manifestPath: partial.manifestPath ?? defaults.manifestPath,
    catalogDir: partial.catalogDir,
    inlineDocDirs: partial.inlineDocDirs,
  };
}
