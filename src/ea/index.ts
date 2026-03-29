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
export { validateEaSchema, validateEaArtifacts, getSchemaForKind, getEaSchemaNames } from "./validate.js";

// Loader
export type { EaLoadedArtifact, EaLoadResult, EaSummary } from "./loader.js";
export { EaRoot, normalizeArtifact } from "./loader.js";
