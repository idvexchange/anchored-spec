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

// Drift
export type { EaDriftContext, EaDriftRule, EaDriftResult, EaDriftFinding, DomainDriftSummary, EaDriftReport, EaDriftOptions } from "./drift.js";
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
