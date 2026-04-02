import {
  makeBackstageEntity,
  type EntityFixtureInput,
} from "../../../test-helpers/entity-fixtures.js";
import type { BackstageEntity } from "../../backstage/types.js";

export function makeEntity(
  overrides: EntityFixtureInput,
): BackstageEntity {
  return makeBackstageEntity({
    title: overrides.title ?? overrides.name ?? overrides.ref,
    summary: "A well-described entity for testing purposes.",
    tags: [],
    confidence: "declared",
    status: "active",
    ...overrides,
  });
}
