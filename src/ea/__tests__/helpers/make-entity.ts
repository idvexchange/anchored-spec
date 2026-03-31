/**
 * Shared test helper to create BackstageEntity fixtures from legacy-style overrides.
 * Uses the bridge to ensure consistent conversion.
 */
import type { BackstageEntity } from "../../backstage/types.js";
import type { EaArtifactBase } from "../../types.js";
import { artifactToBackstage } from "../../backstage/bridge.js";

/**
 * Create a BackstageEntity for testing from legacy artifact-style overrides.
 * Accepts the same shape as the old `makeArtifact()` helpers but returns a BackstageEntity.
 */
export function makeEntity(
  overrides: Partial<EaArtifactBase> & { id: string; kind: string },
): BackstageEntity {
  const legacy: EaArtifactBase = {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    summary: "A well-described artifact for testing purposes.",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
  return artifactToBackstage(legacy);
}
