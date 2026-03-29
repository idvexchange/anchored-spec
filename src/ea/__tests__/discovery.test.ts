/**
 * EA Discovery Pipeline — Tests
 *
 * Tests for:
 * - matchDraftToExisting() — anchor and title deduplication
 * - discoverArtifacts() — full pipeline with dry-run and write
 * - createDraft() — helper function
 * - renderDiscoveryReportMarkdown() — report rendering
 * - CLI: ea discover
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  matchDraftToExisting,
  discoverArtifacts,
  createDraft,
  renderDiscoveryReportMarkdown,
} from "../discovery.js";
import type {
  EaArtifactDraft,
  DiscoveryReport,
} from "../discovery.js";
import type { EaArtifactBase } from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<EaArtifactBase> & { id: string; kind: string }): EaArtifactBase {
  return {
    apiVersion: "anchored-spec/ea/v1",
    title: overrides.title ?? overrides.id,
    summary: "Test artifact",
    owners: ["team-test"],
    tags: [],
    confidence: "declared",
    status: "active",
    schemaVersion: "1.0.0",
    relations: [],
    ...overrides,
  } as EaArtifactBase;
}

function makeDraft(overrides?: Partial<EaArtifactDraft>): EaArtifactDraft {
  return {
    suggestedId: overrides?.suggestedId ?? "APP-new-service",
    kind: overrides?.kind ?? "application",
    title: overrides?.title ?? "New Service",
    summary: overrides?.summary ?? "Discovered application",
    status: "draft",
    confidence: overrides?.confidence ?? "inferred",
    anchors: overrides?.anchors,
    relations: overrides?.relations,
    discoveredBy: overrides?.discoveredBy ?? "test-resolver",
    discoveredAt: overrides?.discoveredAt ?? new Date().toISOString(),
    kindSpecificFields: overrides?.kindSpecificFields,
  };
}

const DOMAIN_DIRS: Record<string, string> = {
  systems: "ea/systems",
  delivery: "ea/delivery",
  data: "ea/data",
  information: "ea/information",
  business: "ea/business",
  transitions: "ea/transitions",
};

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ea-discovery-"));
  for (const dir of Object.values(DOMAIN_DIRS)) {
    mkdirSync(join(tempDir, dir), { recursive: true });
  }
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── matchDraftToExisting ───────────────────────────────────────────────────────

describe("matchDraftToExisting", () => {
  it("returns null when no existing artifacts", () => {
    const draft = makeDraft();
    expect(matchDraftToExisting(draft, [])).toBeNull();
  });

  it("returns null when no kind match", () => {
    const draft = makeDraft({ kind: "application" });
    const existing = [makeArtifact({ id: "SVC-001", kind: "service" })];
    expect(matchDraftToExisting(draft, existing)).toBeNull();
  });

  it("matches by anchor overlap", () => {
    const draft = makeDraft({
      kind: "application",
      anchors: { repositoryUrl: ["https://github.com/org/my-app"] },
    });
    const existing = [
      makeArtifact({
        id: "APP-001",
        kind: "application",
        anchors: { repositoryUrl: ["https://github.com/org/my-app"] },
      } as any),
    ];

    const result = matchDraftToExisting(draft, existing);
    expect(result).not.toBeNull();
    expect(result!.match.id).toBe("APP-001");
    expect(result!.matchedBy).toBe("anchor");
  });

  it("matches by normalized title", () => {
    const draft = makeDraft({
      kind: "application",
      title: "User Service",
    });
    const existing = [
      makeArtifact({
        id: "APP-001",
        kind: "application",
        title: "user-service",
      }),
    ];

    const result = matchDraftToExisting(draft, existing);
    expect(result).not.toBeNull();
    expect(result!.match.id).toBe("APP-001");
    expect(result!.matchedBy).toBe("title");
  });

  it("does not match different titles of same kind", () => {
    const draft = makeDraft({
      kind: "application",
      title: "Payment Service",
    });
    const existing = [
      makeArtifact({
        id: "APP-001",
        kind: "application",
        title: "User Service",
      }),
    ];

    expect(matchDraftToExisting(draft, existing)).toBeNull();
  });

  it("prefers anchor match over title match", () => {
    const draft = makeDraft({
      kind: "application",
      title: "My App",
      anchors: { repositoryUrl: ["https://github.com/org/my-app"] },
    });
    const existing = [
      makeArtifact({
        id: "APP-BY-TITLE",
        kind: "application",
        title: "My App",
      }),
      makeArtifact({
        id: "APP-BY-ANCHOR",
        kind: "application",
        title: "Different Name",
        anchors: { repositoryUrl: ["https://github.com/org/my-app"] },
      } as any),
    ];

    const result = matchDraftToExisting(draft, existing);
    expect(result).not.toBeNull();
    expect(result!.matchedBy).toBe("anchor");
    expect(result!.match.id).toBe("APP-BY-ANCHOR");
  });
});

// ─── createDraft ────────────────────────────────────────────────────────────────

describe("createDraft", () => {
  it("creates a draft with defaults", () => {
    const draft = createDraft("application", "My New App", "openapi-resolver");

    expect(draft.kind).toBe("application");
    expect(draft.title).toBe("My New App");
    expect(draft.status).toBe("draft");
    expect(draft.confidence).toBe("inferred");
    expect(draft.discoveredBy).toBe("openapi-resolver");
    expect(draft.suggestedId).toContain("APP-");
    expect(draft.discoveredAt).toBeTruthy();
  });

  it("uses observed confidence when specified", () => {
    const draft = createDraft("service", "Auth Service", "k8s-resolver", {
      confidence: "observed",
    });

    expect(draft.confidence).toBe("observed");
  });

  it("includes anchors and kind-specific fields", () => {
    const draft = createDraft("api-contract", "Users API", "openapi-resolver", {
      anchors: { specUrl: ["/api/users.yaml"] },
      kindSpecificFields: { protocol: "rest", specification: "openapi" },
    });

    expect(draft.anchors).toEqual({ specUrl: ["/api/users.yaml"] });
    expect(draft.kindSpecificFields).toEqual({ protocol: "rest", specification: "openapi" });
  });
});

// ─── discoverArtifacts ──────────────────────────────────────────────────────────

describe("discoverArtifacts", () => {
  it("returns empty report with no drafts", () => {
    const report = discoverArtifacts({
      existingArtifacts: [],
      drafts: [],
      resolverNames: ["stub"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
    });

    expect(report.summary.newArtifacts).toBe(0);
    expect(report.summary.matchedExisting).toBe(0);
    expect(report.summary.suggestedUpdates).toBe(0);
    expect(report.discoveredAt).toBeTruthy();
    expect(report.resolversUsed).toEqual(["stub"]);
  });

  it("creates new artifacts for unmatched drafts", () => {
    const drafts = [makeDraft({ kind: "application", title: "New App" })];

    const report = discoverArtifacts({
      existingArtifacts: [],
      drafts,
      resolverNames: ["test-resolver"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
    });

    expect(report.summary.newArtifacts).toBe(1);
    expect(report.newArtifacts[0].kind).toBe("application");
    expect(report.newArtifacts[0].writtenTo).toBeTruthy();

    // Verify file was written
    const files = readdirSync(join(tempDir, "ea", "systems"));
    expect(files.some((f) => f.endsWith(".json"))).toBe(true);
  });

  it("writes valid JSON for draft artifacts", () => {
    const drafts = [
      makeDraft({
        kind: "application",
        title: "Test App",
        anchors: { repositoryUrl: ["https://github.com/org/test"] },
      }),
    ];

    discoverArtifacts({
      existingArtifacts: [],
      drafts,
      resolverNames: ["test"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
    });

    const files = readdirSync(join(tempDir, "ea", "systems")).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);

    const content = JSON.parse(readFileSync(join(tempDir, "ea", "systems", files[0]), "utf-8"));
    expect(content.status).toBe("draft");
    expect(content.confidence).toBe("inferred");
    expect(content.kind).toBe("application");
    expect(content.tags).toContain("discovered");
    expect(content.owners).toContain("discovery-pipeline");
  });

  it("reports matched existing artifacts (does not write)", () => {
    const existing = [
      makeArtifact({
        id: "APP-001",
        kind: "application",
        title: "User Service",
      }),
    ];
    const drafts = [makeDraft({ kind: "application", title: "User Service" })];

    const report = discoverArtifacts({
      existingArtifacts: existing,
      drafts,
      resolverNames: ["test"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
    });

    expect(report.summary.newArtifacts).toBe(0);
    expect(report.summary.matchedExisting).toBe(1);
    expect(report.matchedExisting[0].existingId).toBe("APP-001");
    expect(report.matchedExisting[0].matchedBy).toBe("title");

    // No files written for matched artifacts
    const files = readdirSync(join(tempDir, "ea", "systems")).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(0);
  });

  it("suggests anchor additions for matched artifacts", () => {
    const existing = [
      makeArtifact({
        id: "APP-001",
        kind: "application",
        title: "User Service",
        anchors: { repositoryUrl: ["https://github.com/org/users"] },
      } as any),
    ];
    const drafts = [
      makeDraft({
        kind: "application",
        title: "User Service",
        anchors: {
          repositoryUrl: ["https://github.com/org/users"],
          specUrl: ["/api/users.yaml"],
        },
      }),
    ];

    const report = discoverArtifacts({
      existingArtifacts: existing,
      drafts,
      resolverNames: ["test"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
    });

    expect(report.summary.suggestedUpdates).toBe(1);
    expect(report.suggestedUpdates[0].existingId).toBe("APP-001");
    expect(report.matchedExisting[0].suggestedAnchorsToAdd).toBeDefined();
    expect(report.matchedExisting[0].suggestedAnchorsToAdd!.specUrl).toEqual(["/api/users.yaml"]);
  });

  it("respects dry-run (does not write files)", () => {
    const drafts = [makeDraft({ kind: "application", title: "Dry Run App" })];

    const report = discoverArtifacts({
      existingArtifacts: [],
      drafts,
      resolverNames: ["test"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
      dryRun: true,
    });

    expect(report.summary.newArtifacts).toBe(1);
    expect(report.newArtifacts[0].writtenTo).toBeNull();

    // No files written
    const files = readdirSync(join(tempDir, "ea", "systems")).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(0);
  });

  it("handles multiple drafts (mixed new and matched)", () => {
    const existing = [
      makeArtifact({
        id: "APP-001",
        kind: "application",
        title: "Existing App",
      }),
    ];
    const drafts = [
      makeDraft({ kind: "application", title: "Existing App" }), // matched
      makeDraft({ kind: "application", title: "Brand New App" }), // new
      makeDraft({ kind: "service", title: "New Service" }), // new
    ];

    const report = discoverArtifacts({
      existingArtifacts: existing,
      drafts,
      resolverNames: ["test"],
      projectRoot: tempDir,
      domainDirs: DOMAIN_DIRS,
    });

    expect(report.summary.matchedExisting).toBe(1);
    expect(report.summary.newArtifacts).toBe(2);
  });
});

// ─── renderDiscoveryReportMarkdown ──────────────────────────────────────────────

describe("renderDiscoveryReportMarkdown", () => {
  it("renders empty report", () => {
    const report: DiscoveryReport = {
      discoveredAt: new Date().toISOString(),
      resolversUsed: ["stub"],
      summary: { newArtifacts: 0, matchedExisting: 0, suggestedUpdates: 0 },
      newArtifacts: [],
      matchedExisting: [],
      suggestedUpdates: [],
    };

    const md = renderDiscoveryReportMarkdown(report);
    expect(md).toContain("# Discovery Report");
    expect(md).toContain("No artifacts discovered");
  });

  it("renders new artifacts table", () => {
    const report: DiscoveryReport = {
      discoveredAt: new Date().toISOString(),
      resolversUsed: ["openapi"],
      summary: { newArtifacts: 1, matchedExisting: 0, suggestedUpdates: 0 },
      newArtifacts: [{
        suggestedId: "APP-test",
        kind: "application",
        title: "Test",
        confidence: "inferred",
        discoveredBy: "openapi",
        writtenTo: "/ea/systems/app-test.json",
      }],
      matchedExisting: [],
      suggestedUpdates: [],
    };

    const md = renderDiscoveryReportMarkdown(report);
    expect(md).toContain("## New Artifacts");
    expect(md).toContain("APP-test");
    expect(md).toContain("openapi");
  });

  it("renders matched existing section", () => {
    const report: DiscoveryReport = {
      discoveredAt: new Date().toISOString(),
      resolversUsed: ["test"],
      summary: { newArtifacts: 0, matchedExisting: 1, suggestedUpdates: 0 },
      newArtifacts: [],
      matchedExisting: [{
        existingId: "APP-001",
        matchedBy: "anchor",
        draft: makeDraft(),
      }],
      suggestedUpdates: [],
    };

    const md = renderDiscoveryReportMarkdown(report);
    expect(md).toContain("## Matched Existing");
    expect(md).toContain("APP-001");
    expect(md).toContain("anchor");
  });
});

// ─── CLI Integration Tests ──────────────────────────────────────────────────────

describe("CLI: ea discover", () => {
  const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");
  const ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

  function initEa(dir: string): void {
    mkdirSync(join(dir, "ea", "systems"), { recursive: true });
    mkdirSync(join(dir, "ea", "delivery"), { recursive: true });
    mkdirSync(join(dir, "ea", "data"), { recursive: true });
    mkdirSync(join(dir, "ea", "information"), { recursive: true });
    mkdirSync(join(dir, "ea", "business"), { recursive: true });
    mkdirSync(join(dir, "ea", "transitions"), { recursive: true });
    mkdirSync(join(dir, "specs"), { recursive: true });
    writeFileSync(
      join(dir, "ea", "ea.config.json"),
      JSON.stringify({ rootDir: "ea", schemaVersion: "1.0.0" }),
    );
  }

  function runCLI(args: string, cwd?: string): { stdout: string; code: number } {
    try {
      const stdout = execSync(`node ${CLI_PATH} ${args}`, {
        encoding: "utf-8",
        cwd: cwd ?? tempDir,
        env: ENV,
        timeout: 15_000,
      });
      return { stdout, code: 0 };
    } catch (err: any) {
      return { stdout: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 };
    }
  }

  it("shows ea discover help", () => {
    const { stdout, code } = runCLI("ea discover --help");
    expect(code).toBe(0);
    expect(stdout).toContain("Discover EA artifacts");
    expect(stdout).toContain("--resolver");
    expect(stdout).toContain("--dry-run");
    expect(stdout).toContain("--json");
  });

  it("runs discovery on empty project", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea discover");
    expect(code).toBe(0);
    expect(stdout).toContain("Discovery Report");
    expect(stdout).toContain("No artifacts discovered");
  });

  it("outputs JSON with --json", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea discover --json");
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report).toHaveProperty("discoveredAt");
    expect(report).toHaveProperty("summary");
    expect(report).toHaveProperty("resolversUsed");
    expect(report.resolversUsed).toContain("openapi");
  });

  it("respects --dry-run flag", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea discover --dry-run");
    expect(code).toBe(0);
    expect(stdout).toContain("Discovery Report");
  });

  it("runs specific resolver with --resolver", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea discover --resolver openapi --json");
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.resolversUsed).toContain("openapi");
    expect(report.resolversUsed).toHaveLength(1);
  });

  it("rejects unknown resolver names", () => {
    initEa(tempDir);
    const { stdout, code } = runCLI("ea discover --resolver unknown-resolver");
    expect(code).not.toBe(0);
    expect(stdout).toContain("Unknown resolver");
  });
});
