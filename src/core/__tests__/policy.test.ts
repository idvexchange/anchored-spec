import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  isTrivialPath,
  matchRules,
  isPathCoveredByChange,
  validateWorkflowEntry,
  resolveWorkflowVariant,
} from "../policy.js";
import type { WorkflowPolicy, Change } from "../types.js";

const testPolicy: WorkflowPolicy = {
  workflowVariants: [
    {
      id: "feature-behavior-first",
      name: "Feature (Behavior First)",
      defaultTypes: ["feature"],
      artifacts: ["requirements", "design-doc"],
    },
    {
      id: "fix-root-cause-first",
      name: "Fix (Root Cause First)",
      defaultTypes: ["fix"],
      artifacts: ["bugfix-spec"],
    },
    {
      id: "chore",
      name: "Chore",
      defaultTypes: ["chore"],
      artifacts: [],
      skipSkillSequence: true,
    },
  ],
  changeRequiredRules: [
    {
      id: "source-change",
      include: ["src/**"],
      exclude: ["src/**/*.test.*"],
    },
    {
      id: "config-change",
      include: ["*.config.*"],
    },
  ],
  trivialExemptions: ["README.md", "*.md", ".github/**"],
  lifecycleRules: {
    plannedToActiveRequiresChange: true,
    activeToShippedRequiresCoverage: true,
  },
};

// ─── isTrivialPath ─────────────────────────────────────────────────────────────

describe("isTrivialPath", () => {
  it("matches trivial paths", () => {
    expect(isTrivialPath("README.md", testPolicy)).toBe(true);
    expect(isTrivialPath("CONTRIBUTING.md", testPolicy)).toBe(true);
    expect(isTrivialPath(".github/workflows/ci.yml", testPolicy)).toBe(true);
  });

  it("does not match governed paths", () => {
    expect(isTrivialPath("src/index.ts", testPolicy)).toBe(false);
    expect(isTrivialPath("package.json", testPolicy)).toBe(false);
  });
});

// ─── matchRules ────────────────────────────────────────────────────────────────

describe("matchRules", () => {
  it("matches source files to source-change rule", () => {
    const rules = matchRules("src/index.ts", testPolicy.changeRequiredRules);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe("source-change");
  });

  it("excludes test files from source-change rule", () => {
    const rules = matchRules("src/utils.test.ts", testPolicy.changeRequiredRules);
    expect(rules).toHaveLength(0);
  });

  it("matches config files to config-change rule", () => {
    const rules = matchRules("eslint.config.js", testPolicy.changeRequiredRules);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe("config-change");
  });

  it("returns empty for unmatched paths", () => {
    const rules = matchRules("package.json", testPolicy.changeRequiredRules);
    expect(rules).toHaveLength(0);
  });
});

// ─── evaluatePolicy ────────────────────────────────────────────────────────────

describe("evaluatePolicy", () => {
  it("evaluates a mix of trivial and governed paths", () => {
    const result = evaluatePolicy(
      ["README.md", "src/index.ts", "src/utils.test.ts", "package.json"],
      testPolicy
    );
    expect(result.summary.totalPaths).toBe(4);
    expect(result.summary.trivialPaths).toBe(1); // README.md
    expect(result.summary.governedPaths).toBe(1); // src/index.ts
    expect(result.summary.ungoverned).toBe(2); // test + package.json
    expect(result.summary.matchedRules).toContain("source-change");
  });
});

// ─── isPathCoveredByChange ─────────────────────────────────────────────────────

describe("isPathCoveredByChange", () => {
  const change: Change = {
    id: "CHG-2025-0001-auth",
    title: "Auth feature",
    slug: "auth",
    type: "feature",
    phase: "implementation",
    status: "active",
    scope: { include: ["src/auth/**"], exclude: ["src/auth/test/**"] },
    branch: null,
    timestamps: { createdAt: "2025-01-01" },
    owners: ["team"],
  };

  it("matches paths in scope", () => {
    expect(isPathCoveredByChange("src/auth/login.ts", change)).toBe(true);
  });

  it("excludes paths in exclude scope", () => {
    expect(isPathCoveredByChange("src/auth/test/login.test.ts", change)).toBe(false);
  });

  it("does not match paths outside scope", () => {
    expect(isPathCoveredByChange("src/api/routes.ts", change)).toBe(false);
  });
});

// ─── validateWorkflowEntry ─────────────────────────────────────────────────────

describe("validateWorkflowEntry", () => {
  const activeChange: Change = {
    id: "CHG-2025-0001-auth",
    title: "Auth feature",
    slug: "auth",
    type: "feature",
    phase: "implementation",
    status: "active",
    scope: { include: ["src/**"] },
    branch: null,
    timestamps: { createdAt: "2025-01-01" },
    owners: ["team"],
  };

  it("passes when all governed paths are covered", () => {
    const result = validateWorkflowEntry(
      ["src/index.ts", "README.md"],
      testPolicy,
      [activeChange]
    );
    expect(result.valid).toBe(true);
    expect(result.uncoveredPaths).toHaveLength(0);
  });

  it("fails when governed paths are not covered", () => {
    const result = validateWorkflowEntry(
      ["src/index.ts"],
      testPolicy,
      [] // no active changes
    );
    expect(result.valid).toBe(false);
    expect(result.uncoveredPaths).toContain("src/index.ts");
  });

  it("ignores trivial paths", () => {
    const result = validateWorkflowEntry(
      ["README.md", ".github/ci.yml"],
      testPolicy,
      []
    );
    expect(result.valid).toBe(true);
  });
});

// ─── resolveWorkflowVariant ────────────────────────────────────────────────────

describe("resolveWorkflowVariant", () => {
  it("resolves feature type to feature-behavior-first", () => {
    const variant = resolveWorkflowVariant("feature", testPolicy);
    expect(variant?.id).toBe("feature-behavior-first");
  });

  it("resolves fix type to fix-root-cause-first", () => {
    const variant = resolveWorkflowVariant("fix", testPolicy);
    expect(variant?.id).toBe("fix-root-cause-first");
  });

  it("resolves chore type to chore variant", () => {
    const variant = resolveWorkflowVariant("chore", testPolicy);
    expect(variant?.id).toBe("chore");
    expect(variant?.skipSkillSequence).toBe(true);
  });

  it("returns null for unmatched type", () => {
    const variant = resolveWorkflowVariant("refactor", testPolicy);
    expect(variant).toBeNull();
  });
});
