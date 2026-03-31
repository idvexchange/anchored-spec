/**
 * Anchored Spec — EA Resolvers
 *
 * Barrel exports for the resolver framework and built-in resolvers.
 */

// Resolver types
export type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
  ObservedRelationship,
  ResolverLogger,
} from "./types.js";
export { consoleLogger, silentLogger } from "./types.js";

// OpenAPI Resolver
export type { OpenApiSpec } from "./openapi.js";
export {
  OpenApiResolver,
  findOpenApiFiles,
  loadOpenApiSpec,
  hasEndpoint,
  extractAllEndpoints,
  parseSimpleYaml,
} from "./openapi.js";

// Kubernetes Resolver
export type { K8sManifest } from "./kubernetes.js";
export {
  KubernetesResolver,
  findK8sFiles,
  loadK8sManifests,
  k8sResourceId,
  extractImages,
  extractReplicas,
} from "./kubernetes.js";

// Terraform Resolver
export type { TerraformState, TerraformModule, TerraformResource } from "./terraform.js";
export {
  TerraformResolver,
  findTerraformStateFiles,
  loadTerraformState,
  flattenResources,
} from "./terraform.js";

// SQL DDL Resolver
export type { ParsedTable, ParsedColumn } from "./sql-ddl.js";
export {
  SqlDdlResolver,
  parseDdl,
  findSqlFiles,
  loadSqlTables,
} from "./sql-ddl.js";

// dbt Resolver
export type { DbtManifest, DbtNode, DbtSource, DbtExposure } from "./dbt.js";
export {
  DbtResolver,
  findDbtManifests,
  loadDbtManifest,
  extractModels,
  extractTests,
  extractSources,
  extractExposures,
} from "./dbt.js";

// Anchors Resolver (code-symbol scanning)
export type { AnchorMatch, AnchorScanResult } from "./anchors.js";
export { AnchorsResolver, scanAnchors } from "./anchors.js";

// Markdown Resolver
export { MarkdownResolver, extractFactsFromDocs } from "./markdown.js";

// Config-driven resolver loader
export type { LoadedResolver } from "./loader.js";
export { loadResolver, loadResolversFromConfig } from "./loader.js";

// Tree-sitter Discovery Resolver (language-agnostic code analysis)
export {
  TreeSitterDiscoveryResolver,
  resetTreeSitterCache,
  aggregateMatches,
  getQueryPacks,
  builtinPacks,
} from "./tree-sitter/index.js";
export type {
  QueryPack,
  QueryPattern,
  CaptureMapping,
  QueryMatch,
  PackRegistry,
} from "./tree-sitter/index.js";
