import type { BackstageEntity } from "../ea/backstage/types.js";
import { getEntityId } from "../ea/backstage/accessors.js";

export interface EntityLookup {
  byInput: Map<string, BackstageEntity>;
}

export function buildEntityLookup(entities: BackstageEntity[]): EntityLookup {
  const byInput = new Map<string, BackstageEntity>();

  for (const entity of entities) {
    const entityRef = getEntityId(entity);
    byInput.set(entityRef, entity);
  }

  return { byInput };
}

export function formatEntityDisplay(entity: BackstageEntity): string {
  return getEntityId(entity);
}

export function formatEntityHint(entity: BackstageEntity): string {
  return getEntityId(entity);
}

export function resolveEntityInput(input: string, lookup: EntityLookup): BackstageEntity | undefined {
  return lookup.byInput.get(input);
}

export function suggestEntities(input: string, entities: BackstageEntity[], limit = 3): string[] {
  const needle = input.toLowerCase();
  const tokens = needle.split(/[^a-z0-9]+/).filter(Boolean);
  return entities
    .map((entity) => ({
      entity,
      entityRef: getEntityId(entity),
    }))
    .filter(({ entityRef }) => {
      const haystack = entityRef.toLowerCase();
      return haystack.includes(needle) ||
        tokens.some((token) => token.length >= 3 && haystack.includes(token));
    })
    .slice(0, limit)
    .map(({ entity }) => formatEntityHint(entity));
}
