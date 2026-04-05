import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  runCli,
  writeManifestProject,
  writeTextFile,
} from "../../test-helpers/workspace.js";

const workspaces: string[] = [];

function makeWorkspace(prefix: string): string {
  const dir = createTestWorkspace(prefix);
  workspaces.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    cleanupTestWorkspace(dir);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────

function setupWorkspaceWithEntity(
  prefix: string,
  opts?: {
    traceRefs?: Array<{ path: string; role?: string }>;
    relations?: Array<{ type: string; target: string }>;
    additionalEntities?: Array<Parameters<typeof makeArtifact>[0]>;
    docs?: Array<{ path: string; content: string }>;
  },
) {
  const dir = makeWorkspace(prefix);

  const entities = [
    makeArtifact({
      id: "SVC-auth",
      kind: "service",
      status: "active",
      summary: "Authentication service for identity verification",
      traceRefs: opts?.traceRefs ?? [
        { path: "docs/auth-spec.md", role: "specification" },
      ],
      relations: opts?.relations ?? [],
    }),
    ...(opts?.additionalEntities ?? []).map((e) => makeArtifact(e)),
  ];

  writeManifestProject(dir, entities);

  for (const doc of opts?.docs ?? []) {
    writeTextFile(dir, doc.path, doc.content);
  }

  return dir;
}

/** Entity ref for SVC-auth after Backstage conversion */
const AUTH_REF = "component:auth";

// ─── Basic context assembly (backward compat) ─────────────────────────

describe("ea context — backward compatibility", () => {
  it("assembles context with default options (no tier)", () => {
    const dir = setupWorkspaceWithEntity("ctx-basic", {
      docs: [
        {
          path: "docs/auth-spec.md",
          content: "# Auth Specification\n\nAuthentication contract details.",
        },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.entity.entityRef).toContain("auth");
    expect(json.tracedDocs).toHaveLength(1);
    expect(json.tracedDocs[0].role).toBe("specification");
    expect(json.truncated).toBe(false);
    // No tier in output when none specified
    expect(json.tier).toBeUndefined();
    // No inclusionReason by default
    expect(json.tracedDocs[0].inclusionReason).toBeUndefined();
    // New fields present but empty
    expect(json.constraints).toEqual([]);
    expect(json.changeRisks).toEqual([]);
  });

  it("respects --max-tokens without a tier", () => {
    const dir = setupWorkspaceWithEntity("ctx-max-tokens", {
      docs: [
        {
          path: "docs/auth-spec.md",
          content: "x".repeat(10000),
        },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--max-tokens", "500"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.truncated).toBe(true);
    expect(json.tokenEstimate).toBeLessThanOrEqual(500);
  });

  it("respects --depth without a tier", () => {
    const dir = setupWorkspaceWithEntity("ctx-depth", {
      relations: [{ type: "dependsOn", target: "SVC-payments" }],
      additionalEntities: [
        {
          id: "SVC-payments",
          kind: "service",
          status: "active",
          relations: [{ type: "dependsOn", target: "SVC-ledger" }],
        },
        { id: "SVC-ledger", kind: "service", status: "active" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    // depth=0 → no related entities
    const r0 = runCli(["context", AUTH_REF, "--json", "--depth", "0"], dir);
    expect(r0.exitCode).toBe(0);
    const j0 = JSON.parse(r0.stdout);
    expect(j0.relatedEntities).toHaveLength(0);

    // depth=2 → payments + ledger
    const r2 = runCli(["context", AUTH_REF, "--json", "--depth", "2"], dir);
    expect(r2.exitCode).toBe(0);
    const j2 = JSON.parse(r2.stdout);
    expect(j2.relatedEntities.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Tier presets ─────────────────────────────────────────────────────

describe("ea context — tier presets", () => {
  it("--tier brief limits depth=0, maxTokens=2000, maxTracedDocs=3", () => {
    const dir = setupWorkspaceWithEntity("ctx-tier-brief", {
      traceRefs: [
        { path: "docs/auth-spec.md", role: "specification" },
        { path: "docs/auth-rationale.md", role: "rationale" },
        { path: "docs/auth-context.md", role: "context" },
        { path: "docs/auth-evidence.md", role: "evidence" },
      ],
      relations: [{ type: "dependsOn", target: "SVC-payments" }],
      additionalEntities: [
        { id: "SVC-payments", kind: "service", status: "active" },
      ],
      docs: [
        { path: "docs/auth-spec.md", content: "# Auth Specification" },
        { path: "docs/auth-rationale.md", content: "# Auth Rationale" },
        { path: "docs/auth-context.md", content: "# Auth Context" },
        { path: "docs/auth-evidence.md", content: "# Auth Evidence" },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "brief"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.tier).toBe("brief");
    // maxTracedDocs=3, so only 3 traced docs
    expect(json.tracedDocs.length).toBeLessThanOrEqual(3);
    // depth=0, so no related entities
    expect(json.relatedEntities).toHaveLength(0);
    // No constraints in brief
    expect(json.constraints).toEqual([]);
  });

  it("--tier standard includes constraints but not change risks", () => {
    const dir = setupWorkspaceWithEntity("ctx-tier-standard", {
      relations: [{ type: "dependsOn", target: "ADR-auth-protocol" }],
      additionalEntities: [
        {
          id: "ADR-auth-protocol",
          kind: "decision",
          status: "active",
          summary: "Use OAuth 2.0 for authentication",
        },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "standard"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.tier).toBe("standard");
    // Standard includes constraints
    expect(json.constraints.length).toBeGreaterThanOrEqual(1);
    expect(json.constraints[0].kind).toBe("Decision");
    // Standard does not include change risks
    expect(json.changeRisks).toEqual([]);
  });

  it("--tier deep includes both constraints and change risks", () => {
    const dir = setupWorkspaceWithEntity("ctx-tier-deep", {
      relations: [
        { type: "dependsOn", target: "ADR-auth-protocol" },
        { type: "dependsOn", target: "SVC-old-idp" },
      ],
      additionalEntities: [
        {
          id: "ADR-auth-protocol",
          kind: "decision",
          status: "active",
          summary: "Use OAuth 2.0 for authentication",
        },
        {
          id: "SVC-old-idp",
          kind: "service",
          status: "deprecated",
          summary: "Legacy identity provider",
        },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "deep"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.tier).toBe("deep");
    expect(json.constraints.length).toBeGreaterThanOrEqual(1);
    expect(json.changeRisks.length).toBeGreaterThanOrEqual(1);
    expect(json.changeRisks[0].type).toBe("deprecated-relation");
    expect(json.changeRisks[0].description).toContain("deprecated");
  });

  it("--tier llm uses LLM rendering by default", () => {
    const dir = setupWorkspaceWithEntity("ctx-tier-llm", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Specification\n\nContract body." }],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    // LLM rendering starts with `# Context:` and includes footer with Tier: llm
    expect(result.stdout).toContain("# Context:");
    expect(result.stdout).toContain("Tier: llm");
    expect(result.stdout).toContain("## Entity Specification");
    // LLM renders relations inline, not as chalk-formatted list items
    expect(result.stdout).toContain("**Entity Ref**");
  });

  it("--tier llm with --json still produces JSON", () => {
    const dir = setupWorkspaceWithEntity("ctx-tier-llm-json", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm", "--json"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.tier).toBe("llm");
  });

  it("rejects an invalid tier name", () => {
    const dir = setupWorkspaceWithEntity("ctx-tier-invalid", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "mega"], dir);
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── Override precedence ──────────────────────────────────────────────

describe("ea context — option override precedence", () => {
  it("--depth overrides tier depth", () => {
    const dir = setupWorkspaceWithEntity("ctx-override-depth", {
      relations: [{ type: "dependsOn", target: "SVC-payments" }],
      additionalEntities: [
        { id: "SVC-payments", kind: "service", status: "active" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    // brief has depth=0, but --depth 1 overrides
    const result = runCli(["context", AUTH_REF, "--json", "--tier", "brief", "--depth", "1"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.relatedEntities.length).toBeGreaterThanOrEqual(1);
  });

  it("--max-tokens overrides tier maxTokens", () => {
    const dir = setupWorkspaceWithEntity("ctx-override-tokens", {
      docs: [
        { path: "docs/auth-spec.md", content: "x".repeat(80000) },
      ],
    });

    // deep has no maxTokens, but --max-tokens overrides
    const result = runCli(["context", AUTH_REF, "--json", "--tier", "deep", "--max-tokens", "500"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.truncated).toBe(true);
    expect(json.tokenEstimate).toBeLessThanOrEqual(500);
  });

  it("--budget acts as alias for --max-tokens with --tier llm", () => {
    const dir = setupWorkspaceWithEntity("ctx-budget", {
      docs: [
        { path: "docs/auth-spec.md", content: "x".repeat(80000) },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "llm", "--budget", "500"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.truncated).toBe(true);
    expect(json.tokenEstimate).toBeLessThanOrEqual(500);
  });
});

// ─── --why-included ───────────────────────────────────────────────────

describe("ea context — --why-included", () => {
  it("includes inclusionReason in JSON output when flag is set", () => {
    const dir = setupWorkspaceWithEntity("ctx-why-json", {
      relations: [{ type: "dependsOn", target: "SVC-payments" }],
      additionalEntities: [
        { id: "SVC-payments", kind: "service", status: "active" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--why-included"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.tracedDocs[0].inclusionReason).toBeDefined();
    expect(json.tracedDocs[0].inclusionReason).toContain("direct traceRef");
    expect(json.relatedEntities[0].inclusionReason).toBeDefined();
    expect(json.relatedEntities[0].inclusionReason).toContain("relation");
  });

  it("omits inclusionReason in JSON output when flag is not set", () => {
    const dir = setupWorkspaceWithEntity("ctx-no-why-json", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.tracedDocs[0].inclusionReason).toBeUndefined();
  });

  it("renders inclusion rationale in markdown output", () => {
    const dir = setupWorkspaceWithEntity("ctx-why-md", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--why-included"], dir);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("Included because:");
    expect(result.stdout).toContain("direct traceRef");
  });

  it("includes constraint inclusionReason with tier that enables constraints", () => {
    const dir = setupWorkspaceWithEntity("ctx-why-constraints", {
      relations: [{ type: "dependsOn", target: "ADR-auth-protocol" }],
      additionalEntities: [
        {
          id: "ADR-auth-protocol",
          kind: "decision",
          status: "active",
          summary: "Use OAuth 2.0",
        },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(
      ["context", AUTH_REF, "--json", "--tier", "standard", "--why-included"],
      dir,
    );
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.constraints.length).toBeGreaterThanOrEqual(1);
    expect(json.constraints[0].inclusionReason).toContain("relation");
  });
});

// ─── --prefer-canonical ───────────────────────────────────────────────

describe("ea context — --prefer-canonical", () => {
  it("replaces derived doc with reference when canonical source is present", () => {
    const dir = setupWorkspaceWithEntity("ctx-canonical", {
      traceRefs: [
        { path: "docs/auth-spec.md", role: "specification" },
        { path: "docs/auth-derived.md", role: "context" },
      ],
      docs: [
        {
          path: "docs/auth-spec.md",
          content: "<!-- @anchored-spec:canonical -->\n# Auth Specification\n\nCanonical content.",
        },
        {
          path: "docs/auth-derived.md",
          content: '<!-- @anchored-spec:derived source="docs/auth-spec.md" -->\n# Auth Derived\n\nDerived content.',
        },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--prefer-canonical"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    // The canonical doc should be present in full
    const canonicalDoc = json.tracedDocs.find((d: { path: string }) => d.path === "docs/auth-spec.md");
    expect(canonicalDoc).toBeDefined();
    expect(canonicalDoc.content).toContain("Canonical content");

    // The derived doc should be reduced to a reference
    const derivedDoc = json.tracedDocs.find((d: { path: string }) => d.path === "docs/auth-derived.md");
    expect(derivedDoc).toBeDefined();
    expect(derivedDoc.content).toContain("See also:");
    expect(derivedDoc.content).toContain("derived from docs/auth-spec.md");
  });

  it("keeps derived doc when no canonical present", () => {
    const dir = setupWorkspaceWithEntity("ctx-canonical-no-match", {
      traceRefs: [
        { path: "docs/auth-spec.md", role: "specification" },
        { path: "docs/auth-derived.md", role: "context" },
      ],
      docs: [
        {
          path: "docs/auth-spec.md",
          content: "# Auth Spec\n\nNo canonical marker.",
        },
        {
          path: "docs/auth-derived.md",
          content: '<!-- @anchored-spec:derived source="docs/other-spec.md" -->\n# Derived\n\nDerived content.',
        },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--prefer-canonical"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    const derivedDoc = json.tracedDocs.find((d: { path: string }) => d.path === "docs/auth-derived.md");
    expect(derivedDoc.content).toContain("Derived content");
  });

  it("--tier llm enables preferCanonical automatically", () => {
    const dir = setupWorkspaceWithEntity("ctx-llm-canonical", {
      traceRefs: [
        { path: "docs/auth-spec.md", role: "specification" },
        { path: "docs/auth-derived.md", role: "context" },
      ],
      docs: [
        {
          path: "docs/auth-spec.md",
          content: "<!-- @anchored-spec:canonical -->\n# Auth Specification\n\nCanonical content.",
        },
        {
          path: "docs/auth-derived.md",
          content: '<!-- @anchored-spec:derived source="docs/auth-spec.md" -->\n# Auth Derived\n\nDerived content.',
        },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    const derivedDoc = json.tracedDocs.find((d: { path: string }) => d.path === "docs/auth-derived.md");
    expect(derivedDoc.content).toContain("See also:");
  });
});

// ─── --format option ──────────────────────────────────────────────────

describe("ea context — --format option", () => {
  it("--format json produces JSON output (alternative to --json)", () => {
    const dir = setupWorkspaceWithEntity("ctx-format-json", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--format", "json"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.entity.entityRef).toContain("auth");
  });

  it("--format markdown produces markdown output (default)", () => {
    const dir = setupWorkspaceWithEntity("ctx-format-md", {
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--format", "markdown"], dir);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("# Context:");
    expect(result.stdout).toContain("## Entity Specification");
  });
});

// ─── LLM rendering ───────────────────────────────────────────────────

describe("ea context — LLM rendering", () => {
  it("renders Primary Contract section for spec doc", () => {
    const dir = setupWorkspaceWithEntity("ctx-llm-contract", {
      docs: [
        {
          path: "docs/auth-spec.md",
          content: "# Auth Specification\n\nPrimary contract body.",
        },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("## Primary Contract");
    expect(result.stdout).toContain("Primary contract body");
  });

  it("renders Implementation References as compact list", () => {
    const dir = setupWorkspaceWithEntity("ctx-llm-impl", {
      traceRefs: [
        { path: "docs/auth-spec.md", role: "specification" },
        { path: "src/auth/handler.ts", role: "implementation" },
      ],
      docs: [
        { path: "docs/auth-spec.md", content: "# Auth Spec" },
        { path: "src/auth/handler.ts", content: "export function authenticate() {}" },
      ],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("## Implementation References");
    expect(result.stdout).toContain("src/auth/handler.ts");
    expect(result.stdout).toContain("role: implementation");
  });

  it("renders Related Entities with limit of 10 shown", () => {
    const additionalEntities = Array.from({ length: 12 }, (_, i) =>
      ({
        id: `SVC-dep-${i}`,
        kind: "service",
        status: "active" as const,
        summary: `Dependency service ${i}`,
      }),
    );
    const relations = additionalEntities.map((e) => ({
      type: "dependsOn",
      target: e.id,
    }));

    const dir = setupWorkspaceWithEntity("ctx-llm-related-limit", {
      relations,
      additionalEntities,
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    // Should mention "of 12" if there are more than 10
    expect(result.stdout).toContain("of 12");
    expect(result.stdout).toContain("highest relevance");
  });

  it("includes Change Risks section with --tier llm", () => {
    const dir = setupWorkspaceWithEntity("ctx-llm-risks", {
      relations: [{ type: "dependsOn", target: "SVC-deprecated" }],
      additionalEntities: [
        {
          id: "SVC-deprecated",
          kind: "service",
          status: "deprecated",
          summary: "Old legacy service",
        },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("## Change Risks");
    expect(result.stdout).toContain("deprecated");
  });

  it("renders Constraints section at the top in LLM mode", () => {
    const dir = setupWorkspaceWithEntity("ctx-llm-constraints", {
      relations: [{ type: "dependsOn", target: "REQ-auth-security" }],
      additionalEntities: [
        {
          id: "REQ-auth-security",
          kind: "requirement",
          status: "active",
          summary: "All auth flows must use TLS 1.3",
        },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--tier", "llm"], dir);
    expect(result.exitCode).toBe(0);

    const stdout = result.stdout;
    const constraintPos = stdout.indexOf("## Constraints");
    const entitySpecPos = stdout.indexOf("## Entity Specification");

    // Constraints should appear before Entity Specification in LLM mode
    expect(constraintPos).toBeGreaterThan(-1);
    expect(entitySpecPos).toBeGreaterThan(-1);
    expect(constraintPos).toBeLessThan(entitySpecPos);
    expect(stdout).toContain("read these first");
  });
});

// ─── Change Risks ─────────────────────────────────────────────────────

describe("ea context — change risks", () => {
  it("detects deprecated relations in deep tier", () => {
    const dir = setupWorkspaceWithEntity("ctx-risks-deep", {
      relations: [
        { type: "dependsOn", target: "SVC-active" },
        { type: "dependsOn", target: "SVC-old" },
      ],
      additionalEntities: [
        { id: "SVC-active", kind: "service", status: "active" },
        { id: "SVC-old", kind: "service", status: "deprecated", summary: "Old service" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "deep"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.changeRisks.length).toBe(1);
    expect(json.changeRisks[0].type).toBe("deprecated-relation");
    expect(json.changeRisks[0].description).toContain("component:default/old");
  });

  it("no change risks when no deprecated relations", () => {
    const dir = setupWorkspaceWithEntity("ctx-no-risks", {
      relations: [{ type: "dependsOn", target: "SVC-active" }],
      additionalEntities: [
        { id: "SVC-active", kind: "service", status: "active" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "deep"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.changeRisks).toEqual([]);
  });
});

// ─── Constraints ──────────────────────────────────────────────────────

describe("ea context — constraints", () => {
  it("finds Decision and Requirement entities within depth", () => {
    const dir = setupWorkspaceWithEntity("ctx-constraints-multi", {
      relations: [
        { type: "dependsOn", target: "ADR-oauth" },
        { type: "dependsOn", target: "REQ-tls" },
        { type: "dependsOn", target: "SVC-common" },
      ],
      additionalEntities: [
        { id: "ADR-oauth", kind: "decision", status: "active", summary: "Use OAuth" },
        { id: "REQ-tls", kind: "requirement", status: "active", summary: "Require TLS" },
        { id: "SVC-common", kind: "service", status: "active" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    const result = runCli(["context", AUTH_REF, "--json", "--tier", "standard"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    const constraintKinds = json.constraints.map((c: { kind: string }) => c.kind);
    expect(constraintKinds).toContain("Decision");
    expect(constraintKinds).toContain("Requirement");
    // Non-constraint entity should not be in constraints
    expect(constraintKinds).not.toContain("service");
  });

  it("does not include constraints when tier has includeConstraintBrief=false", () => {
    const dir = setupWorkspaceWithEntity("ctx-no-constraints", {
      relations: [{ type: "dependsOn", target: "ADR-oauth" }],
      additionalEntities: [
        { id: "ADR-oauth", kind: "decision", status: "active", summary: "Use OAuth" },
      ],
      docs: [{ path: "docs/auth-spec.md", content: "# Auth Spec" }],
    });

    // brief has includeConstraintBrief=false, but depth=0 so override depth to 1
    const result = runCli(["context", AUTH_REF, "--json", "--tier", "brief", "--depth", "1"], dir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.constraints).toEqual([]);
  });
});
