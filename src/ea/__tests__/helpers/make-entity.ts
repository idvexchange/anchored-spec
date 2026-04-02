import type { BackstageEntity } from "../../backstage/types.js";
import {
  legacyFixtureToEntity,
  type LegacyEntityFixture,
} from "../../../test-helpers/entity-fixtures.js";

export function makeEntity(
  overrides: Partial<LegacyEntityFixture> & { id: string; kind: string },
): BackstageEntity {
  return legacyFixtureToEntity({
    title: overrides.title ?? overrides.id,
    summary: "A well-described artifact for testing purposes.",
    owners: [],
    tags: [],
    confidence: "declared",
    status: "active",
    relations: [],
    ...overrides,
  });
}
