import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  validateSchema,
  validateRequirement,
  validateWorkflowPolicy,
  checkRequirementQuality,
  checkPolicyQuality,
} from "../validate.js";
import type { Requirement, WorkflowPolicy } from "../types.js";

// ─── Requirement Schema Validation ─────────────────────────────────────────────

describe("validateSchema — requirement", () => {
  const validRequirement = {
    id: "REQ-1",
    title: "User can log in",
    summary: "Users can authenticate with email and password.",
    priority: "must",
    status: "draft",
    behaviorStatements: [
      {
        id: "BS-1",
        text: "When a user submits valid credentials, the system shall return an auth token.",
        format: "EARS",
        trigger: "user submits valid credentials",
        response: "the system shall return an auth token",
      },
    ],
    owners: ["team-auth"],
    docSource: "canonical-json",
  };

  it("accepts a valid requirement", () => {
    const result = validateSchema(validRequirement, "requirement");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects missing required fields", () => {
    const result = validateSchema({ id: "REQ-1" }, "requirement");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid ID format", () => {
    const result = validateSchema(
      { ...validRequirement, id: "INVALID" },
      "requirement"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects empty behavior statements", () => {
    const result = validateSchema(
      { ...validRequirement, behaviorStatements: [] },
      "requirement"
    );
    expect(result.valid).toBe(false);
  });

  it("rejects invalid priority", () => {
    const result = validateSchema(
      { ...validRequirement, priority: "high" },
      "requirement"
    );
    expect(result.valid).toBe(false);
  });

  it("accepts all valid statuses", () => {
    for (const status of ["draft", "planned", "active", "deferred"]) {
      const result = validateSchema(
        { ...validRequirement, status },
        "requirement"
      );
      expect(result.valid).toBe(true);
    }
    // shipped requires coverage
    const shipped = validateSchema(
      {
        ...validRequirement,
        status: "shipped",
        verification: { coverageStatus: "full" },
      },
      "requirement"
    );
    expect(shipped.valid).toBe(true);
    // deprecated requires reason or supersededBy
    const deprecated = validateSchema(
      {
        ...validRequirement,
        status: "deprecated",
        statusReason: "No longer needed",
      },
      "requirement"
    );
    expect(deprecated.valid).toBe(true);
  });
});

// ─── Change Schema Validation ──────────────────────────────────────────────────

describe("validateSchema — change", () => {
  const validChange = {
    id: "CHG-2025-0001-add-login",
    title: "Add login feature",
    slug: "add-login",
    type: "feature",
    workflowVariant: "feature-behavior-first",
    phase: "design",
    status: "active",
    scope: { include: ["src/auth/**"] },
    requirements: ["REQ-1"],
    branch: null,
    timestamps: { createdAt: "2025-01-01" },
    owners: ["team-auth"],
    docSource: "canonical-json",
  };

  it("accepts a valid change", () => {
    const result = validateSchema(validChange, "change");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid ID format", () => {
    const result = validateSchema(
      { ...validChange, id: "CHG-bad" },
      "change"
    );
    expect(result.valid).toBe(false);
  });

  it("requires workflowVariant for non-chore types", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { workflowVariant: _, ...noVariant } = validChange;
    const result = validateSchema(noVariant, "change");
    expect(result.valid).toBe(false);
  });

  it("does not require workflowVariant for chore", () => {
    const chore = {
      id: "CHG-2025-0002-update-deps",
      title: "Update dependencies",
      slug: "update-deps",
      type: "chore",
      phase: "implementation",
      status: "active",
      scope: { include: ["package.json"] },
      branch: null,
      timestamps: { createdAt: "2025-01-01" },
      owners: ["team"],
      docSource: "canonical-json",
    };
    const result = validateSchema(chore, "change");
    expect(result.valid).toBe(true);
  });

  it("requires bugfixSpec for fix type", () => {
    const fix = {
      ...validChange,
      id: "CHG-2025-0003-fix-login",
      slug: "fix-login",
      type: "fix",
      workflowVariant: "fix-root-cause-first",
    };
    const result = validateSchema(fix, "change");
    expect(result.valid).toBe(false);
  });
});

// ─── Decision Schema Validation ────────────────────────────────────────────────

describe("validateSchema — decision", () => {
  const validDecision = {
    id: "ADR-1",
    title: "Use PostgreSQL for persistence",
    slug: "use-postgresql",
    status: "accepted",
    domain: "infra",
    decision: "We will use PostgreSQL as the primary database.",
    context: "We need a reliable relational database for our data model.",
    rationale: "PostgreSQL offers the best balance of features, performance, and ecosystem.",
    alternatives: [
      { name: "MySQL", verdict: "rejected", reason: "Fewer advanced features" },
      { name: "MongoDB", verdict: "rejected", reason: "Not relational" },
    ],
    relatedRequirements: ["REQ-1"],
    docSource: "canonical-json",
  };

  it("accepts a valid decision", () => {
    const result = validateSchema(validDecision, "decision");
    expect(result.valid).toBe(true);
  });

  it("requires supersededBy when status is superseded", () => {
    const result = validateSchema(
      { ...validDecision, status: "superseded" },
      "decision"
    );
    expect(result.valid).toBe(false);
  });

  it("accepts superseded with supersededBy", () => {
    const result = validateSchema(
      { ...validDecision, status: "superseded", supersededBy: "ADR-2" },
      "decision"
    );
    expect(result.valid).toBe(true);
  });
});

// ─── Workflow Policy Schema Validation ─────────────────────────────────────────

describe("validateSchema — workflow-policy", () => {
  const validPolicy = {
    workflowVariants: [
      {
        id: "feature-behavior-first",
        name: "Feature (Behavior First)",
        defaultTypes: ["feature"],
        artifacts: ["requirements", "design-doc"],
      },
    ],
    changeRequiredRules: [
      {
        id: "source-change",
        include: ["src/**"],
      },
    ],
    trivialExemptions: ["README.md"],
    lifecycleRules: {
      plannedToActiveRequiresChange: true,
      activeToShippedRequiresCoverage: true,
    },
  };

  it("accepts a valid policy", () => {
    const result = validateSchema(validPolicy, "workflow-policy");
    expect(result.valid).toBe(true);
  });

  it("rejects empty workflow variants", () => {
    const result = validateSchema(
      { ...validPolicy, workflowVariants: [] },
      "workflow-policy"
    );
    expect(result.valid).toBe(false);
  });
});

// ─── Requirement Quality Checks ────────────────────────────────────────────────

describe("checkRequirementQuality", () => {
  const baseReq: Requirement = {
    id: "REQ-1",
    title: "Test requirement",
    summary: "A test requirement for quality checks.",
    priority: "must",
    status: "active",
    behaviorStatements: [
      {
        id: "BS-1",
        text: "When a user clicks submit, the system shall save the form data.",
        format: "EARS",
        trigger: "user clicks submit",
        response: "the system shall save the form data",
      },
    ],
    owners: ["team"],
    semanticRefs: {
      interfaces: ["IFormService"],
      routes: ["POST /api/v1/forms"],
    },
    traceRefs: [{ path: "docs/specs/api.md", role: "normative" }],
  };

  it("returns no issues for a well-formed requirement", () => {
    const issues = checkRequirementQuality(baseReq);
    expect(issues).toHaveLength(0);
  });

  it("detects vague language", () => {
    const req: Requirement = {
      ...baseReq,
      behaviorStatements: [
        {
          id: "BS-1",
          text: "The system should work properly when users submit forms.",
          format: "EARS",
          response: "the system should work properly",
        },
      ],
    };
    const issues = checkRequirementQuality(req);
    expect(issues.some((i) => i.rule === "quality:no-vague-language")).toBe(true);
  });

  it("detects Express-style route params", () => {
    const req: Requirement = {
      ...baseReq,
      semanticRefs: {
        routes: ["GET /api/v1/users/:id"],
      },
    };
    const issues = checkRequirementQuality(req);
    expect(issues.some((i) => i.rule === "quality:route-format")).toBe(true);
  });

  it("warns about missing semantic refs on active requirements", () => {
    const req: Requirement = {
      ...baseReq,
      semanticRefs: {},
    };
    const issues = checkRequirementQuality(req);
    expect(issues.some((i) => i.rule === "quality:semantic-refs-populated")).toBe(true);
  });

  it("warns about missing trace refs on non-draft requirements", () => {
    const req: Requirement = {
      ...baseReq,
      traceRefs: [],
    };
    const issues = checkRequirementQuality(req);
    expect(issues.some((i) => i.rule === "quality:trace-refs-required")).toBe(true);
  });
});

// ─── Full Validation ───────────────────────────────────────────────────────────

describe("validateRequirement", () => {
  it("combines schema and quality validation", () => {
    const req = {
      id: "REQ-1",
      title: "Test requirement",
      summary: "A test requirement that should work properly.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "The system should work properly.",
          format: "EARS",
          response: "the system should work properly",
        },
      ],
      owners: ["team"],
    };
    const result = validateRequirement(req);
    expect(result.valid).toBe(true); // Schema valid
    expect(result.warnings.length).toBeGreaterThan(0); // Quality warnings
  });
});

// ─── Duplicate BS ID Detection ─────────────────────────────────────────────────

describe("checkRequirementQuality — duplicate BS IDs", () => {
  it("detects duplicate behavior statement IDs", () => {
    const req: Requirement = {
      id: "REQ-1",
      title: "Test requirement",
      summary: "Testing duplicate BS IDs.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When event A occurs, the system shall do X.",
          format: "EARS",
          trigger: "event A occurs",
          response: "the system shall do X",
        },
        {
          id: "BS-1",
          text: "When event B occurs, the system shall do Y.",
          format: "EARS",
          trigger: "event B occurs",
          response: "the system shall do Y",
        },
      ],
      owners: ["team"],
    };
    const issues = checkRequirementQuality(req);
    expect(issues.some((i) => i.rule === "quality:unique-bs-ids")).toBe(true);
  });

  it("allows unique behavior statement IDs", () => {
    const req: Requirement = {
      id: "REQ-1",
      title: "Test requirement",
      summary: "Testing unique BS IDs.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When event A occurs, the system shall do X.",
          format: "EARS",
          trigger: "event A occurs",
          response: "the system shall do X",
        },
        {
          id: "BS-2",
          text: "When event B occurs, the system shall do Y.",
          format: "EARS",
          trigger: "event B occurs",
          response: "the system shall do Y",
        },
      ],
      owners: ["team"],
    };
    const issues = checkRequirementQuality(req);
    expect(issues.some((i) => i.rule === "quality:unique-bs-ids")).toBe(false);
  });
});

// ─── Policy Quality Checks ─────────────────────────────────────────────────────

describe("checkPolicyQuality", () => {
  it("detects duplicate workflow variant IDs", () => {
    const policy: WorkflowPolicy = {
      workflowVariants: [
        { id: "feature", name: "Feature", defaultTypes: ["feature"], artifacts: [] },
        { id: "feature", name: "Feature Dup", defaultTypes: ["refactor"], artifacts: [] },
      ],
      changeRequiredRules: [],
      trivialExemptions: [],
      lifecycleRules: {},
    };
    const issues = checkPolicyQuality(policy);
    expect(issues.some((i) => i.rule === "quality:unique-variant-ids")).toBe(true);
  });

  it("detects duplicate change-required rule IDs", () => {
    const policy: WorkflowPolicy = {
      workflowVariants: [
        { id: "feature", name: "Feature", defaultTypes: ["feature"], artifacts: [] },
      ],
      changeRequiredRules: [
        { id: "source", include: ["src/**"] },
        { id: "source", include: ["lib/**"] },
      ],
      trivialExemptions: [],
      lifecycleRules: {},
    };
    const issues = checkPolicyQuality(policy);
    expect(issues.some((i) => i.rule === "quality:unique-rule-ids")).toBe(true);
  });

  it("passes with unique IDs", () => {
    const policy: WorkflowPolicy = {
      workflowVariants: [
        { id: "feature", name: "Feature", defaultTypes: ["feature"], artifacts: [] },
        { id: "fix", name: "Fix", defaultTypes: ["fix"], artifacts: [] },
      ],
      changeRequiredRules: [
        { id: "source", include: ["src/**"] },
        { id: "lib", include: ["lib/**"] },
      ],
      trivialExemptions: [],
      lifecycleRules: {},
    };
    const issues = checkPolicyQuality(policy);
    expect(issues).toHaveLength(0);
  });
});

// ─── validateWorkflowPolicy with quality checks ───────────────────────────────

describe("validateWorkflowPolicy", () => {
  it("catches duplicate variant IDs as errors", () => {
    const policy = {
      workflowVariants: [
        { id: "feature", name: "Feature", defaultTypes: ["feature"], artifacts: [] },
        { id: "feature", name: "Feature Dup", defaultTypes: ["refactor"], artifacts: [] },
      ],
      changeRequiredRules: [],
      trivialExemptions: [],
      lifecycleRules: {},
    };
    const result = validateWorkflowPolicy(policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.rule === "quality:unique-variant-ids")).toBe(true);
  });
});

// ─── Decision Schema Edge Cases ────────────────────────────────────────────────

describe("validateSchema — decision edge cases", () => {
  it("rejects empty alternatives array", () => {
    const decision = {
      id: "ADR-1",
      title: "Decision with no alternatives",
      slug: "no-alternatives",
      status: "accepted",
      decision: "We decided something without considering alternatives.",
      context: "Some context for the decision.",
      rationale: "Some rationale for the decision.",
      alternatives: [],
      relatedRequirements: [],
    };
    const result = validateSchema(decision, "decision");
    expect(result.valid).toBe(false);
  });
});

// ─── Shipped Requirement Edge Cases ────────────────────────────────────────────

describe("validateSchema — shipped requirement edge cases", () => {
  it("rejects shipped requirement with coverage: none", () => {
    const req = {
      id: "REQ-1",
      title: "Shipped with no coverage",
      summary: "A shipped requirement that has no test coverage.",
      priority: "must",
      status: "shipped",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When triggered, the system shall respond.",
          format: "EARS",
          response: "the system shall respond",
        },
      ],
      owners: ["team"],
      verification: { coverageStatus: "none" },
    };
    const result = validateSchema(req, "requirement");
    expect(result.valid).toBe(false);
  });

  it("accepts shipped requirement with partial coverage", () => {
    const req = {
      id: "REQ-1",
      title: "Shipped with partial coverage",
      summary: "A shipped requirement that has partial test coverage.",
      priority: "must",
      status: "shipped",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When triggered, the system shall respond.",
          format: "EARS",
          response: "the system shall respond",
        },
      ],
      owners: ["team"],
      verification: { coverageStatus: "partial" },
    };
    const result = validateSchema(req, "requirement");
    expect(result.valid).toBe(true);
  });
});

// ─── Schema Version & Extensions ──────────────────────────────────────────────

describe("schemaVersion support", () => {
  const baseReq = {
    id: "REQ-1",
    title: "Test requirement",
    summary: "Test summary for validation.",
    priority: "must",
    status: "draft",
    behaviorStatements: [
      {
        id: "BS-1",
        text: "When triggered, the system shall respond.",
        format: "EARS",
        trigger: "triggered",
        response: "the system shall respond",
      },
    ],
    owners: ["team"],
    docSource: "canonical-json",
  };

  it("accepts requirement with schemaVersion", () => {
    const result = validateSchema({ ...baseReq, schemaVersion: "0.2.0" }, "requirement");
    expect(result.valid).toBe(true);
  });

  it("accepts requirement without schemaVersion (optional)", () => {
    const result = validateSchema(baseReq, "requirement");
    expect(result.valid).toBe(true);
  });

  it("accepts change with schemaVersion", () => {
    const change = {
      id: "CHG-2025-0001-test-ver",
      title: "Test change for version",
      slug: "test-ver",
      type: "feature",
      workflowVariant: "feature-behavior-first",
      phase: "design",
      status: "active",
      scope: { include: ["src/"] },
      requirements: ["REQ-1"],
      branch: null,
      timestamps: { createdAt: "2025-01-01" },
      owners: ["team"],
      docSource: "canonical-json",
      schemaVersion: "0.2.0",
    };
    const result = validateSchema(change, "change");
    expect(result.valid).toBe(true);
  });

  it("accepts decision with schemaVersion", () => {
    const decision = {
      id: "ADR-1",
      title: "Test decision for versioning",
      slug: "test-decision",
      status: "accepted",
      decision: "We decided to use X for versioning.",
      context: "Because Y needed proper version tracking.",
      rationale: "Z was better suited for our workflow.",
      alternatives: [{ name: "Alt", verdict: "rejected", reason: "Not applicable" }],
      relatedRequirements: [],
      docSource: "canonical-json",
      schemaVersion: "0.2.0",
    };
    const result = validateSchema(decision, "decision");
    expect(result.valid).toBe(true);
  });

  it("accepts workflow-policy with schemaVersion", () => {
    const policy = {
      schemaVersion: "0.2.0",
      workflowVariants: [
        {
          id: "feature",
          name: "Feature",
          defaultTypes: ["feature"],
          artifacts: ["requirements"],
        },
      ],
      changeRequiredRules: [],
      trivialExemptions: [],
      lifecycleRules: {},
    };
    const result = validateSchema(policy, "workflow-policy");
    expect(result.valid).toBe(true);
  });
});

describe("extensions support", () => {
  const baseReq = {
    id: "REQ-1",
    title: "Test requirement",
    summary: "Test summary for validation.",
    priority: "must",
    status: "draft",
    behaviorStatements: [
      {
        id: "BS-1",
        text: "When triggered, the system shall respond.",
        format: "EARS",
        trigger: "triggered",
        response: "the system shall respond",
      },
    ],
    owners: ["team"],
    docSource: "canonical-json",
  };

  it("accepts requirement with extensions", () => {
    const result = validateSchema(
      { ...baseReq, extensions: { myTool: { enabled: true } } },
      "requirement"
    );
    expect(result.valid).toBe(true);
  });

  it("accepts empty extensions", () => {
    const result = validateSchema({ ...baseReq, extensions: {} }, "requirement");
    expect(result.valid).toBe(true);
  });

  it("round-trips extensions through validation", () => {
    const data = { ...baseReq, extensions: { jira: { issueKey: "PROJ-123" }, custom: [1, 2, 3] } };
    const result = validateSchema(data, "requirement");
    expect(result.valid).toBe(true);
    expect((data.extensions as Record<string, Record<string, unknown>>).jira.issueKey).toBe("PROJ-123");
  });

  it("accepts change with extensions", () => {
    const change = {
      id: "CHG-2025-0001-ext-test",
      title: "Test extensions on change",
      slug: "ext-test",
      type: "feature",
      workflowVariant: "feature-behavior-first",
      phase: "design",
      status: "active",
      scope: { include: ["src/"] },
      requirements: ["REQ-1"],
      branch: null,
      timestamps: { createdAt: "2025-01-01" },
      owners: ["team"],
      docSource: "canonical-json",
      extensions: { github: { prNumber: 42 } },
    };
    const result = validateSchema(change, "change");
    expect(result.valid).toBe(true);
  });

  it("accepts decision with extensions", () => {
    const decision = {
      id: "ADR-1",
      title: "Test decision with extensions",
      slug: "test-decision-ext",
      status: "accepted",
      decision: "We decided to use X for this test.",
      context: "Because Y needed proper extension support.",
      rationale: "Z was better suited for our extension needs.",
      alternatives: [{ name: "Alt", verdict: "rejected", reason: "Not applicable" }],
      relatedRequirements: [],
      docSource: "canonical-json",
      extensions: { jira: { issueKey: "PROJ-456" }, custom: { flag: true } },
    };
    const result = validateSchema(decision, "decision");
    expect(result.valid).toBe(true);
  });

  it("rejects extensions on workflow-policy (not allowed)", () => {
    const policy = {
      workflowVariants: [
        {
          id: "feature",
          name: "Feature",
          defaultTypes: ["feature"],
          artifacts: ["requirements"],
        },
      ],
      changeRequiredRules: [],
      trivialExemptions: [],
      lifecycleRules: {},
      extensions: { bad: true },
    };
    const result = validateSchema(policy, "workflow-policy");
    expect(result.valid).toBe(false);
  });
});

// ─── Test Kind Coverage Check ─────────────────────────────────────────────────

describe("quality:test-kind-coverage", () => {
  const makeReq = (overrides: Partial<Requirement>): Requirement =>
    ({
      id: "REQ-1",
      title: "Test requirement",
      summary: "Test summary for validation.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When triggered, the system shall produce an observable result.",
          format: "EARS",
          trigger: "triggered",
          response: "the system shall produce an observable result",
        },
      ],
      owners: ["team"],
      traceRefs: [{ path: "docs/arch.md", role: "architecture" }],
      semanticRefs: { interfaces: ["IFoo"], routes: [], errorCodes: [], symbols: [] },
      docSource: "canonical-json",
      ...overrides,
    }) as Requirement;

  it("reports missing test kind for active requirement", () => {
    const req = makeReq({
      verification: {
        requiredTestKinds: ["unit", "integration"],
        coverageStatus: "partial",
        testRefs: [{ kind: "unit", path: "tests/foo.test.ts" }],
      },
    });
    const issues = checkRequirementQuality(req);
    const tkIssues = issues.filter((i) => i.rule === "quality:test-kind-coverage");
    expect(tkIssues).toHaveLength(1);
    expect(tkIssues[0].message).toContain("integration");
  });

  it("passes when all required kinds covered", () => {
    const req = makeReq({
      verification: {
        requiredTestKinds: ["unit"],
        coverageStatus: "full",
        testRefs: [{ kind: "unit", path: "tests/foo.test.ts" }],
      },
    });
    const issues = checkRequirementQuality(req);
    const tkIssues = issues.filter((i) => i.rule === "quality:test-kind-coverage");
    expect(tkIssues).toHaveLength(0);
  });

  it("reports error (not warning) for shipped requirement", () => {
    const req = makeReq({
      status: "shipped",
      verification: {
        requiredTestKinds: ["unit", "e2e"],
        coverageStatus: "partial",
        testRefs: [{ kind: "unit", path: "tests/foo.test.ts" }],
      },
    });
    const issues = checkRequirementQuality(req);
    const tkIssues = issues.filter((i) => i.rule === "quality:test-kind-coverage");
    expect(tkIssues).toHaveLength(1);
    expect(tkIssues[0].severity).toBe("error");
  });

  it("skips check for draft requirements", () => {
    const req = makeReq({
      status: "draft",
      verification: {
        requiredTestKinds: ["unit"],
        coverageStatus: "none",
        testRefs: [],
      },
    });
    const issues = checkRequirementQuality(req);
    const tkIssues = issues.filter((i) => i.rule === "quality:test-kind-coverage");
    expect(tkIssues).toHaveLength(0);
  });

  it("skips check when no requiredTestKinds", () => {
    const req = makeReq({
      verification: {
        coverageStatus: "full",
        testRefs: [{ kind: "unit", path: "tests/foo.test.ts" }],
      },
    });
    const issues = checkRequirementQuality(req);
    const tkIssues = issues.filter((i) => i.rule === "quality:test-kind-coverage");
    expect(tkIssues).toHaveLength(0);
  });
});

// ─── File Path Existence Check ────────────────────────────────────────────────

import { checkFilePaths } from "../validate.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("checkFilePaths", () => {
  const tmpRoot = join(tmpdir(), "anchored-spec-fp-test-" + process.pid);

  const makeReq = (overrides: Partial<Requirement>): Requirement =>
    ({
      id: "REQ-1",
      title: "Test requirement",
      summary: "Test summary for validation.",
      priority: "must",
      status: "active",
      behaviorStatements: [],
      owners: ["team"],
      docSource: "canonical-json",
      ...overrides,
    }) as Requirement;

  beforeAll(() => {
    mkdirSync(join(tmpRoot, "tests"), { recursive: true });
    mkdirSync(join(tmpRoot, "docs"), { recursive: true });
    writeFileSync(join(tmpRoot, "tests/foo.test.ts"), "test");
    writeFileSync(join(tmpRoot, "docs/arch.md"), "arch");
  });

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns no issues when all paths exist", () => {
    const req = makeReq({
      verification: {
        coverageStatus: "full",
        testRefs: [{ kind: "unit", path: "tests/foo.test.ts" }],
        testFiles: ["tests/foo.test.ts"],
      },
      traceRefs: [{ path: "docs/arch.md", role: "architecture" }],
    });
    const issues = checkFilePaths([req], tmpRoot);
    expect(issues).toHaveLength(0);
  });

  it("reports missing testRef path", () => {
    const req = makeReq({
      verification: {
        coverageStatus: "partial",
        testRefs: [{ kind: "unit", path: "tests/missing.test.ts" }],
      },
    });
    const issues = checkFilePaths([req], tmpRoot);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe("quality:file-path-exists");
    expect(issues[0].message).toContain("missing.test.ts");
  });

  it("reports missing traceRef path", () => {
    const req = makeReq({
      traceRefs: [{ path: "docs/nonexistent.md", role: "architecture" }],
    });
    const issues = checkFilePaths([req], tmpRoot);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("nonexistent.md");
  });

  it("reports missing testFiles path", () => {
    const req = makeReq({
      verification: {
        coverageStatus: "partial",
        testFiles: ["tests/gone.test.ts"],
      },
    });
    const issues = checkFilePaths([req], tmpRoot);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("gone.test.ts");
  });

  it("handles requirement with no paths", () => {
    const req = makeReq({});
    const issues = checkFilePaths([req], tmpRoot);
    expect(issues).toHaveLength(0);
  });
});

// ─── BUG-1: executionPolicy in schema ───────────────────────────────────────────

describe("executionPolicy schema validation", () => {
  it("accepts requirement with executionPolicy", () => {
    const req = {
      id: "REQ-1",
      title: "Test requirement",
      summary: "A test requirement for execution policy.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        { id: "BS-1", text: "When evidence is required, the system shall collect it.", format: "EARS", response: "the system shall collect it" },
      ],
      owners: ["team"],
      docSource: "canonical-json",
      verification: {
        coverageStatus: "full",
        executionPolicy: {
          requiresEvidence: true,
          requiredKinds: ["unit", "integration"],
        },
      },
    };
    const result = validateSchema(req, "requirement");
    expect(result.valid).toBe(true);
  });

  it("rejects unknown fields inside executionPolicy", () => {
    const req = {
      id: "REQ-1",
      title: "Test requirement",
      summary: "A test requirement for execution policy.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        { id: "BS-1", text: "When evidence is required, the system shall reject unknowns.", format: "EARS", response: "the system shall reject unknowns" },
      ],
      owners: ["team"],
      docSource: "canonical-json",
      verification: {
        executionPolicy: {
          requiresEvidence: true,
          unknownField: "bad",
        },
      },
    };
    const result = validateSchema(req, "requirement");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("additional"))).toBe(true);
  });
});
