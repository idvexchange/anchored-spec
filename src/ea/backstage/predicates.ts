import type { BackstageEntity, EntityKind } from "./types.js";
import type { EntityDescriptor } from "./kind-mapping.js";
import { getEntityDescriptor, getEntitySchema, getEntitySpecType } from "./accessors.js";

export interface EntityDescriptorMatch {
  kind?: EntityKind | string;
  specType?: string;
  schema?: string;
}

export function hasEntityKind(entity: BackstageEntity, kind: EntityKind | string): boolean {
  return entity.kind === kind;
}

export function hasEntitySchema(entity: BackstageEntity, schema: string): boolean {
  return getEntitySchema(entity) === schema;
}

export function hasEntitySpecType(entity: BackstageEntity, specType: string): boolean {
  return getEntitySpecType(entity) === specType;
}

export function matchesEntityDescriptor(
  entity: BackstageEntity,
  match: EntityDescriptorMatch,
): boolean {
  if (match.kind && entity.kind !== match.kind) return false;
  if (match.specType && getEntitySpecType(entity) !== match.specType) return false;
  if (match.schema && getEntitySchema(entity) !== match.schema) return false;
  return true;
}

export function matchesSchemaDescriptor(entity: BackstageEntity, descriptor: EntityDescriptor): boolean {
  const entityDescriptor = getEntityDescriptor(entity);
  if (!entityDescriptor) return false;
  return (
    entityDescriptor.apiVersion === descriptor.apiVersion &&
    entityDescriptor.kind === descriptor.kind &&
    entityDescriptor.specType === descriptor.specType &&
    entityDescriptor.schema === descriptor.schema
  );
}
