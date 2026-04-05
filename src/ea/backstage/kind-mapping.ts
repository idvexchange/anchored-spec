/**
 * Backstage Entity Descriptor Registry
 *
 * Maps anchored-spec schema names to Backstage-aligned entity descriptors.
 * Built-in Backstage kinds use `backstage.io/v1alpha1`; custom EA kinds use
 * `anchored-spec.dev/v1alpha1`.
 */

import {
  BACKSTAGE_API_VERSION,
  ANCHORED_SPEC_API_VERSION,
  type ApiVersion,
  type EntityKind,
} from "./types.js";
import type { EaDomain } from "../types.js";

export interface EntityDescriptor {
  /** Anchored-spec schema profile used for validation and per-schema policy. */
  schema: string;
  /** The anchored-spec domain this descriptor belongs to. */
  domain: EaDomain;
  /** The API version for this entity descriptor. */
  apiVersion: ApiVersion;
  /** The Backstage or anchored-spec entity kind. */
  kind: EntityKind;
  /** Optional `spec.type` discriminator for the entity descriptor. */
  specType?: string;
  /** Human-readable description. */
  description: string;
}

export const ENTITY_DESCRIPTOR_REGISTRY: readonly EntityDescriptor[] = [
  { schema: "application", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, kind: "Component", specType: "website", description: "A frontend application" },
  { schema: "service", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, kind: "Component", specType: "service", description: "A backend service or microservice" },
  { schema: "consumer", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, kind: "Component", specType: "service", description: "A declared API/event consumer" },
  { schema: "platform", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, kind: "Component", specType: "service", description: "A runtime platform" },

  { schema: "api-contract", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, kind: "API", specType: "openapi", description: "A REST/GraphQL/gRPC API specification" },
  { schema: "event-contract", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, kind: "API", specType: "asyncapi", description: "An async event/message contract" },

  { schema: "cloud-resource", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "cloud-resource", description: "A specific cloud resource" },
  { schema: "physical-schema", domain: "data", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "database-table", description: "A physical database schema" },
  { schema: "data-store", domain: "data", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "database", description: "A data storage system" },
  { schema: "data-product", domain: "data", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "data-product", description: "A data product with SLAs" },
  { schema: "runtime-cluster", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "cluster", description: "A compute cluster" },
  { schema: "network-zone", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "network-zone", description: "A network security zone" },
  { schema: "deployment", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "deployment", description: "A deployed instance" },
  { schema: "environment", domain: "delivery", apiVersion: BACKSTAGE_API_VERSION, kind: "Resource", specType: "environment", description: "A deployment environment" },

  { schema: "system", domain: "systems", apiVersion: BACKSTAGE_API_VERSION, kind: "System", description: "A bounded system made up of related components, APIs, and resources" },
  { schema: "domain", domain: "business", apiVersion: BACKSTAGE_API_VERSION, kind: "Domain", description: "A business or architecture domain that groups related systems" },
  { schema: "org-unit", domain: "business", apiVersion: BACKSTAGE_API_VERSION, kind: "Group", specType: "team", description: "An organizational unit" },

  { schema: "requirement", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Requirement", specType: "functional", description: "A behavioral software requirement" },
  { schema: "security-requirement", domain: "systems", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Requirement", specType: "security", description: "A security requirement" },
  { schema: "data-requirement", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Requirement", specType: "data", description: "A data requirement" },
  { schema: "technical-requirement", domain: "delivery", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Requirement", specType: "technical", description: "A technical requirement" },
  { schema: "information-requirement", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Requirement", specType: "information", description: "An information requirement" },

  { schema: "decision", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Decision", description: "An architecture decision record" },
  { schema: "change", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Decision", specType: "change-record", description: "An implementation change record" },

  { schema: "canonical-entity", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "CanonicalEntity", description: "A canonical data entity" },
  { schema: "information-concept", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "CanonicalEntity", specType: "concept", description: "A high-level information concept" },
  { schema: "glossary-term", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "CanonicalEntity", specType: "glossary-term", description: "A canonical glossary term" },
  { schema: "master-data-domain", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "CanonicalEntity", specType: "master-data-domain", description: "A master data domain" },

  { schema: "information-exchange", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Exchange", description: "A declared information exchange" },
  { schema: "integration", domain: "systems", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Exchange", specType: "integration", description: "A declared integration" },

  { schema: "capability", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Capability", description: "A business capability" },
  { schema: "value-stream", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "ValueStream", description: "A value stream with stages" },
  { schema: "process", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "ValueStream", specType: "process", description: "A business process" },
  { schema: "mission", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Mission", description: "A strategic mission" },
  { schema: "policy-objective", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Mission", specType: "policy-objective", description: "A policy objective" },
  { schema: "business-service", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Capability", specType: "business-service", description: "A business service" },

  { schema: "technology-standard", domain: "delivery", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Technology", description: "An approved technology standard" },

  { schema: "system-interface", domain: "systems", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "SystemInterface", description: "An external system boundary" },
  { schema: "identity-boundary", domain: "delivery", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "SystemInterface", specType: "identity-boundary", description: "An identity/auth boundary" },

  { schema: "control", domain: "business", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Control", description: "A governance control" },
  { schema: "classification", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Control", specType: "classification", description: "A data classification level" },
  { schema: "retention-policy", domain: "information", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Control", specType: "retention-policy", description: "A data retention policy" },
  { schema: "data-quality-rule", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Control", specType: "data-quality-rule", description: "A data quality rule" },

  { schema: "transition-plan", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "TransitionPlan", description: "A transition plan" },
  { schema: "migration-wave", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "TransitionPlan", specType: "migration-wave", description: "A migration wave" },
  { schema: "baseline", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "TransitionPlan", specType: "baseline", description: "A point-in-time snapshot" },
  { schema: "target", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "TransitionPlan", specType: "target", description: "A desired future state" },

  { schema: "exception", domain: "transitions", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Exception", description: "An approved policy exception" },

  { schema: "logical-data-model", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "CanonicalEntity", specType: "logical-data-model", description: "A logical data model" },
  { schema: "lineage", domain: "data", apiVersion: ANCHORED_SPEC_API_VERSION, kind: "Exchange", specType: "data-lineage", description: "A data lineage path" },
] as const;

const bySchema = new Map<string, EntityDescriptor>(
  ENTITY_DESCRIPTOR_REGISTRY.map((entry) => [entry.schema, entry]),
);

const byEntityKind = new Map<string, EntityDescriptor[]>();
for (const entry of ENTITY_DESCRIPTOR_REGISTRY) {
  const existing = byEntityKind.get(entry.kind) ?? [];
  existing.push(entry);
  byEntityKind.set(entry.kind, existing);
}

export function getSchemaDescriptor(schema: string): EntityDescriptor | undefined {
  return bySchema.get(schema);
}

export function getEntityDescriptorForEntity(
  apiVersion: string,
  kind: string,
  specType?: string,
): EntityDescriptor | undefined {
  const entries = byEntityKind.get(kind);
  if (!entries) return undefined;

  const versionMatches = entries.filter((entry) => entry.apiVersion === apiVersion);
  if (versionMatches.length === 0) return undefined;
  if (versionMatches.length === 1) return versionMatches[0];

  if (specType) {
    const typeMatch = versionMatches.find((entry) => entry.specType === specType);
    if (typeMatch) return typeMatch;
  }

  return versionMatches.find((entry) => !entry.specType) ?? versionMatches[0];
}

export function getEntityDescriptorsForKind(kind: string): EntityDescriptor[] {
  return byEntityKind.get(kind) ?? [];
}

export function isSchemaRegistered(schema: string): boolean {
  return bySchema.has(schema);
}

export function isEntityKindRegistered(kind: string): boolean {
  return byEntityKind.has(kind);
}

export function getAllEntityKinds(): EntityKind[] {
  return [...new Set(ENTITY_DESCRIPTOR_REGISTRY.map((entry) => entry.kind))];
}

export function getBuiltinEntityDescriptors(): EntityDescriptor[] {
  return ENTITY_DESCRIPTOR_REGISTRY.filter(
    (entry) => entry.apiVersion === BACKSTAGE_API_VERSION,
  ) as EntityDescriptor[];
}

export function getCustomEntityDescriptors(): EntityDescriptor[] {
  return ENTITY_DESCRIPTOR_REGISTRY.filter(
    (entry) => entry.apiVersion === ANCHORED_SPEC_API_VERSION,
  ) as EntityDescriptor[];
}
