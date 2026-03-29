/**
 * Anchored Spec — EA Module
 *
 * Public API for the enterprise architecture extension.
 */

// Types
export type {
  EaDomain,
  ArtifactStatus,
  ArtifactConfidence,
  EaAnchors,
  EaRelation,
  EaTraceRef,
  EaRiskAssessment,
  EaComplianceMetadata,
  EaArtifactBase,
  ApplicationArtifact,
  ServiceArtifact,
  ApiContractArtifact,
  EventContractArtifact,
  IntegrationArtifact,
  SystemInterfaceArtifact,
  ConsumerArtifact,
  PlatformArtifact,
  DeploymentArtifact,
  RuntimeClusterArtifact,
  NetworkZoneArtifact,
  IdentityBoundaryArtifact,
  CloudResourceArtifact,
  EnvironmentArtifact,
  TechnologyStandardArtifact,
  LogicalDataModelArtifact,
  PhysicalSchemaArtifact,
  DataStoreArtifact,
  LineageArtifact,
  MasterDataDomainArtifact,
  DataQualityRuleArtifact,
  DataProductArtifact,
  InformationConceptArtifact,
  CanonicalEntityArtifact,
  InformationExchangeArtifact,
  ClassificationArtifact,
  RetentionPolicyArtifact,
  GlossaryTermArtifact,
  MissionArtifact,
  CapabilityArtifact,
  ValueStreamArtifact,
  ProcessArtifact,
  OrgUnitArtifact,
  PolicyObjectiveArtifact,
  BusinessServiceArtifact,
  ControlArtifact,
  BaselineArtifact,
  TargetArtifact,
  TransitionPlanArtifact,
  TransitionMilestone,
  TransitionRisk,
  MigrationWaveArtifact,
  ExceptionArtifact,
  RequirementArtifact,
  ChangeArtifact,
  DecisionArtifact,
  EaBehaviorStatement,
  EaArtifact,
  EaKindEntry,
} from "./types.js";

// Values — kind registry and helpers
export {
  EA_DOMAINS,
  EA_KIND_REGISTRY,
  getKindEntry,
  getKindsByDomain,
  getKindPrefix,
  getDomainForKind,
  isValidEaId,
} from "./types.js";

// Config
export type {
  EaConfig,
  EaResolverConfig,
  EaGeneratorConfig,
  EaQualityConfig,
  EaCacheConfig,
} from "./config.js";

export { resolveEaConfig } from "./config.js";

// Validation
export type { EaSchemaName, EaValidationError, EaValidationResult, EaValidationOptions } from "./validate.js";
export { validateEaSchema, validateEaArtifacts, validateEaRelations, getSchemaForKind, getEaSchemaNames } from "./validate.js";

// Loader
export type { EaLoadedArtifact, EaLoadResult, EaSummary } from "./loader.js";
export { EaRoot, normalizeArtifact } from "./loader.js";

// Relation Registry
export type { RelationRegistryEntry } from "./relation-registry.js";
export { RelationRegistry, createDefaultRegistry } from "./relation-registry.js";

// Graph
export type { GraphNode, GraphEdge, MermaidOptions, DotOptions } from "./graph.js";
export { RelationGraph, buildRelationGraph } from "./graph.js";

// Impact Analysis
export type { ImpactedArtifact, ImpactDomainSummary, ImpactReport } from "./impact.js";
export { analyzeImpact, renderImpactReportMarkdown } from "./impact.js";

// Drift
export type { EaDriftContext, EaDriftRule, EaDriftResult, EaDriftFinding, DomainDriftSummary, EaDriftReport, EaDriftOptions, EaResolverObservedState } from "./drift.js";
export { EA_DRIFT_RULES, evaluateEaDrift, detectEaDrift } from "./drift.js";

// Reports
export type { SystemDataCell, SystemDataMatrixReport, ClassifiedEntity, ClassificationStore, ClassificationCoverageEntry, ClassificationCoverageReport, CapabilityMapNode, CapabilityMapMission, CapabilityMapReport, GapNewWorkItem, GapRetirementItem, GapMilestoneStatus, GapSuccessMetric, GapAnalysisReport, ExceptionStatus, ExceptionReportEntry, ExceptionReport, ReportIndexEntry, ReportIndex, ReportView, DriftHeatmapReport } from "./report.js";
export { buildSystemDataMatrix, renderSystemDataMatrixMarkdown, buildClassificationCoverage, renderClassificationCoverageMarkdown, buildCapabilityMap, renderCapabilityMapMarkdown, buildGapAnalysis, renderGapAnalysisMarkdown, buildExceptionReport, renderExceptionReportMarkdown, REPORT_VIEWS, buildReportIndex, buildDriftHeatmap, renderDriftHeatmapMarkdown } from "./report.js";

// Evidence
export type { EaEvidenceKind, EaEvidenceRecord, EaEvidence, EaEvidenceValidationError, EaEvidenceSummary } from "./evidence.js";
export { EA_EVIDENCE_KINDS, createEaEvidenceRecord, loadEaEvidence, writeEaEvidence, mergeEaEvidence, validateEaEvidence, summarizeEaEvidence } from "./evidence.js";

// Discovery
export type { EaArtifactDraft, DiscoveryMatch, DiscoverySuggestedUpdate, DiscoveryReport, DiscoveryOptions, DiscoveryResolver } from "./discovery.js";
export { matchDraftToExisting, discoverArtifacts, createDraft, renderDiscoveryReportMarkdown, stubResolver } from "./discovery.js";

// Cache
export type { ResolverCache, CacheEntry, CacheStats } from "./cache.js";
export { DiskResolverCache, NoOpCache, createResolverCache, DEFAULT_CACHE_DIR, DEFAULT_TTL_SECONDS } from "./cache.js";

// Resolvers
export type { EaResolver, EaResolverContext, EaAnchorResolution, ObservedEaState, ObservedEntity, ObservedRelationship, ResolverLogger, OpenApiSpec, K8sManifest, TerraformState, TerraformModule, TerraformResource, ParsedTable, ParsedColumn, DbtManifest, DbtNode, DbtSource, DbtExposure } from "./resolvers/index.js";
export { OpenApiResolver, findOpenApiFiles, loadOpenApiSpec, hasEndpoint, extractAllEndpoints, parseSimpleYaml, consoleLogger, silentLogger, KubernetesResolver, findK8sFiles, loadK8sManifests, k8sResourceId, extractImages, extractReplicas, TerraformResolver, findTerraformStateFiles, loadTerraformState, flattenResources, SqlDdlResolver, parseDdl, findSqlFiles, loadSqlTables, DbtResolver, findDbtManifests, loadDbtManifest, extractModels, extractTests, extractSources, extractExposures } from "./resolvers/index.js";

// Generators
export type { EaGenerator, EaGeneratorContext, GeneratedOutput, GenerationDrift, GeneratorConfig, EaGeneratorOptions, GenerationReport } from "./generators/index.js";
export { runGenerators, renderGenerationReportMarkdown, registerGenerator, getGenerator, listGenerators, resolveGenerators, openapiGenerator, jsonSchemaGenerator } from "./generators/index.js";

// Migration
export type { MigrationOptions, MigratedArtifact, MigrationResult } from "./migrate-legacy.js";
export { migrateLegacyArtifacts, migrateRequirement, migrateChange, migrateDecision, mapSemanticRefsToAnchors, renderMigrationReportMarkdown } from "./migrate-legacy.js";
