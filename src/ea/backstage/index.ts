/**
 * Backstage Entity Model — Public API
 *
 * Re-exports all Backstage-aligned types, kind mappings, and utilities.
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
  formatEntityRef,
  formatFullEntityRef,
} from "./types.js";

// Kind mapping
export type { KindMappingEntry } from "./kind-mapping.js";

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
} from "./kind-mapping.js";

// Relation mapping
export type { RelationMappingEntry } from "./relation-mapping.js";

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
} from "./relation-mapping.js";
