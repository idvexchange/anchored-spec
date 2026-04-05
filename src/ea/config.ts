/**
 * Anchored Spec — EA Configuration
 *
 * Supports configuration schema versions 1.0, 1.1, and 1.2.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EA_DOMAINS, type BuiltInEaDomain } from "./types.js";

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

export type AnchoredSpecSchemaVersion = "1.0" | "1.1" | "1.2";
export type DocsStructureProfile =
  | "legacy-domain"
  | "architecture-views"
  | "custom"
  | (string & {});

export type CatalogBootstrapProfile =
  | "auto"
  | "library"
  | "cli"
  | "service"
  | "webapp"
  | "workspace"
  | (string & {});

export type CatalogBootstrapOutputMode =
  | "curated"
  | "expanded";

export type DocSectionKind =
  | "architecture"
  | "decision-record"
  | "requirement"
  | "guide"
  | (string & {});

export interface AnchoredSpecDocsSection {
  id: string;
  title: string;
  path: string;
  kind: DocSectionKind;
  domains?: string[];
}

export interface AnchoredSpecDocsConfig {
  structure: DocsStructureProfile;
  scanDirs: string[];
  rootDocs: string[];
  sections: AnchoredSpecDocsSection[];
  templates: Record<string, string>;
}

export interface CatalogBootstrapIncludeConfig {
  owners?: boolean;
  domain?: boolean;
  system?: boolean;
  components?: boolean;
  apis?: boolean;
  capabilities?: boolean;
  requirements?: boolean;
  decisions?: boolean;
  resources?: boolean;
}

export interface CatalogBootstrapDefaultsConfig {
  ownerRef?: string;
  ownerKind?: string;
  ownerType?: string;
  ownerUnitType?: string;
  componentLifecycle?: string;
  apiLifecycle?: string;
  capabilityLevel?: number;
}

export interface CatalogBootstrapEvidenceSourceConfig {
  type: string;
  enabled?: boolean;
  weight?: number;
}

export interface CatalogBootstrapMappingsConfig {
  docs?: {
    decisionSections?: string[];
    requirementSections?: string[];
    capabilitySections?: string[];
    apiSections?: string[];
    componentSections?: string[];
  };
  archetypes?: {
    cliSignals?: string[];
    librarySignals?: string[];
    serviceSignals?: string[];
    webappSignals?: string[];
  };
  entityKinds?: {
    owner?: string;
    topLevelRuntime?: string;
    publicApi?: string;
    businessCapability?: string;
    decisionRecord?: string;
    requirementRecord?: string;
  };
}

export interface CatalogBootstrapNamingConfig {
  systemFromPackageName?: boolean;
  stripPrefixes?: string[];
  stripSuffixes?: string[];
  componentSuffixes?: Record<string, string>;
}

export interface CatalogBootstrapConfig {
  enabled?: boolean;
  profile?: CatalogBootstrapProfile;
  outputMode?: CatalogBootstrapOutputMode;
  writeTarget?: string;
  minConfidence?: number;
  maxTopLevelComponents?: number;
  include?: CatalogBootstrapIncludeConfig;
  defaults?: CatalogBootstrapDefaultsConfig;
  evidence?: {
    sources?: CatalogBootstrapEvidenceSourceConfig[];
  };
  mappings?: CatalogBootstrapMappingsConfig;
  naming?: CatalogBootstrapNamingConfig;
}

export interface AnchoredSpecCatalogConfig {
  bootstrap?: CatalogBootstrapConfig;
}

interface AnchoredSpecConfigBase {
  /** Root directory for EA docs and outputs. Default: "docs". */
  rootDir: string;

  /** Directory for generated output files. Default: "docs/generated". */
  generatedDir: string;

  /** Optional organizational prefix for entity IDs (e.g., "acme"). */
  idPrefix?: string | null;

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

  /** Path to workflow policy file. Default: "<rootDir>/workflow-policy.yaml". */
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

export interface AnchoredSpecConfigV1_0 extends AnchoredSpecConfigBase {
  /** Config format version. Must be "1.0". */
  schemaVersion: "1.0";

  /** Per-domain subdirectory paths. */
  domains: Record<BuiltInEaDomain, string>;
}

export interface AnchoredSpecConfigV1_1 extends AnchoredSpecConfigBase {
  /** Config format version. Must be "1.1". */
  schemaVersion: "1.1";

  /** Semantic domain labels. */
  domains: string[];

  /** Physical docs structure configuration. */
  docs: AnchoredSpecDocsConfig;
}

export interface AnchoredSpecConfigV1_2 extends AnchoredSpecConfigBase {
  /** Config format version. Must be "1.2". */
  schemaVersion: "1.2";

  /** Semantic domain labels. */
  domains: string[];

  /** Physical docs structure configuration. */
  docs: AnchoredSpecDocsConfig;

  /** Catalog synthesis configuration. */
  catalog: AnchoredSpecCatalogConfig;
}

/**
 * Historical export name retained for compatibility.
 * Represents the effective config for either v1.0 or v1.1.
 */
export type AnchoredSpecConfigV1 =
  | AnchoredSpecConfigV1_0
  | AnchoredSpecConfigV1_1
  | AnchoredSpecConfigV1_2;

const CONFIG_FILE = ".anchored-spec/config.json";

const ARCHITECTURE_VIEW_ROOT_DOC_NAMES = [
  "README.md",
  "glossary.md",
  "delivery-baseline.md",
  "mobilization.md",
  "current-vs-target.md",
  "readiness-checklist.md",
] as const;

const CUSTOM_ROOT_DOC_NAMES = ["README.md"] as const;

function toRootDocs(rootDir: string, names: readonly string[]): string[] {
  return names.map((name) => `${rootDir}/${name}`);
}

function buildLegacyDomainSections(rootDir: string): AnchoredSpecDocsSection[] {
  return EA_DOMAINS.map((domain) => ({
    id: domain,
    title: titleCase(domain),
    path: `${rootDir}/${domain}`,
    kind: "architecture",
    domains: [domain],
  }));
}

function buildArchitectureViewSections(rootDir: string): AnchoredSpecDocsSection[] {
  return [
    {
      id: "business",
      title: "Business",
      path: `${rootDir}/01-business`,
      kind: "architecture",
      domains: ["business"],
    },
    {
      id: "system-context",
      title: "System Context",
      path: `${rootDir}/02-system-context`,
      kind: "architecture",
      domains: ["systems"],
    },
    {
      id: "container",
      title: "Container",
      path: `${rootDir}/03-container`,
      kind: "architecture",
      domains: ["systems"],
    },
    {
      id: "component",
      title: "Component",
      path: `${rootDir}/04-component`,
      kind: "architecture",
      domains: ["systems"],
    },
    {
      id: "domain",
      title: "Domain",
      path: `${rootDir}/05-domain`,
      kind: "architecture",
      domains: ["business", "information"],
    },
    {
      id: "api",
      title: "API",
      path: `${rootDir}/06-api`,
      kind: "architecture",
      domains: ["systems", "transitions"],
    },
    {
      id: "data",
      title: "Data",
      path: `${rootDir}/07-data`,
      kind: "architecture",
      domains: ["data"],
    },
    {
      id: "security",
      title: "Security",
      path: `${rootDir}/08-security`,
      kind: "architecture",
      domains: ["systems"],
    },
    {
      id: "infrastructure",
      title: "Infrastructure",
      path: `${rootDir}/09-infrastructure`,
      kind: "architecture",
      domains: ["delivery", "systems"],
    },
    {
      id: "testing",
      title: "Testing",
      path: `${rootDir}/10-testing`,
      kind: "architecture",
      domains: ["delivery"],
    },
    {
      id: "adr",
      title: "Architecture Decision Records",
      path: `${rootDir}/adr`,
      kind: "decision-record",
    },
    {
      id: "req",
      title: "Requirements",
      path: `${rootDir}/req`,
      kind: "requirement",
    },
    {
      id: "user-guides",
      title: "User Guides",
      path: `${rootDir}/guides/user-guides`,
      kind: "guide",
    },
    {
      id: "developer-guides",
      title: "Developer Guides",
      path: `${rootDir}/guides/developer-guides`,
      kind: "guide",
    },
  ];
}

function buildDocsDefaults(
  rootDir: string,
  structure: DocsStructureProfile,
): AnchoredSpecDocsConfig {
  switch (structure) {
    case "legacy-domain":
      return {
        structure,
        scanDirs: [rootDir],
        rootDocs: toRootDocs(rootDir, CUSTOM_ROOT_DOC_NAMES),
        sections: buildLegacyDomainSections(rootDir),
        templates: {
          spec: "systems",
          architecture: "systems",
          guide: "delivery",
          adr: "transitions",
          runbook: "delivery",
        },
      };
    case "custom":
      return {
        structure,
        scanDirs: [rootDir],
        rootDocs: toRootDocs(rootDir, CUSTOM_ROOT_DOC_NAMES),
        sections: [],
        templates: {},
      };
    case "architecture-views":
    default:
      return {
        structure: structure ?? "architecture-views",
        scanDirs: [rootDir],
        rootDocs: toRootDocs(rootDir, ARCHITECTURE_VIEW_ROOT_DOC_NAMES),
        sections: buildArchitectureViewSections(rootDir),
        templates: {
          spec: "api",
          architecture: "component",
          guide: "user-guides",
          adr: "adr",
          runbook: "developer-guides",
        },
      };
  }
}

// ─── Defaults & Resolution ─────────────────────────────────────────────────────

function buildV1Defaults(rootDir: string): AnchoredSpecConfigV1_0 {
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

function buildV11Defaults(
  rootDir: string,
  structure: DocsStructureProfile,
): AnchoredSpecConfigV1_1 {
  return {
    schemaVersion: "1.1",
    rootDir,
    generatedDir: `${rootDir}/generated`,
    idPrefix: null,
    domains: [...EA_DOMAINS],
    docs: buildDocsDefaults(rootDir, structure),
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

function buildCatalogBootstrapDefaults(
  manifestPath: string,
): CatalogBootstrapConfig {
  return {
    enabled: true,
    profile: "auto",
    outputMode: "curated",
    writeTarget: manifestPath,
    minConfidence: 0.6,
    maxTopLevelComponents: 8,
    include: {
      owners: true,
      domain: true,
      system: true,
      components: true,
      apis: true,
      capabilities: true,
      requirements: true,
      decisions: true,
      resources: false,
    },
    defaults: {
      ownerRef: "group:default/maintainers",
      ownerKind: "Group",
      ownerType: "team",
      ownerUnitType: "team",
      componentLifecycle: "production",
      apiLifecycle: "production",
      capabilityLevel: 1,
    },
    evidence: {
      sources: [
        { type: "package-json", enabled: true, weight: 1.0 },
        { type: "exports", enabled: true, weight: 0.9 },
        { type: "cli-commands", enabled: true, weight: 0.9 },
        { type: "docs", enabled: true, weight: 1.0 },
        { type: "discovery", enabled: true, weight: 0.7 },
        { type: "git", enabled: false, weight: 0.3 },
      ],
    },
    mappings: {
      docs: {
        decisionSections: ["decision-record"],
        requirementSections: ["requirement"],
        capabilitySections: ["architecture"],
        apiSections: ["architecture"],
        componentSections: ["architecture"],
      },
      archetypes: {
        cliSignals: ["bin", "src/cli", "commands"],
        librarySignals: ["exports", "src/index", "src/lib", "src/ea"],
        serviceSignals: ["Dockerfile", "server", "app", "api"],
        webappSignals: ["next.config", "vite.config", "src/routes", "src/app"],
      },
      entityKinds: {
        owner: "Group",
        topLevelRuntime: "Component",
        publicApi: "API",
        businessCapability: "Capability",
        decisionRecord: "Decision",
        requirementRecord: "Requirement",
      },
    },
    naming: {
      systemFromPackageName: true,
      stripPrefixes: [],
      stripSuffixes: [],
      componentSuffixes: {
        cli: "cli",
        runtime: "runtime",
        api: "api",
      },
    },
  };
}

function mergeCatalogBootstrapConfig(
  partial: CatalogBootstrapConfig | undefined,
  manifestPath: string,
): CatalogBootstrapConfig {
  const defaults = buildCatalogBootstrapDefaults(manifestPath);
  return {
    ...defaults,
    ...partial,
    include: { ...defaults.include, ...(partial?.include ?? {}) },
    defaults: { ...defaults.defaults, ...(partial?.defaults ?? {}) },
    evidence: {
      ...defaults.evidence,
      ...partial?.evidence,
      sources: partial?.evidence?.sources ?? defaults.evidence?.sources ?? [],
    },
    mappings: {
      ...defaults.mappings,
      ...partial?.mappings,
      docs: { ...defaults.mappings?.docs, ...(partial?.mappings?.docs ?? {}) },
      archetypes: {
        ...defaults.mappings?.archetypes,
        ...(partial?.mappings?.archetypes ?? {}),
      },
      entityKinds: {
        ...defaults.mappings?.entityKinds,
        ...(partial?.mappings?.entityKinds ?? {}),
      },
    },
    naming: {
      ...defaults.naming,
      ...(partial?.naming ?? {}),
      componentSuffixes: {
        ...defaults.naming?.componentSuffixes,
        ...(partial?.naming?.componentSuffixes ?? {}),
      },
    },
  };
}

function buildV12Defaults(
  rootDir: string,
  structure: DocsStructureProfile,
): AnchoredSpecConfigV1_2 {
  const manifestPath = "catalog-info.yaml";
  return {
    schemaVersion: "1.2",
    rootDir,
    generatedDir: `${rootDir}/generated`,
    idPrefix: null,
    domains: [...EA_DOMAINS],
    docs: buildDocsDefaults(rootDir, structure),
    catalog: {
      bootstrap: buildCatalogBootstrapDefaults(manifestPath),
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
    manifestPath,
  };
}

function mergeDocsConfig(
  rootDir: string,
  partial: Partial<AnchoredSpecDocsConfig> | undefined,
): AnchoredSpecDocsConfig {
  const structure = partial?.structure ?? "architecture-views";
  const defaults = buildDocsDefaults(rootDir, structure);

  return {
    structure,
    scanDirs: partial?.scanDirs ?? defaults.scanDirs,
    rootDocs: partial?.rootDocs ?? defaults.rootDocs,
    sections: partial?.sections ?? defaults.sections,
    templates: { ...defaults.templates, ...(partial?.templates ?? {}) },
  };
}

/**
 * Resolve a complete config from a partial user-provided config.
 */
export function resolveConfigV1(
  partial?: Partial<AnchoredSpecConfigV1> | null,
): AnchoredSpecConfigV1 {
  const inferredVersion: AnchoredSpecSchemaVersion =
    partial?.schemaVersion === "1.2" ||
    "catalog" in (partial ?? {})
      ? "1.2"
      :
    partial?.schemaVersion === "1.1" ||
    Array.isArray((partial as { domains?: unknown } | undefined)?.domains) ||
    "docs" in (partial ?? {})
      ? "1.1"
      : "1.0";

  const rootDir = partial?.rootDir ?? "docs";

  if (inferredVersion === "1.2") {
    const typedPartial = (partial ?? {}) as Partial<AnchoredSpecConfigV1_2>;
    const defaults = buildV12Defaults(
      rootDir,
      typedPartial.docs?.structure ?? "architecture-views",
    );
    const manifestPath = typedPartial.manifestPath ?? defaults.manifestPath ?? "catalog-info.yaml";

    return {
      schemaVersion: "1.2",
      rootDir,
      generatedDir: typedPartial.generatedDir ?? defaults.generatedDir,
      idPrefix: typedPartial.idPrefix ?? defaults.idPrefix,
      domains: typedPartial.domains ?? defaults.domains,
      docs: mergeDocsConfig(rootDir, typedPartial.docs),
      catalog: {
        bootstrap: mergeCatalogBootstrapConfig(
          typedPartial.catalog?.bootstrap,
          manifestPath,
        ),
      },
      resolvers: typedPartial.resolvers ?? defaults.resolvers,
      generators: typedPartial.generators ?? defaults.generators,
      evidenceSources: typedPartial.evidenceSources ?? defaults.evidenceSources,
      cache: { ...defaults.cache, ...typedPartial.cache },
      quality: { ...defaults.quality, ...typedPartial.quality },
      sourceRoots: typedPartial.sourceRoots,
      sourceGlobs: typedPartial.sourceGlobs,
      sourceAnnotations: typedPartial.sourceAnnotations,
      versionPolicy: typedPartial.versionPolicy,
      plugins: typedPartial.plugins,
      exclude: typedPartial.exclude,
      driftResolvers: typedPartial.driftResolvers,
      hooks: typedPartial.hooks,
      testMetadata: typedPartial.testMetadata,
      workflowPolicyPath:
        typedPartial.workflowPolicyPath ?? defaults.workflowPolicyPath,
      customChangeTypes: typedPartial.customChangeTypes,
      entityMode: typedPartial.entityMode ?? defaults.entityMode,
      manifestPath,
      catalogDir: typedPartial.catalogDir,
      inlineDocDirs: typedPartial.inlineDocDirs,
    };
  }

  if (inferredVersion === "1.1") {
    const typedPartial = (partial ?? {}) as Partial<AnchoredSpecConfigV1_1>;
    const defaults = buildV11Defaults(
      rootDir,
      typedPartial.docs?.structure ?? "architecture-views",
    );

    return {
      schemaVersion: "1.1",
      rootDir,
      generatedDir: typedPartial.generatedDir ?? defaults.generatedDir,
      idPrefix: typedPartial.idPrefix ?? defaults.idPrefix,
      domains: typedPartial.domains ?? defaults.domains,
      docs: mergeDocsConfig(rootDir, typedPartial.docs),
      resolvers: typedPartial.resolvers ?? defaults.resolvers,
      generators: typedPartial.generators ?? defaults.generators,
      evidenceSources: typedPartial.evidenceSources ?? defaults.evidenceSources,
      cache: { ...defaults.cache, ...typedPartial.cache },
      quality: { ...defaults.quality, ...typedPartial.quality },
      sourceRoots: typedPartial.sourceRoots,
      sourceGlobs: typedPartial.sourceGlobs,
      sourceAnnotations: typedPartial.sourceAnnotations,
      versionPolicy: typedPartial.versionPolicy,
      plugins: typedPartial.plugins,
      exclude: typedPartial.exclude,
      driftResolvers: typedPartial.driftResolvers,
      hooks: typedPartial.hooks,
      testMetadata: typedPartial.testMetadata,
      workflowPolicyPath:
        typedPartial.workflowPolicyPath ?? defaults.workflowPolicyPath,
      customChangeTypes: typedPartial.customChangeTypes,
      entityMode: typedPartial.entityMode ?? defaults.entityMode,
      manifestPath: typedPartial.manifestPath ?? defaults.manifestPath,
      catalogDir: typedPartial.catalogDir,
      inlineDocDirs: typedPartial.inlineDocDirs,
    };
  }

  const typedPartial = (partial ?? {}) as Partial<AnchoredSpecConfigV1_0>;
  const defaults = buildV1Defaults(rootDir);

  return {
    schemaVersion: "1.0",
    rootDir,
    generatedDir: typedPartial.generatedDir ?? defaults.generatedDir,
    idPrefix: typedPartial.idPrefix ?? defaults.idPrefix,
    domains: { ...defaults.domains, ...typedPartial.domains },
    resolvers: typedPartial.resolvers ?? defaults.resolvers,
    generators: typedPartial.generators ?? defaults.generators,
    evidenceSources: typedPartial.evidenceSources ?? defaults.evidenceSources,
    cache: { ...defaults.cache, ...typedPartial.cache },
    quality: { ...defaults.quality, ...typedPartial.quality },
    sourceRoots: typedPartial.sourceRoots,
    sourceGlobs: typedPartial.sourceGlobs,
    sourceAnnotations: typedPartial.sourceAnnotations,
    versionPolicy: typedPartial.versionPolicy,
    plugins: typedPartial.plugins,
    exclude: typedPartial.exclude,
    driftResolvers: typedPartial.driftResolvers,
    hooks: typedPartial.hooks,
    testMetadata: typedPartial.testMetadata,
    workflowPolicyPath:
      typedPartial.workflowPolicyPath ?? defaults.workflowPolicyPath,
    customChangeTypes: typedPartial.customChangeTypes,
    entityMode: typedPartial.entityMode ?? defaults.entityMode,
    manifestPath: typedPartial.manifestPath ?? defaults.manifestPath,
    catalogDir: typedPartial.catalogDir,
    inlineDocDirs: typedPartial.inlineDocDirs,
  };
}

export function loadProjectConfig(
  projectRoot: string,
  rootDirFallback = "docs",
): AnchoredSpecConfigV1 {
  const configPath = join(resolve(projectRoot), CONFIG_FILE);
  if (!existsSync(configPath)) {
    return resolveConfigV1({ rootDir: rootDirFallback });
  }

  const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<AnchoredSpecConfigV1>;
  return resolveConfigV1(raw);
}

export function isConfigV11(
  config: AnchoredSpecConfigV1,
): config is AnchoredSpecConfigV1_1 | AnchoredSpecConfigV1_2 {
  return config.schemaVersion === "1.1" || config.schemaVersion === "1.2";
}

export function isConfigV12(
  config: AnchoredSpecConfigV1,
): config is AnchoredSpecConfigV1_2 {
  return config.schemaVersion === "1.2";
}

export function getConfiguredDomains(config: AnchoredSpecConfigV1): string[] {
  return isConfigV11(config) ? config.domains : Object.keys(config.domains);
}

export function getConfiguredDocScanDirs(config: AnchoredSpecConfigV1): string[] | undefined {
  return isConfigV11(config) ? config.docs.scanDirs : undefined;
}

export function getConfiguredDocSections(
  config: AnchoredSpecConfigV1,
): AnchoredSpecDocsSection[] {
  return isConfigV11(config) ? config.docs.sections : [];
}

export function getConfiguredRootDocs(config: AnchoredSpecConfigV1): string[] {
  return isConfigV11(config) ? config.docs.rootDocs : [];
}

export function findDocSection(
  config: AnchoredSpecConfigV1,
  sectionId: string,
): AnchoredSpecDocsSection | undefined {
  return getConfiguredDocSections(config).find((section) => section.id === sectionId);
}

export function getDefaultSectionForDocType(
  config: AnchoredSpecConfigV1,
  docType: string,
): string | undefined {
  return isConfigV11(config) ? config.docs.templates[docType] : undefined;
}

export function resolveDocOutputTarget(
  config: AnchoredSpecConfigV1,
  options: {
    dir?: string;
    section?: string;
    docType?: string;
  },
): { dir: string; sectionId?: string } | null {
  if (options.dir) {
    return { dir: options.dir };
  }

  const requestedSection = options.section ?? (options.docType ? getDefaultSectionForDocType(config, options.docType) : undefined);
  if (!requestedSection) {
    return null;
  }

  const section = findDocSection(config, requestedSection);
  if (!section) {
    return null;
  }

  return {
    dir: section.path,
    sectionId: section.id,
  };
}

export function getVerificationSearchDirs(config: AnchoredSpecConfigV1): string[] {
  if (isConfigV11(config)) {
    const explicit = findDocSection(config, "transitions");
    return [explicit?.path ?? `${config.rootDir}/transitions`];
  }

  return [config.domains.transitions];
}

export function getCatalogBootstrapConfig(
  config: AnchoredSpecConfigV1,
): CatalogBootstrapConfig {
  if (isConfigV12(config)) {
    return mergeCatalogBootstrapConfig(
      config.catalog?.bootstrap,
      config.manifestPath ?? "catalog-info.yaml",
    );
  }

  return buildCatalogBootstrapDefaults(config.manifestPath ?? "catalog-info.yaml");
}

function titleCase(value: string): string {
  return value
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
