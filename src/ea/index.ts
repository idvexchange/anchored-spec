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
  TransitionMilestone,
  TransitionRisk,
  EaBehaviorStatement,
} from "./types.js";

// Values — kind registry and helpers
export {
  EA_DOMAINS,
} from "./types.js";

// Config
export type {
  EaResolverConfig,
  EaGeneratorConfig,
  EaQualityConfig,
  EaCacheConfig,
  AnchoredSpecConfigV1,
  EaHookEvent,
  EaHookDefinition,
  EaTestMetadataConfig,
} from "./config.js";

export {
  resolveConfigV1,
} from "./config.js";

// Validation
export type { EaSchemaName, EaValidationError, EaValidationResult, EaValidationOptions } from "./validate.js";
export { validateEaSchema, validateEaArtifacts, validateEaRelations, getSchemaForKind, getEaSchemaNames } from "./validate.js";

// Loader
export type { EaLoadedEntity, EaEntityLoadResult, EaEntitySummary } from "./loader.js";
export { EaRoot } from "./loader.js";

// Relation Registry
export type { RelationRegistryEntry, TraversalProfileName, TraversalProfile } from "./relation-registry.js";
export { RelationRegistry, createDefaultRegistry, TRAVERSAL_PROFILES, getTraversalProfile } from "./relation-registry.js";

// Graph
export type { GraphNode, GraphEdge, MermaidOptions, DotOptions, GraphPath, TraversalDirection, TraverseWithPathsOptions } from "./graph.js";
export { RelationGraph, buildRelationGraph } from "./graph.js";

// Impact Analysis
export type { ImpactedEntity, ImpactedArtifact, ImpactDomainSummary, ImpactCategorySummary, ImpactReport, ImpactCategory, ScoreBreakdown, ScoringWeights, ImpactOptions } from "./impact.js";
export { analyzeImpact, renderImpactReportMarkdown, DEFAULT_SCORING_WEIGHTS } from "./impact.js";

// Drift
export type { EaDriftContext, EaDriftRule, EaDriftResult, EaDriftFinding, DomainDriftSummary, EaDriftReport, EaDriftOptions, EaResolverObservedState } from "./drift.js";
export { EA_DRIFT_RULES, evaluateEaDrift, detectEaDrift } from "./drift.js";

// Reports
export type { SystemDataCell, SystemDataMatrixReport, ClassifiedEntity, ClassificationStore, ClassificationCoverageEntry, ClassificationCoverageReport, CapabilityMapNode, CapabilityMapMission, CapabilityMapReport, GapNewWorkItem, GapRetirementItem, GapMilestoneStatus, GapSuccessMetric, GapAnalysisReport, ExceptionStatus, ExceptionReportEntry, ExceptionReport, ReportIndexEntry, ReportIndex, ReportView, DriftHeatmapReport, TraceabilityIndexEntry, TraceabilityDocumentGroup, TraceabilityIndexReport } from "./report.js";
export { buildSystemDataMatrix, renderSystemDataMatrixMarkdown, buildClassificationCoverage, renderClassificationCoverageMarkdown, buildCapabilityMap, renderCapabilityMapMarkdown, buildGapAnalysis, renderGapAnalysisMarkdown, buildExceptionReport, renderExceptionReportMarkdown, REPORT_VIEWS, buildReportIndex, buildDriftHeatmap, renderDriftHeatmapMarkdown, buildTraceabilityIndex, renderTraceabilityIndexMarkdown } from "./report.js";

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
export type { EaResolver, EaResolverContext, EaAnchorResolution, ObservedEaState, ObservedEntity, ObservedRelationship, ResolverLogger, OpenApiSpec, K8sManifest, TerraformState, TerraformModule, TerraformResource, ParsedTable, ParsedColumn, DbtManifest, DbtNode, DbtSource, DbtExposure, AnchorMatch, AnchorScanResult, QueryPack, QueryPattern, CaptureMapping, QueryMatch, PackRegistry, LoadedResolver } from "./resolvers/index.js";
export { OpenApiResolver, findOpenApiFiles, loadOpenApiSpec, hasEndpoint, extractAllEndpoints, parseSimpleYaml, consoleLogger, silentLogger, KubernetesResolver, findK8sFiles, loadK8sManifests, k8sResourceId, extractImages, extractReplicas, TerraformResolver, findTerraformStateFiles, loadTerraformState, flattenResources, SqlDdlResolver, parseDdl, findSqlFiles, loadSqlTables, DbtResolver, findDbtManifests, loadDbtManifest, extractModels, extractTests, extractSources, extractExposures, AnchorsResolver, scanAnchors, TreeSitterDiscoveryResolver, resetTreeSitterCache, aggregateMatches, getQueryPacks, builtinPacks, loadResolver, loadResolversFromConfig } from "./resolvers/index.js";

// Generators
export type { EaGenerator, EaGeneratorContext, GeneratedOutput, GenerationDrift, GeneratorConfig, EaGeneratorOptions, GenerationReport } from "./generators/index.js";
export { runGenerators, renderGenerationReportMarkdown, registerGenerator, getGenerator, listGenerators, resolveGenerators, openapiGenerator, jsonSchemaGenerator } from "./generators/index.js";

// Policy Engine (EA-native)
export type { EaWorkflowPolicy, EaWorkflowVariant, EaChangeRequiredRule, EaLifecycleRules, EaPolicyMatchResult, EaPolicyEvaluationResult, EaCheckResult } from "./policy.js";
export { evaluateEaPolicy, checkEaPaths, isTrivialPath, matchRules, resolveEaWorkflowVariant, isEaChoreEligible, isPathCoveredByChangeArtifact, loadEaWorkflowPolicy } from "./policy.js";

// Plugin System (EA-native)
export type { EaPlugin, EaPluginCheck, EaPluginHooks, EaPluginContext } from "./plugins.js";
export { loadEaPlugin, loadEaPlugins, runEaPluginChecks } from "./plugins.js";

// Evidence Adapters
export type { EaTestRecord, EaEvidenceAdapterResult, EvidenceAdapter } from "./evidence-adapters/index.js";
export { VitestEaAdapter, collectEaTestEvidence, registerEvidenceAdapter, getAvailableAdapters } from "./evidence-adapters/index.js";

// Verification Engine (EA-native)
export type { EaVerificationOptions, EaVerificationSummary, EaVerificationResult } from "./verify.js";
export { runEaVerification } from "./verify.js";

// Diff Engine
export type { ArtifactChangeType, FieldSemantic, FieldChange, RelationDiff, ArtifactDiff, DomainDiffSummary, EaDiffReport } from "./diff.js";
export { diffEaArtifacts, renderDiffSummary, renderDiffMarkdown, getFieldSemantic, deepEqual } from "./diff.js";

// Diff — Git Integration
export type { DiffGitOptions } from "./diff-git.js";
export { loadArtifactsFromGitRef, loadArtifactsFromWorkingTree, diffEaGitRefs } from "./diff-git.js";

// Compatibility Classifier
export type { CompatibilityLevel, CompatibilityReason, CompatibilityAssessment, CompatibilityReport } from "./compat.js";
export { assessCompatibility, renderCompatSummary, renderCompatMarkdown } from "./compat.js";

// Reconcile Pipeline
export type { ReconcileOptions, ReconcileStepResult, ReconcileReport } from "./reconcile.js";
export { reconcileEaProject, renderReconcileOutput } from "./reconcile.js";

// Version Policy Enforcement
export type { CompatibilityMode, VersionPolicy, VersionPolicyConfig, PolicyViolation, PolicyEnforcementReport } from "./version-policy.js";
export { resolveVersionPolicy, enforceVersionPolicies, renderPolicySummary, renderPolicyMarkdown } from "./version-policy.js";

// Document Traceability
export type { DocFrontmatter, ParsedDoc, ScannedDoc, ScanResult, ScanOptions, DocDiscoveryResult } from "./docs/index.js";
export { parseFrontmatter, extractArtifactIds, hasEaFrontmatter, serializeFrontmatter, DEFAULT_DOC_DIRS, scanDocs, buildDocIndex, discoverFromDocs } from "./docs/index.js";

export type { SourceAnnotationConfig, SourceScanResult } from "./source-scanner.js";
export { extractAnnotations, scanSourceAnnotations } from "./source-scanner.js";

export type { TraceLink, TraceCheckReport } from "./trace-analysis.js";
export { buildTraceLinks, buildTraceCheckReport, isUrl } from "./trace-analysis.js";

// Facts — Markdown prose extraction & consistency
export type {
  FactKind, FactSource, ExtractedFact, FactAnnotation, SuppressionAnnotation,
  FactBlock, FactManifest, FactExtractor, MarkdownDocument, AnnotatedRegion,
  ConsistencyFinding, ConsistencyReport, FactLocation,
  ReconciliationReport,
} from "./facts/index.js";
export {
  ANNOTATION_KIND_MAP, TABLE_HEURISTIC_COLUMNS,
  extractFacts, buildFactManifest,
  parseMarkdown, parseMarkdownFile,
  writeFactManifests,
  checkConsistency, groupFactsByKey,
  applySuppressions, collectSuppressions,
  reconcileFactsWithArtifacts,
} from "./facts/index.js";

// ─── Backstage Entity Model (primary) ───────────────────────────────────────────

// Core types
export type {
  ApiVersion,
  BackstageBuiltinKind,
  AnchoredSpecKind,
  EntityKind,
  EntityLink,
  EntityMetadata,
  EntityConfidence,
  EntityRisk,
  EntitySpecBase,
  ComponentSpec,
  ApiSpec,
  ResourceSpec,
  SystemSpec,
  DomainSpec,
  GroupSpec,
  BehaviorStatement,
  RequirementSpec,
  DecisionSpec,
  CanonicalEntitySpec,
  ExchangeSpec,
  CapabilitySpec,
  ValueStreamSpec,
  MissionSpec,
  TechnologySpec,
  SystemInterfaceSpec,
  ControlSpec,
  TransitionPlanSpec,
  ExceptionSpec,
  BackstageEntity,
  EntityRelation,
  EntityRef,
  EntitySourceLocation,
  LoadedEntity,
} from "./backstage/types.js";

export {
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  ANNOTATION_PREFIX,
  ANNOTATION_KEYS,
  parseEntityRef,
  formatEntityRef,
  formatFullEntityRef,
} from "./backstage/types.js";

// Kind mapping
export type { KindMappingEntry } from "./backstage/kind-mapping.js";

export {
  BACKSTAGE_KIND_REGISTRY,
  mapLegacyKind,
  mapLegacyPrefix,
  mapBackstageKind,
  getLegacyKindsForBackstageKind,
  isLegacyKindRegistered,
  isBackstageKindRegistered,
  getAllBackstageKinds,
  getBuiltinKinds,
  getCustomKinds,
  legacyIdToEntityName,
  entityNameToLegacyId,
} from "./backstage/kind-mapping.js";

// Relation mapping
export type { RelationMappingEntry } from "./backstage/relation-mapping.js";

export {
  RELATION_MAPPING_REGISTRY,
  mapLegacyRelation,
  mapBackstageRelation,
  mapSpecField,
  getWellKnownRelations,
  getCustomRelations,
  isWellKnownRelation,
  legacyRelationToSpecEntry,
  extractRelationsFromSpec,
} from "./backstage/relation-mapping.js";

// Accessors
export type { EntityStatus } from "./backstage/accessors.js";

export {
  getEntityId,
  getEntityName,
  getEntityNamespace,
  getEntityTitle,
  getEntityDescription,
  getEntityLegacyKind,
  getEntityKindMapping,
  getEntitySpecType,
  getEntityStatus,
  getEntityLifecycle,
  getEntityOwners,
  getEntityOwnerRef,
  getEntityTags,
  getAnnotation,
  getAnnotations,
  getEntityConfidence,
  getEntityRisk,
  getEntityCompliance,
  getEntitySource,
  getEntityTraceRefs,
  getEntityExpectAnchors,
  getEntitySuppressions,
  getLabel,
  getLabels,
  getEntitySpecRelations,
  getEntityRelations,
  getSpecFieldTargets,
  getSpecField,
  getSpec,
  getEntitySystem,
  getEntityDomain,
  getEntityLinks,
} from "./backstage/accessors.js";

// Backstage I/O
export type {
  EntitySourceInfo,
  ParsedBackstageEntity,
  BackstageParseError,
  BackstageParseResult,
} from "./backstage/parser.js";

export {
  parseBackstageYaml,
  parseFrontmatterEntity,
  extractMarkdownBody,
} from "./backstage/parser.js";

export type { WriteOptions } from "./backstage/writer.js";

export {
  writeBackstageYaml,
  writeBackstageManifest,
  writeBackstageFrontmatter,
} from "./backstage/writer.js";

export type {
  BackstageEntityLoadDetail,
  BackstageEntityLoadResult,
} from "./backstage/loader.js";

export {
  loadManifestFile,
  loadCatalogDirectory,
  loadInlineEntities,
  loadBackstageEntities,
} from "./backstage/loader.js";

export type { EntityWriteResult, EntityDeleteResult } from "./backstage/entity-writer.js";

export {
  writeToManifest,
  removeFromManifest,
  writeToCatalogDir,
  removeFromCatalogDir,
  writeToFrontmatter,
  writeEntity,
  deleteEntity,
} from "./backstage/entity-writer.js";

// Backstage Validation
export type { BackstageSchemaName } from "./backstage/validate.js";

export {
  validateBackstageEntity,
  validateBackstageEntities,
  getBackstageSchemaForKind,
  getBackstageSchemaNames,
  resetBackstageAjv,
} from "./backstage/validate.js";

// Reverse Resolution
export type {
  ResolutionConfidence,
  ResolutionStrategy,
  ResolutionResult,
  ReverseIndex,
  DiffInput,
  CachedReverseIndex,
} from "./reverse-resolution.js";

export {
  buildReverseIndex,
  buildReverseIndexCached,
  resolveFromFiles,
  resolveFromSymbols,
  resolveFromDiff,
  extractChangedFiles,
} from "./reverse-resolution.js";
