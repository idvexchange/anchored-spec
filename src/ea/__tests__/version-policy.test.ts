/**
 * Tests for the EA Version Policy Enforcement
 */
import { describe, it, expect } from "vitest";
import { diffEntities } from "../diff.js";
import { assessCompatibility } from "../compat.js";
import { resolveVersionPolicy, enforceVersionPolicies, renderPolicySummary, renderPolicyMarkdown, } from "../version-policy.js";
import type { VersionPolicyConfig } from "../version-policy.js";
import type { BackstageEntity } from "../backstage/types.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Helpers ────────────────────────────────────────────────────────────────────
function makePolicyEntity(overrides: Parameters<typeof makeEntity>[0]): BackstageEntity {
    return makeEntity({
        title: overrides.title ?? overrides.name ?? overrides.ref,
        status: "active",
        summary: "Test artifact",
        owner: "group:default/team-a",
        confidence: "declared",
        ...overrides
    });
}
function enforceWith(base: BackstageEntity[], head: BackstageEntity[], config?: VersionPolicyConfig) {
    const diff = diffEntities(base, head);
    const compat = assessCompatibility(diff, { base, head });
    return enforceVersionPolicies(compat, { base, head }, config);
}
// ─── resolveVersionPolicy ───────────────────────────────────────────────────────
describe("resolveVersionPolicy", () => {
    it("returns breaking-allowed by default (no config)", () => {
        const entity = makePolicyEntity({ ref: "component:a", kind: "Component", type: "website" });
        const policy = resolveVersionPolicy(entity);
        expect(policy.compatibility).toBe("breaking-allowed");
    });
    it("uses global default from config", () => {
        const entity = makePolicyEntity({ ref: "component:a", kind: "Component", type: "website" });
        const policy = resolveVersionPolicy(entity, {
            defaultCompatibility: "backward-only"
        });
        expect(policy.compatibility).toBe("backward-only");
    });
    it("kind-level overrides global default", () => {
        const entity = makePolicyEntity({ ref: "api:a", kind: "API", type: "openapi" });
        const policy = resolveVersionPolicy(entity, {
            defaultCompatibility: "breaking-allowed",
            perSchema: { "api-contract": { compatibility: "backward-only" } }
        });
        expect(policy.compatibility).toBe("backward-only");
    });
    it("domain-level overrides global default", () => {
        const entity = makePolicyEntity({ ref: "component:a", kind: "Component", type: "website" });
        const policy = resolveVersionPolicy(entity, {
            defaultCompatibility: "breaking-allowed",
            perDomain: { systems: { compatibility: "full" } }
        });
        expect(policy.compatibility).toBe("full");
    });
    it("kind-level overrides domain-level", () => {
        const entity = makePolicyEntity({ ref: "api:a", kind: "API", type: "openapi" });
        const policy = resolveVersionPolicy(entity, {
            perDomain: { systems: { compatibility: "breaking-allowed" } },
            perSchema: { "api-contract": { compatibility: "frozen" } }
        });
        expect(policy.compatibility).toBe("frozen");
    });
    it("artifact-level (extensions.versionPolicy) overrides everything", () => {
        const entity = makePolicyEntity({
            ref: "api:a",
            kind: "API",
            type: "openapi",
            versionPolicy: { compatibility: "frozen" }
        });
        const policy = resolveVersionPolicy(entity, {
            defaultCompatibility: "breaking-allowed",
            perSchema: { "api-contract": { compatibility: "backward-only" } }
        });
        expect(policy.compatibility).toBe("frozen");
    });
    it("includes deprecationWindow from config", () => {
        const entity = makePolicyEntity({ ref: "api:a", kind: "API", type: "openapi" });
        const policy = resolveVersionPolicy(entity, {
            perSchema: { "api-contract": { compatibility: "backward-only", deprecationWindow: "90d" } }
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
        const base = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const report = enforceWith(base, []); // removal → breaking, but no policy
        expect(report.passed).toBe(true);
    });
    it("fails when backward-only policy detects breaking change", () => {
        const base = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const report = enforceWith(base, [], {
            defaultCompatibility: "backward-only"
        });
        expect(report.passed).toBe(false);
        expect(report.violations).toHaveLength(1);
        expect(report.violations[0].compatLevel).toBe("breaking");
        expect(report.violations[0].policy.compatibility).toBe("backward-only");
    });
    it("passes when backward-only policy sees additive change", () => {
        const base: BackstageEntity[] = [];
        const head = [makePolicyEntity({ ref: "component:new", kind: "Component", type: "website" })];
        const report = enforceWith(base, head, {
            defaultCompatibility: "backward-only"
        });
        expect(report.passed).toBe(true);
    });
    it("fails when full policy detects ambiguous change", () => {
        // A contractual spec field modification is classified as "ambiguous" by the compat engine.
        // With entity-based diffing, schema-specific properties are carried into spec and treated
        // as contractual fields when they're not in the base field semantic map.
        const base = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", contractSpec: "v1" } as never)];
        const head = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", contractSpec: "v2" } as never)];
        const report = enforceWith(base, head, {
            defaultCompatibility: "full"
        });
        expect(report.passed).toBe(false);
        expect(report.violations[0].policy.compatibility).toBe("full");
    });
    it("fails when frozen policy detects any change", () => {
        const base = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", title: "Old" })];
        const head = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", title: "New" })];
        const report = enforceWith(base, head, {
            defaultCompatibility: "frozen"
        });
        expect(report.passed).toBe(false);
    });
    it("passes when frozen policy sees no changes", () => {
        const artifacts = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website" })];
        const report = enforceWith(artifacts, [...artifacts], {
            defaultCompatibility: "frozen"
        });
        expect(report.passed).toBe(true);
    });
    it("uses per-schema policy", () => {
        const base = [makePolicyEntity({ ref: "api:a", kind: "API", type: "openapi", status: "active" })];
        const head: BackstageEntity[] = []; // removal → breaking
        const report = enforceWith(base, head, {
            defaultCompatibility: "breaking-allowed",
            perSchema: { "api-contract": { compatibility: "backward-only" } }
        });
        expect(report.passed).toBe(false);
        expect(report.violations[0].entityRef).toBe("api:default/a");
    });
    it("uses artifact-level policy from extensions", () => {
        const base = [makePolicyEntity({
                ref: "component:a",
                kind: "Component",
                type: "website",
                status: "active",
                versionPolicy: { compatibility: "backward-only" }
            })];
        const head: BackstageEntity[] = [];
        const report = enforceWith(base, head, {
            defaultCompatibility: "breaking-allowed"
        });
        expect(report.passed).toBe(false);
    });
    it("summary counts by policy", () => {
        const base = [
            makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" }),
            makePolicyEntity({ ref: "api:b", kind: "API", type: "openapi", status: "active" }),
        ];
        const head = [
            makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", title: "Updated" }),
        ];
        const report = enforceWith(base, head, {
            perSchema: { "api-contract": { compatibility: "backward-only" } }
        });
        expect(report.summary.byPolicy["backward-only"]).toBeGreaterThanOrEqual(1);
    });
    it("includes baseRef and headRef from compat report", () => {
        const diff = diffEntities([], [], { baseRef: "v1.0", headRef: "v2.0" });
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
        const base = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const report = enforceWith(base, [], { defaultCompatibility: "backward-only" });
        expect(renderPolicySummary(report)).toContain("FAILED");
    });
});
describe("renderPolicyMarkdown", () => {
    it("renders header", () => {
        const diff = diffEntities([], [], { baseRef: "main", headRef: "dev" });
        const compat = assessCompatibility(diff);
        const report = enforceVersionPolicies(compat, { base: [], head: [] });
        const md = renderPolicyMarkdown(report);
        expect(md).toContain("# Version Policy Enforcement: main..dev");
    });
    it("renders violations table", () => {
        const base = [makePolicyEntity({ ref: "component:a", kind: "Component", type: "website", status: "active" })];
        const report = enforceWith(base, [], { defaultCompatibility: "backward-only" });
        const md = renderPolicyMarkdown(report);
        expect(md).toContain("Violations");
        expect(md).toContain("component:default/a");
        expect(md).toContain("backward-only");
    });
});
