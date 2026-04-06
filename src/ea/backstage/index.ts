/**
 * Backstage Entity Model — Public API
 *
 * Re-exports all Backstage-aligned types, descriptor mappings, and utilities.
 */

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
} from "./types.js";

export {
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  ANNOTATION_PREFIX,
  ANNOTATION_KEYS,
  parseEntityRef,
  normalizeEntityRef,
  stringifyEntityRef,
  parseLocationRef,
  stringifyLocationRef,
} from "./types.js";

export type { EntityRefNormalizationOptions } from "./ref-utils.js";

export {
  looksLikeEntityRef,
  normalizeKnownEntityRef,
  getEntityRefAliases,
  entityRefToFilenameSlug,
} from "./ref-utils.js";

export type { EntityDescriptorMatch } from "./predicates.js";

export {
  hasEntityKind,
  hasEntitySchema,
  hasEntitySpecType,
  matchesEntityDescriptor,
  matchesSchemaDescriptor,
} from "./predicates.js";

// Descriptor mapping
export type { EntityDescriptor } from "./kind-mapping.js";

export {
  ENTITY_DESCRIPTOR_REGISTRY,
  getSchemaDescriptor,
  getEntityDescriptorForEntity,
  getEntityDescriptorsForKind,
  isSchemaRegistered,
  isEntityKindRegistered,
  getAllEntityKinds,
  getBuiltinEntityDescriptors,
  getCustomEntityDescriptors,
} from "./kind-mapping.js";

// Relation mapping
export type { RelationMappingEntry } from "./relation-mapping.js";

export {
  RELATION_MAPPING_REGISTRY,
  mapRelationType,
  mapBackstageRelation,
  mapSpecField,
  getWellKnownRelations,
  getCustomRelations,
  isWellKnownRelation,
  relationTypeToSpecEntry,
  extractRelationsFromSpec,
} from "./relation-mapping.js";

// Parser
export type {
  EntitySourceInfo,
  ParsedBackstageEntity,
  BackstageParseError,
  BackstageParseResult,
} from "./parser.js";

export {
  parseBackstageYaml,
  parseFrontmatterEntity,
  extractMarkdownBody,
} from "./parser.js";

// Writer
export type { WriteOptions } from "./writer.js";

export {
  writeBackstageYaml,
  writeBackstageManifest,
  writeBackstageFrontmatter,
} from "./writer.js";

// Loader
export type {
  BackstageEntityLoadDetail,
  BackstageEntityLoadResult,
} from "./loader.js";

export {
  loadManifestFile,
  loadCatalogDirectory,
  loadInlineEntities,
  loadBackstageEntities,
} from "./loader.js";

// Entity Writer
export type { EntityWriteResult, EntityDeleteResult } from "./entity-writer.js";

export {
  writeToManifest,
  removeFromManifest,
  writeToCatalogDir,
  removeFromCatalogDir,
  writeToFrontmatter,
  writeEntity,
  deleteEntity,
} from "./entity-writer.js";

// Accessors — convenience functions for reading BackstageEntity fields
export type { EntityStatus } from "./accessors.js";

export {
  getEntityId,
  getEntityName,
  getEntityNamespace,
  getEntityTitle,
  getEntityDescription,
  getEntityKind,
  getEntitySchema,
  getEntityDescriptor,
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
  getEntityCodeLocation,
  getEntityTraceRefs,
  getEntityExpectAnchors,
  getEntityAnchors,
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
} from "./accessors.js";

// Validation
export type { BackstageSchemaName } from "./validate.js";

export {
  validateBackstageEntity,
  validateBackstageEntities,
  getBackstageSchemaForKind,
  getBackstageSchemaNames,
  resetBackstageAjv,
} from "./validate.js";
