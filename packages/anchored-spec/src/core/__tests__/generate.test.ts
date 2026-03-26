import { describe, it, expect } from "vitest";
import {
  generateRequirementsMarkdown,
  generateDecisionsMarkdown,
  generateChangesMarkdown,
  generateStatusMarkdown,
} from "../generate.js";
import type { Requirement, Decision, Change } from "../types.js";

const sampleReq: Requirement = {
  id: "REQ-1",
  title: "User Authentication",
  summary: "Users can authenticate with email and password.",
  priority: "must",
  status: "active",
  behaviorStatements: [
    {
      id: "BS-1",
      text: "When a user submits valid credentials, the system shall return an auth token.",
      format: "EARS",
      trigger: "user submits valid credentials",
      response: "the system shall return an auth token",
    },
    {
      id: "BS-2",
      text: "When a user submits invalid credentials, the system shall return a 401 error.",
      format: "EARS",
      trigger: "user submits invalid credentials",
      response: "the system shall return a 401 error",
    },
  ],
  semanticRefs: {
    interfaces: ["IAuthService"],
    routes: ["POST /api/v1/auth/login"],
    errorCodes: ["AUTH_INVALID_CREDENTIALS"],
  },
  traceRefs: [
    { path: "docs/specs/auth.md", role: "normative" },
  ],
  verification: {
    coverageStatus: "partial",
    testFiles: ["src/auth/__tests__/login.test.ts"],
  },
  owners: ["team-auth"],
};

const sampleDecision: Decision = {
  id: "ADR-1",
  title: "Use PostgreSQL",
  slug: "use-postgresql",
  status: "accepted",
  domain: "infra",
  decision: "We will use PostgreSQL as the primary database.",
  context: "Need a reliable relational database.",
  rationale: "Best balance of features and ecosystem.",
  alternatives: [
    { name: "MySQL", verdict: "rejected", reason: "Fewer features" },
  ],
  relatedRequirements: ["REQ-1"],
};

const sampleChange: Change = {
  id: "CHG-2025-0001-add-auth",
  title: "Add authentication",
  slug: "add-auth",
  type: "feature",
  phase: "implementation",
  status: "active",
  scope: { include: ["src/auth/**"] },
  requirements: ["REQ-1"],
  branch: "feat/auth",
  timestamps: { createdAt: "2025-01-01" },
  owners: ["team-auth"],
};

describe("generateRequirementsMarkdown", () => {
  it("generates markdown with header and table", () => {
    const md = generateRequirementsMarkdown([sampleReq]);
    expect(md).toContain("# Requirements");
    expect(md).toContain("REQ-1");
    expect(md).toContain("User Authentication");
    expect(md).toContain("BS-1");
    expect(md).toContain("BS-2");
    expect(md).toContain("IAuthService");
    expect(md).toContain("POST /api/v1/auth/login");
  });

  it("sorts by ID number", () => {
    const req2: Requirement = { ...sampleReq, id: "REQ-2", title: "Req Two" };
    const req10: Requirement = { ...sampleReq, id: "REQ-10", title: "Req Ten" };
    const md = generateRequirementsMarkdown([req10, req2]);
    const idx2 = md.indexOf("REQ-2");
    const idx10 = md.indexOf("REQ-10");
    expect(idx2).toBeLessThan(idx10);
  });
});

describe("generateDecisionsMarkdown", () => {
  it("generates markdown with decision details", () => {
    const md = generateDecisionsMarkdown([sampleDecision]);
    expect(md).toContain("# Architecture Decision Records");
    expect(md).toContain("ADR-1");
    expect(md).toContain("Use PostgreSQL");
    expect(md).toContain("MySQL");
    expect(md).toContain("rejected");
  });
});

describe("generateChangesMarkdown", () => {
  it("generates markdown table", () => {
    const md = generateChangesMarkdown([sampleChange]);
    expect(md).toContain("# Change Records");
    expect(md).toContain("CHG-2025-0001-add-auth");
    expect(md).toContain("feature");
    expect(md).toContain("REQ-1");
  });
});

describe("generateStatusMarkdown", () => {
  it("generates dashboard with counts", () => {
    const md = generateStatusMarkdown([sampleReq], [sampleChange], [sampleDecision]);
    expect(md).toContain("# Spec Status Dashboard");
    expect(md).toContain("Requirements");
    expect(md).toContain("Changes");
    expect(md).toContain("Decisions");
    expect(md).toContain("Coverage");
  });
});
