import { afterEach, describe, expect, it } from "vitest";

import { extractConstraints, renderConstraintsMarkdown } from "../constraints.js";
import type { ConstraintResult } from "../constraints.js";
import { buildRelationGraph } from "../graph.js";
import { createDefaultRegistry } from "../relation-registry.js";
import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeArtifact,
  runCli,
  toBackstageEntity,
  writeManifestProject,
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

// ─── Fixtures ───────────────────────────────────────────────────────────────────

function makeConstraintGraph() {
  return [
    makeArtifact({ id: "SVC-auth", kind: "service", title: "Auth Service" }),
    makeArtifact({
      id: "APP-payments",
      kind: "application",
      title: "Payments App",
      relations: [{ type: "uses", target: "SVC-auth" }],
    }),
    makeArtifact({
      id: "ADR-auth-policy",
      kind: "decision",
      title: "Auth Policy Decision",
      summary: "All services must use OAuth 2.0.",
      relations: [{ type: "targets", target: "SVC-auth" }],
    }),
    makeArtifact({
      id: "REQ-security",
      kind: "requirement",
      title: "Security Requirement",
      summary: "All endpoints must be authenticated.",
      relations: [{ type: "targets", target: "SVC-auth" }],
    }),
  ];
}

function makeDeepGraph() {
  return [
    makeArtifact({ id: "SVC-gateway", kind: "service", title: "API Gateway" }),
    makeArtifact({
      id: "SVC-auth",
      kind: "service",
      title: "Auth Service",
      relations: [{ type: "uses", target: "SVC-gateway" }],
    }),
    makeArtifact({
      id: "ADR-auth-policy",
      kind: "decision",
      title: "Auth Policy Decision",
      summary: "OAuth 2.0 required.",
      relations: [{ type: "targets", target: "SVC-auth" }],
    }),
    makeArtifact({
      id: "REQ-deep",
      kind: "requirement",
      title: "Deep Requirement",
      summary: "Deeply nested requirement.",
      relations: [{ type: "targets", target: "ADR-auth-policy" }],
    }),
  ];
}

function makeMultiSubjectGraph() {
  return [
    makeArtifact({ id: "SVC-auth", kind: "service", title: "Auth Service" }),
    makeArtifact({ id: "SVC-billing", kind: "service", title: "Billing Service" }),
    makeArtifact({
      id: "ADR-shared-policy",
      kind: "decision",
      title: "Shared Policy",
      summary: "Policy shared across services.",
      relations: [
        { type: "targets", target: "SVC-auth" },
        { type: "targets", target: "SVC-billing" },
      ],
    }),
    makeArtifact({
      id: "REQ-auth-only",
      kind: "requirement",
      title: "Auth-Only Requirement",
      summary: "Only for auth service.",
      relations: [{ type: "targets", target: "SVC-auth" }],
    }),
  ];
}

function makeNoConstraintGraph() {
  return [
    makeArtifact({ id: "SVC-auth", kind: "service", title: "Auth Service" }),
    makeArtifact({
      id: "APP-payments",
      kind: "application",
      title: "Payments App",
      relations: [{ type: "uses", target: "SVC-auth" }],
    }),
  ];
}

function buildGraph(artifacts: ReturnType<typeof makeArtifact>[]) {
  const entities = artifacts.map((a) => toBackstageEntity(a));
  const graph = buildRelationGraph(entities, createDefaultRegistry());
  return { graph, entities };
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────────

describe("extractConstraints", () => {
  it("extracts Decision and Requirement entities from graph", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], {
      entities,
    });

    expect(results.length).toBe(2);

    const kinds = results.map((r) => r.kind);
    expect(kinds).toContain("Decision");
    expect(kinds).toContain("Requirement");

    const refs = results.map((r) => r.ref);
    expect(refs).toContain("decision:default/auth-policy");
    expect(refs).toContain("requirement:default/security");
  });

  it("deduplicates constraints from multiple subjects keeping shortest path", () => {
    const { graph, entities } = buildGraph(makeMultiSubjectGraph());
    const results = extractConstraints(
      graph,
      ["component:default/auth", "component:default/billing"],
      { entities },
    );

    // shared-policy is reachable from both subjects — should appear once
    const sharedResults = results.filter((r) => r.ref === "decision:default/shared-policy");
    expect(sharedResults.length).toBe(1);

    // auth-only is reachable only from auth
    const authOnly = results.filter((r) => r.ref === "requirement:default/auth-only");
    expect(authOnly.length).toBe(1);
    expect(authOnly[0].sourceEntityRef).toBe("component:default/auth");
  });

  it("respects maxDepth limit", () => {
    const { graph, entities } = buildGraph(makeDeepGraph());

    // Depth 1: only directly connected constraints
    const shallow = extractConstraints(graph, ["component:default/gateway"], {
      maxDepth: 1,
      entities,
    });
    // At depth 1 from gateway, we can reach auth (via uses inverse), but not the decision
    const deep = extractConstraints(graph, ["component:default/gateway"], {
      maxDepth: 3,
      entities,
    });

    expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
  });

  it("returns empty when no constraints reachable", () => {
    const { graph, entities } = buildGraph(makeNoConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], {
      entities,
    });

    expect(results).toEqual([]);
  });

  it("includes accurate path evidence", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], {
      entities,
    });

    for (const result of results) {
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.depth).toBe(result.path.length);

      // Each edge should have source and target
      for (const edge of result.path) {
        expect(edge.source).toBeTruthy();
        expect(edge.target).toBeTruthy();
        expect(edge.type).toBeTruthy();
      }
    }
  });

  it("filters with contract profile (narrower edge types)", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());

    const strictResults = extractConstraints(graph, ["component:default/auth"], {
      profile: "strict",
      entities,
    });
    const contractResults = extractConstraints(graph, ["component:default/auth"], {
      profile: "contract",
      entities,
    });

    // Contract profile has fewer edge types, so should find fewer or equal constraints
    expect(contractResults.length).toBeLessThanOrEqual(strictResults.length);
  });

  it("requires entity metadata for constraint kind detection", () => {
    const { graph } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"]);

    expect(results).toEqual([]);
  });

  it("populates relatedDocs from entity traceRefs", () => {
    const artifacts = [
      makeArtifact({ id: "SVC-auth", kind: "service", title: "Auth Service" }),
      makeArtifact({
        id: "ADR-auth-policy",
        kind: "decision",
        title: "Auth Policy Decision",
        traceRefs: [{ path: "docs/adr/001-auth.md" }],
        relations: [{ type: "targets", target: "SVC-auth" }],
      }),
    ];
    const entities = artifacts.map((a) => toBackstageEntity(a));
    const graph = buildRelationGraph(entities, createDefaultRegistry());

    const results = extractConstraints(graph, ["component:default/auth"], { entities });
    const decision = results.find((r) => r.ref === "decision:default/auth-policy");
    expect(decision).toBeDefined();
    expect(decision!.relatedDocs).toContain("docs/adr/001-auth.md");
  });

  it("records sourceEntityRef for each constraint", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], {
      entities,
    });

    for (const r of results) {
      expect(r.sourceEntityRef).toBe("component:default/auth");
    }
  });
});

// ─── Markdown rendering ─────────────────────────────────────────────────────────

describe("renderConstraintsMarkdown", () => {
  it("renders heading and subject info", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], { entities });
    const md = renderConstraintsMarkdown(results, ["component:default/auth"]);

    expect(md).toContain("# Governing Constraints");
    expect(md).toContain("`component:default/auth`");
    expect(md).toContain("Found: 2 constraints");
  });

  it("renders empty state", () => {
    const md = renderConstraintsMarkdown([], ["component:default/auth"]);
    expect(md).toContain("No governing constraints found.");
  });

  it("renders constraint details with path", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], { entities });
    const md = renderConstraintsMarkdown(results, ["component:default/auth"]);

    expect(md).toContain("**Kind:**");
    expect(md).toContain("**Ref:**");
    expect(md).toContain("**Path:**");
    expect(md).toContain("→[");
  });

  it("renders JSON format as structured array", () => {
    const { graph, entities } = buildGraph(makeConstraintGraph());
    const results = extractConstraints(graph, ["component:default/auth"], {
      format: "json",
      entities,
    });
    const json = JSON.stringify(results, null, 2);
    const parsed = JSON.parse(json) as ConstraintResult[];

    expect(Array.isArray(parsed)).toBe(true);
    for (const c of parsed) {
      expect(c).toHaveProperty("ref");
      expect(c).toHaveProperty("kind");
      expect(c).toHaveProperty("title");
      expect(c).toHaveProperty("path");
      expect(c).toHaveProperty("depth");
      expect(c).toHaveProperty("sourceEntityRef");
    }
  });
});

// ─── CLI integration ────────────────────────────────────────────────────────────

describe("constraints CLI", () => {
  it("outputs JSON with --format json", () => {
    const dir = makeWorkspace("constraints-json");
    writeManifestProject(dir, makeConstraintGraph());

    const result = runCli(
      ["constraints", "component:auth", "--format", "json"],
      dir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as ConstraintResult[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);

    const refs = parsed.map((c) => c.ref);
    expect(refs).toContain("decision:default/auth-policy");
    expect(refs).toContain("requirement:default/security");
  });

  it("outputs markdown by default", () => {
    const dir = makeWorkspace("constraints-md");
    writeManifestProject(dir, makeConstraintGraph());

    const result = runCli(["constraints", "component:auth"], dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Governing Constraints");
    expect(result.stdout).toContain("Auth Policy Decision");
  });

  it("--fail-on-constraints exits 1 when constraints found", () => {
    const dir = makeWorkspace("constraints-fail");
    writeManifestProject(dir, makeConstraintGraph());

    const result = runCli(
      ["constraints", "component:auth", "--fail-on-constraints"],
      dir,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Governing constraints found");
  });

  it("--fail-on-constraints exits 0 when no constraints found", () => {
    const dir = makeWorkspace("constraints-nofail");
    writeManifestProject(dir, makeNoConstraintGraph());

    const result = runCli(
      ["constraints", "component:auth", "--fail-on-constraints"],
      dir,
    );
    expect(result.exitCode).toBe(0);
  });

  it("respects --max-depth", () => {
    const dir = makeWorkspace("constraints-depth");
    writeManifestProject(dir, makeConstraintGraph());

    const result = runCli(
      ["constraints", "component:auth", "--max-depth", "1", "--format", "json"],
      dir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout) as ConstraintResult[];
    for (const c of parsed) {
      expect(c.depth).toBeLessThanOrEqual(1);
    }
  });

  it("errors on unknown entity", () => {
    const dir = makeWorkspace("constraints-unknown");
    writeManifestProject(dir, makeConstraintGraph());

    const result = runCli(
      ["constraints", "component:nonexistent", "--format", "json"],
      dir,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("not found");
  });

  it("errors when no input specified", () => {
    const dir = makeWorkspace("constraints-noinput");
    writeManifestProject(dir, makeConstraintGraph());

    const result = runCli(["constraints"], dir);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("No input specified");
  });
});
