import { describe, it, expect } from "vitest";
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
