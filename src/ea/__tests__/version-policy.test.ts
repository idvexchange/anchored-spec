/**
 * Tests for the EA Version Policy Enforcement
 */

import { describe, it, expect } from "vitest";
import { diffEaArtifacts } from "../diff.js";
import { assessCompatibility } from "../compat.js";
import {
  resolveVersionPolicy,
  enforceVersionPolicies,
  renderPolicySummary,
  renderPolicyMarkdown,
} from "../version-policy.js";
import type { VersionPolicyConfig } from "../version-policy.js";
import type { EaArtifactBase } from "../types.js";
import { artifactToBackstage } from "../backstage/bridge.js";
import { getEntityId } from "../backstage/accessors.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    schemaVersion: "1.0.0",
    title: overrides.id,
    status: "active",
    summary: "Test artifact",
    owners: ["team-a"],
    confidence: "declared",
    ...overrides,
  } as EaArtifactBase;
}

/**
 * Build a policy enforcement report from legacy artifact arrays.
 * Converts to BackstageEntity for the diff (which now expects entities),
 * then patches legacy artifact IDs to match entity refs so the compat
 * and version-policy lookups find the right artifacts.
 */
function enforceWith(
  base: EaArtifactBase[],
  head: EaArtifactBase[],
  config?: VersionPolicyConfig,
) {
  const baseEntities = base.map((a) => artifactToBackstage(a));
  const headEntities = head.map((a) => artifactToBackstage(a));
  const diff = diffEaArtifacts(baseEntities, headEntities);

  const patchedBase = base.map((a, i) => ({ ...a, id: getEntityId(baseEntities[i]!) }));
  const patchedHead = head.map((a, i) => ({ ...a, id: getEntityId(headEntities[i]!) }));

  const compat = assessCompatibility(diff, { base: patchedBase, head: patchedHead });
  return enforceVersionPolicies(compat, { base: patchedBase, head: patchedHead }, config);
}

// ─── resolveVersionPolicy ───────────────────────────────────────────────────────

describe("resolveVersionPolicy", () => {
  it("returns breaking-allowed by default (no config)", () => {
    const artifact = makeArtifact({ id: "APP-a", kind: "application" });
    const policy = resolveVersionPolicy(artifact);
    expect(policy.compatibility).toBe("breaking-allowed");
  });

  it("uses global default from config", () => {
    const artifact = makeArtifact({ id: "APP-a", kind: "application" });
    const policy = resolveVersionPolicy(artifact, {
      defaultCompatibility: "backward-only",
    });
    expect(policy.compatibility).toBe("backward-only");
  });

  it("kind-level overrides global default", () => {
    const artifact = makeArtifact({ id: "API-a", kind: "api-contract" });
    const policy = resolveVersionPolicy(artifact, {
      defaultCompatibility: "breaking-allowed",
      perKind: { "api-contract": { compatibility: "backward-only" } },
    });
    expect(policy.compatibility).toBe("backward-only");
  });

  it("domain-level overrides global default", () => {
    const artifact = makeArtifact({ id: "APP-a", kind: "application" });
    const policy = resolveVersionPolicy(artifact, {
      defaultCompatibility: "breaking-allowed",
      perDomain: { systems: { compatibility: "full" } },
    });
    expect(policy.compatibility).toBe("full");
  });

  it("kind-level overrides domain-level", () => {
    const artifact = makeArtifact({ id: "API-a", kind: "api-contract" });
    const policy = resolveVersionPolicy(artifact, {
      perDomain: { systems: { compatibility: "breaking-allowed" } },
      perKind: { "api-contract": { compatibility: "frozen" } },
    });
    expect(policy.compatibility).toBe("frozen");
  });

  it("artifact-level (extensions.versionPolicy) overrides everything", () => {
    const artifact = makeArtifact({
      id: "API-a",
      kind: "api-contract",
      extensions: {
        versionPolicy: { compatibility: "frozen" },
      },
    });
    const policy = resolveVersionPolicy(artifact, {
      defaultCompatibility: "breaking-allowed",
      perKind: { "api-contract": { compatibility: "backward-only" } },
    });
    expect(policy.compatibility).toBe("frozen");
  });

  it("includes deprecationWindow from config", () => {
    const artifact = makeArtifact({ id: "API-a", kind: "api-contract" });
    const policy = resolveVersionPolicy(artifact, {
      perKind: { "api-contract": { compatibility: "backward-only", deprecationWindow: "90d" } },
    });
    expect(policy.deprecationWindow).toBe("90d");
  });
});

// ─── enforceVersionPolicies ─────────────────────────────────────────────────────

describe("enforceVersionPolicies", () => {
  it("passes with no changes", () => {
    const report = enforceWith([], []);
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("passes when policy is breaking-allowed", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", status: "active" })];
    const report = enforceWith(base, []); // removal → breaking, but no policy
    expect(report.passed).toBe(true);
  });

  it("fails when backward-only policy detects breaking change", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", status: "active" })];
    const report = enforceWith(base, [], {
      defaultCompatibility: "backward-only",
    });
    expect(report.passed).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].compatLevel).toBe("breaking");
    expect(report.violations[0].policy.compatibility).toBe("backward-only");
  });

  it("passes when backward-only policy sees additive change", () => {
    const base: EaArtifactBase[] = [];
    const head = [makeArtifact({ id: "APP-new", kind: "application" })];
    const report = enforceWith(base, head, {
      defaultCompatibility: "backward-only",
    });
    expect(report.passed).toBe(true);
  });

  it("fails when full policy detects ambiguous change", () => {
    // A contractual spec field modification is classified as "ambiguous" by the compat engine.
    // With entity-based diffing, kind-specific properties are carried into spec and treated
    // as contractual fields when they're not in the base field semantic map.
    const base = [makeArtifact({ id: "APP-a", kind: "application", contractSpec: "v1" } as never)];
    const head = [makeArtifact({ id: "APP-a", kind: "application", contractSpec: "v2" } as never)];
    const report = enforceWith(base, head, {
      defaultCompatibility: "full",
    });
    expect(report.passed).toBe(false);
    expect(report.violations[0].policy.compatibility).toBe("full");
  });

  it("fails when frozen policy detects any change", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", title: "Old" })];
    const head = [makeArtifact({ id: "APP-a", kind: "application", title: "New" })];
    const report = enforceWith(base, head, {
      defaultCompatibility: "frozen",
    });
    expect(report.passed).toBe(false);
  });

  it("passes when frozen policy sees no changes", () => {
    const artifacts = [makeArtifact({ id: "APP-a", kind: "application" })];
    const report = enforceWith(artifacts, [...artifacts], {
      defaultCompatibility: "frozen",
    });
    expect(report.passed).toBe(true);
  });

  it("uses per-kind policy", () => {
    const base = [makeArtifact({ id: "API-a", kind: "api-contract", status: "active" })];
    const head: EaArtifactBase[] = []; // removal → breaking
    const report = enforceWith(base, head, {
      defaultCompatibility: "breaking-allowed",
      perKind: { "api-contract": { compatibility: "backward-only" } },
    });
    expect(report.passed).toBe(false);
    expect(report.violations[0].artifactId).toBe("api:a");
  });

  it("uses artifact-level policy from extensions", () => {
    const base = [makeArtifact({
      id: "APP-a",
      kind: "application",
      status: "active",
      extensions: { versionPolicy: { compatibility: "backward-only" } },
    })];
    const head: EaArtifactBase[] = [];
    const report = enforceWith(base, head, {
      defaultCompatibility: "breaking-allowed",
    });
    expect(report.passed).toBe(false);
  });

  it("summary counts by policy", () => {
    const base = [
      makeArtifact({ id: "APP-a", kind: "application", status: "active" }),
      makeArtifact({ id: "API-b", kind: "api-contract", status: "active" }),
    ];
    const head = [
      makeArtifact({ id: "APP-a", kind: "application", title: "Updated" }),
    ];
    const report = enforceWith(base, head, {
      perKind: { "api-contract": { compatibility: "backward-only" } },
    });
    expect(report.summary.byPolicy["backward-only"]).toBeGreaterThanOrEqual(1);
  });

  it("includes baseRef and headRef from compat report", () => {
    const diff = diffEaArtifacts([], [], { baseRef: "v1.0", headRef: "v2.0" });
    const compat = assessCompatibility(diff);
    const report = enforceVersionPolicies(compat, { base: [], head: [] });
    expect(report.baseRef).toBe("v1.0");
    expect(report.headRef).toBe("v2.0");
  });
});

// ─── Rendering ──────────────────────────────────────────────────────────────────

describe("renderPolicySummary", () => {
  it("shows PASSED for no violations", () => {
    const report = enforceWith([], []);
    expect(renderPolicySummary(report)).toContain("PASSED");
  });

  it("shows FAILED for violations", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", status: "active" })];
    const report = enforceWith(base, [], { defaultCompatibility: "backward-only" });
    expect(renderPolicySummary(report)).toContain("FAILED");
  });
});

describe("renderPolicyMarkdown", () => {
  it("renders header", () => {
    const diff = diffEaArtifacts([], [], { baseRef: "main", headRef: "dev" });
    const compat = assessCompatibility(diff);
    const report = enforceVersionPolicies(compat, { base: [], head: [] });
    const md = renderPolicyMarkdown(report);
    expect(md).toContain("# Version Policy Enforcement: main..dev");
  });

  it("renders violations table", () => {
    const base = [makeArtifact({ id: "APP-a", kind: "application", status: "active" })];
    const report = enforceWith(base, [], { defaultCompatibility: "backward-only" });
    const md = renderPolicyMarkdown(report);
    expect(md).toContain("Violations");
    expect(md).toContain("component:a");
    expect(md).toContain("backward-only");
  });
});
