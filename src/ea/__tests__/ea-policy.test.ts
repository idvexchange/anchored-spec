/**
 * Tests for EA Workflow Policy Engine
 *
 * Covers:
 *   - isTrivialPath exemptions
 *   - matchRules path matching
 *   - evaluateEaPolicy summary
 *   - checkEaPaths coverage validation
 *   - resolveEaWorkflowVariant
 *   - isEaChoreEligible
 */
import { describe, it, expect } from "vitest";
import { isTrivialPath, matchRules, evaluateEaPolicy, checkEaPaths, resolveEaWorkflowVariant, isEaChoreEligible, isPathCoveredByChangeEntity, } from "../policy.js";
import type { EaWorkflowPolicy, EaChangeRequiredRule } from "../../ea/index.js";
import { makeEntity } from "./helpers/make-entity.js";
// ─── Fixtures ───────────────────────────────────────────────────────────────────
function makePolicy(overrides?: Partial<EaWorkflowPolicy>): EaWorkflowPolicy {
    return {
        workflowVariants: [
            { id: "feature", name: "Feature", defaultTypes: ["feature"], requiredSchemas: ["change"] },
            { id: "chore", name: "Chore", defaultTypes: ["chore"], requiredSchemas: [] }
        ],
        changeRequiredRules: [
            { id: "src-rule", include: ["src/**"], exclude: ["src/**/*.test.*"] },
            { id: "config-rule", include: ["*.config.*", "package.json"] }
        ],
        trivialExemptions: ["**/*.md", "**/*.txt", ".gitignore", "**/README*"],
        choreEligibility: {
            conditions: ["only-docs", "ci-config"],
            escalationRule: "Escalate to feature if code changes detected"
        },
        lifecycleRules: {
            plannedToActiveRequiresChange: true,
            activeToShippedRequiresCoverage: true,
            deprecatedRequiresReason: true
        },
        ...overrides
    };
}
function makeChangeEntity(overrides: Record<string, unknown> & {
    scope?: {
        include: string[];
        exclude?: string[];
    };
}) {
    return makeEntity({
        ref: "decision:chg-test",
        kind: "Decision",
        type: "change-record",
        name: "Test Change",
        status: "active",
        confidence: "high",
        ...overrides
    });
}
// ─── isTrivialPath ──────────────────────────────────────────────────────────────
describe("isTrivialPath", () => {
    const policy = makePolicy();
    it("returns true for markdown files", () => {
        expect(isTrivialPath("docs/CHANGELOG.md", policy)).toBe(true);
    });
    it("returns true for .gitignore", () => {
        expect(isTrivialPath(".gitignore", policy)).toBe(true);
    });
    it("returns true for README", () => {
        expect(isTrivialPath("README.md", policy)).toBe(true);
    });
    it("returns false for source code", () => {
        expect(isTrivialPath("src/auth.ts", policy)).toBe(false);
    });
    it("returns false for config files", () => {
        expect(isTrivialPath("package.json", policy)).toBe(false);
    });
});
// ─── matchRules ─────────────────────────────────────────────────────────────────
describe("matchRules", () => {
    const rules: EaChangeRequiredRule[] = [
        { id: "src-rule", include: ["src/**"], exclude: ["src/**/*.test.*"] },
        { id: "config-rule", include: ["*.config.*", "package.json"] },
    ];
    it("matches source files to src-rule", () => {
        const matched = matchRules("src/auth/login.ts", rules);
        expect(matched).toHaveLength(1);
        expect(matched[0]!.id).toBe("src-rule");
    });
    it("excludes test files from src-rule", () => {
        const matched = matchRules("src/auth/login.test.ts", rules);
        expect(matched).toHaveLength(0);
    });
    it("matches config files to config-rule", () => {
        const matched = matchRules("package.json", rules);
        expect(matched).toHaveLength(1);
        expect(matched[0]!.id).toBe("config-rule");
    });
    it("returns empty for unmatched paths", () => {
        const matched = matchRules("docs/setup.md", rules);
        expect(matched).toHaveLength(0);
    });
});
// ─── evaluateEaPolicy ───────────────────────────────────────────────────────────
describe("evaluateEaPolicy", () => {
    const policy = makePolicy();
    it("evaluates mixed paths correctly", () => {
        const result = evaluateEaPolicy(["src/app.ts", "README.md", "docs/guide.md", "package.json"], policy);
        expect(result.summary.totalPaths).toBe(4);
        expect(result.summary.trivialPaths).toBe(2);
        expect(result.summary.governedPaths).toBe(2);
        expect(result.summary.matchedRules).toContain("src-rule");
        expect(result.summary.matchedRules).toContain("config-rule");
    });
    it("all trivial paths means no governance required", () => {
        const result = evaluateEaPolicy(["README.md", "CHANGELOG.md", ".gitignore"], policy);
        expect(result.summary.governedPaths).toBe(0);
        expect(result.summary.trivialPaths).toBe(3);
    });
    it("ungoverned paths are neither trivial nor rule-matched", () => {
        const result = evaluateEaPolicy(["images/logo.png"], policy);
        expect(result.summary.ungoverned).toBe(1);
    });
    it("returns path-level detail for each path", () => {
        const result = evaluateEaPolicy(["src/app.ts"], policy);
        expect(result.paths).toHaveLength(1);
        expect(result.paths[0]!.requiresChange).toBe(true);
        expect(result.paths[0]!.isTrivial).toBe(false);
        expect(result.paths[0]!.matchedRules[0]!.id).toBe("src-rule");
    });
});
// ─── checkEaPaths ───────────────────────────────────────────────────────────────
describe("checkEaPaths", () => {
    const policy = makePolicy();
    it("valid when governed paths are covered by active changes", () => {
        const change = makeChangeEntity({
            ref: "chg-auth",
            scope: { include: ["src/**"] }
        });
        const result = checkEaPaths(["src/auth.ts"], policy, [change]);
        expect(result.valid).toBe(true);
        expect(result.uncoveredPaths).toHaveLength(0);
    });
    it("invalid when governed paths are uncovered", () => {
        const result = checkEaPaths(["src/auth.ts"], policy, []);
        expect(result.valid).toBe(false);
        expect(result.uncoveredPaths).toContain("src/auth.ts");
    });
    it("ignores non-active change entities", () => {
        const change = makeChangeEntity({
            ref: "chg-draft",
            status: "draft",
            scope: { include: ["src/**"] }
        });
        const result = checkEaPaths(["src/auth.ts"], policy, [change]);
        expect(result.valid).toBe(false);
    });
    it("trivial paths don't need coverage", () => {
        const result = checkEaPaths(["README.md"], policy, []);
        expect(result.valid).toBe(true);
    });
});
// ─── isPathCoveredByChangeEntity ──────────────────────────────────────────────
describe("isPathCoveredByChangeEntity", () => {
    it("returns true when path matches scope include", () => {
        const entity = makeChangeEntity({ scope: { include: ["src/**"] } });
        expect(isPathCoveredByChangeEntity("src/app.ts", entity)).toBe(true);
    });
    it("returns false when path matches scope exclude", () => {
        const entity = makeChangeEntity({ scope: { include: ["src/**"], exclude: ["src/test/**"] } });
        expect(isPathCoveredByChangeEntity("src/test/app.test.ts", entity)).toBe(false);
    });
    it("returns false when entity has no scope", () => {
        const entity = makeChangeEntity({});
        expect(isPathCoveredByChangeEntity("src/app.ts", entity)).toBe(false);
    });
});
// ─── resolveEaWorkflowVariant ───────────────────────────────────────────────────
describe("resolveEaWorkflowVariant", () => {
    const policy = makePolicy();
    it("resolves feature variant", () => {
        const variant = resolveEaWorkflowVariant("feature", policy);
        expect(variant).not.toBeNull();
        expect(variant!.id).toBe("feature");
    });
    it("resolves chore variant", () => {
        const variant = resolveEaWorkflowVariant("chore", policy);
        expect(variant).not.toBeNull();
        expect(variant!.id).toBe("chore");
    });
    it("returns null for unknown type", () => {
        const variant = resolveEaWorkflowVariant("emergency", policy);
        expect(variant).toBeNull();
    });
});
// ─── isEaChoreEligible ──────────────────────────────────────────────────────────
describe("isEaChoreEligible", () => {
    it("returns eligible with conditions", () => {
        const policy = makePolicy();
        const result = isEaChoreEligible(policy);
        expect(result.eligible).toBe(true);
        expect(result.conditions).toContain("only-docs");
        expect(result.escalationRule).toBeTruthy();
    });
    it("returns not eligible when no choreEligibility", () => {
        const policy = makePolicy({ choreEligibility: undefined });
        const result = isEaChoreEligible(policy);
        expect(result.eligible).toBe(false);
        expect(result.conditions).toHaveLength(0);
    });
});
