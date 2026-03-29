import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { join } from "node:path";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { SpecRoot } from "../../core/loader.js";
import {
  migrateLegacyArtifacts,
  migrateRequirement,
  migrateChange,
  migrateDecision,
  mapSemanticRefsToAnchors,
  renderMigrationReportMarkdown,
} from "../migrate-legacy.js";
import type { Requirement, Change, Decision, SemanticRefs } from "../../core/types.js";

// ─── mapSemanticRefsToAnchors ───────────────────────────────────────────────────

describe("mapSemanticRefsToAnchors", () => {
  it("should return empty object for undefined refs", () => {
    expect(mapSemanticRefsToAnchors(undefined)).toEqual({});
  });

  it("should return empty object for empty refs", () => {
    expect(mapSemanticRefsToAnchors({})).toEqual({});
  });

  it("should map interfaces to symbols", () => {
    const refs: SemanticRefs = { interfaces: ["TodoInput", "TaskItem"] };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.symbols).toEqual(["TodoInput", "TaskItem"]);
  });

  it("should merge interfaces and symbols", () => {
    const refs: SemanticRefs = {
      interfaces: ["TodoInput"],
      symbols: ["addTask"],
    };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.symbols).toEqual(["TodoInput", "addTask"]);
  });

  it("should prefix errorCodes with error:", () => {
    const refs: SemanticRefs = { errorCodes: ["ERR_404", "ERR_500"] };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.symbols).toEqual(["error:ERR_404", "error:ERR_500"]);
  });

  it("should deduplicate symbols", () => {
    const refs: SemanticRefs = {
      interfaces: ["Foo"],
      symbols: ["Foo", "Bar"],
    };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.symbols).toEqual(["Foo", "Bar"]);
  });

  it("should map routes to apis", () => {
    const refs: SemanticRefs = { routes: ["GET /orders", "POST /orders"] };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.apis).toEqual(["GET /orders", "POST /orders"]);
  });

  it("should map schemas", () => {
    const refs: SemanticRefs = { schemas: ["order.schema.json"] };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.schemas).toEqual(["order.schema.json"]);
  });

  it("should map other entries", () => {
    const refs: SemanticRefs = {
      other: { dbt: ["model_users"], terraform: ["aws_rds"] },
    };
    const anchors = mapSemanticRefsToAnchors(refs);
    expect(anchors.dbt).toEqual(["model_users"]);
    expect(anchors.terraform).toEqual(["aws_rds"]);
  });
});

// ─── migrateRequirement ─────────────────────────────────────────────────────────

describe("migrateRequirement", () => {
  it("should transform a basic requirement", () => {
    const req: Requirement = {
      id: "REQ-1",
      title: "Add Task",
      summary: "Users can add new tasks",
      priority: "must",
      status: "shipped",
      category: "functional",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When user submits, system shall add task",
          format: "EARS",
          trigger: "user submits",
          response: "add task",
        },
      ],
      owners: ["todo-team"],
      semanticRefs: {
        symbols: ["addTask"],
        interfaces: ["TodoInput"],
      },
    };

    const result = migrateRequirement(req);

    expect(result.id).toBe("legacy/REQ-1");
    expect(result.kind).toBe("requirement");
    expect(result.title).toBe("Add Task");
    expect(result.status).toBe("shipped");
    expect(result.summary).toBe("Users can add new tasks");
    expect(result.owners).toEqual(["todo-team"]);
    expect(result.confidence).toBe("declared");
    expect(result.schemaVersion).toBe("1.0.0");
    expect(result.category).toBe("functional");
    expect(result.priority).toBe("must");

    // Anchors mapping
    const anchors = result.anchors as Record<string, string[]>;
    expect(anchors.symbols).toEqual(["TodoInput", "addTask"]);

    // Behavior statements preserved
    const bs = result.behaviorStatements as Array<Record<string, unknown>>;
    expect(bs).toHaveLength(1);
    expect(bs[0]!.id).toBe("BS-1");
  });

  it("should map implementation.shippedBy to relations", () => {
    const req: Requirement = {
      id: "REQ-2",
      title: "Test",
      summary: "Test requirement",
      priority: "should",
      status: "shipped",
      behaviorStatements: [],
      owners: ["team"],
      implementation: { shippedBy: "CHG-2025-0001-initial-todo" },
    };

    const result = migrateRequirement(req);
    const relations = result.relations as Array<{ type: string; target: string }>;
    expect(relations).toHaveLength(1);
    expect(relations[0]).toEqual({
      type: "implementedBy",
      target: "legacy/CHG-2025-0001-initial-todo",
    });
  });

  it("should map dependsOn to relations", () => {
    const req: Requirement = {
      id: "REQ-3",
      title: "Test",
      summary: "Test",
      priority: "must",
      status: "active",
      behaviorStatements: [],
      owners: ["team"],
      dependsOn: ["REQ-1", "REQ-2"],
    };

    const result = migrateRequirement(req);
    const relations = result.relations as Array<{ type: string; target: string }>;
    expect(relations).toHaveLength(2);
    expect(relations[0]!.target).toBe("legacy/REQ-1");
    expect(relations[1]!.target).toBe("legacy/REQ-2");
  });

  it("should map verification with coverageStatus 'full' to 'covered'", () => {
    const req: Requirement = {
      id: "REQ-4",
      title: "Test",
      summary: "Test",
      priority: "must",
      status: "active",
      behaviorStatements: [],
      owners: ["team"],
      verification: {
        coverageStatus: "full",
        testFiles: ["test.ts"],
      },
    };

    const result = migrateRequirement(req);
    const verification = result.verification as Record<string, unknown>;
    expect(verification.coverageStatus).toBe("covered");
    expect(verification.testRefs).toEqual(["test.ts"]);
  });
});

// ─── migrateChange ──────────────────────────────────────────────────────────────

describe("migrateChange", () => {
  it("should transform a basic change", () => {
    const chg: Change = {
      id: "CHG-2025-0001-initial-todo",
      title: "Implement core to-do list features",
      slug: "initial-todo",
      type: "feature",
      workflowVariant: "feature-behavior-first",
      phase: "done",
      status: "complete",
      scope: { include: ["lib/**"], exclude: ["**/*.test.*"] },
      requirements: ["REQ-1", "REQ-2"],
      branch: "feat/initial-todo",
      timestamps: { createdAt: "2025-06-01", updatedAt: "2025-06-15" },
      owners: ["todo-team"],
    };

    const result = migrateChange(chg);

    expect(result.id).toBe("legacy/CHG-2025-0001-initial-todo");
    expect(result.kind).toBe("change");
    expect(result.title).toBe("Implement core to-do list features");
    expect(result.status).toBe("active"); // done/complete → active
    expect(result.confidence).toBe("declared");
    expect(result.changeType).toBe("feature");
    expect(result.phase).toBe("done");
    expect(result.changeStatus).toBe("complete");
    expect(result.workflowVariant).toBe("feature-behavior-first");
  });

  it("should map requirements to relations", () => {
    const chg: Change = {
      id: "CHG-2025-0001-test",
      title: "Test",
      slug: "test",
      type: "feature",
      phase: "done",
      status: "complete",
      scope: { include: ["**"] },
      requirements: ["REQ-1", "REQ-3"],
      branch: null,
      timestamps: { createdAt: "2025-01-01" },
      owners: ["team"],
    };

    const result = migrateChange(chg);
    const relations = result.relations as Array<{ type: string; target: string }>;
    expect(relations).toHaveLength(2);
    expect(relations[0]).toEqual({ type: "generates", target: "legacy/REQ-1" });
    expect(relations[1]).toEqual({ type: "generates", target: "legacy/REQ-3" });
  });

  it("should map cancelled status to deprecated", () => {
    const chg: Change = {
      id: "CHG-2025-0002-cancelled",
      title: "Cancelled",
      slug: "cancelled",
      type: "refactor",
      phase: "design",
      status: "cancelled",
      scope: { include: ["**"] },
      branch: null,
      timestamps: { createdAt: "2025-01-01" },
      owners: ["team"],
    };

    const result = migrateChange(chg);
    expect(result.status).toBe("deprecated");
  });
});

// ─── migrateDecision ────────────────────────────────────────────────────────────

describe("migrateDecision", () => {
  it("should transform a basic decision", () => {
    const dec: Decision = {
      id: "ADR-1",
      title: "Use React useState",
      slug: "client-side-state",
      status: "accepted",
      domain: "state-management",
      decision: "Task state will be managed client-side",
      context: "App needs task state management",
      rationale: "useState is simplest for MVP",
      alternatives: [
        { name: "Redux", verdict: "rejected", reason: "Too complex" },
      ],
      relatedRequirements: ["REQ-1", "REQ-2"],
    };

    const result = migrateDecision(dec);

    expect(result.id).toBe("legacy/ADR-1");
    expect(result.kind).toBe("decision");
    expect(result.title).toBe("Use React useState");
    expect(result.status).toBe("active"); // accepted → active
    expect(result.confidence).toBe("declared");
    expect(result.decision).toBe("Task state will be managed client-side");
    expect(result.context).toBe("App needs task state management");
    expect(result.rationale).toBe("useState is simplest for MVP");
    expect(result.adDomain).toBe("state-management");
  });

  it("should map relatedRequirements to relations", () => {
    const dec: Decision = {
      id: "ADR-2",
      title: "Test",
      slug: "test",
      status: "accepted",
      decision: "Test decision",
      context: "Context",
      rationale: "Rationale",
      alternatives: [],
      relatedRequirements: ["REQ-1", "REQ-5"],
    };

    const result = migrateDecision(dec);
    const relations = result.relations as Array<{ type: string; target: string }>;
    expect(relations).toHaveLength(2);
    expect(relations[0]).toEqual({ type: "dependsOn", target: "legacy/REQ-1" });
    expect(relations[1]).toEqual({ type: "dependsOn", target: "legacy/REQ-5" });
  });

  it("should map superseded status to deprecated", () => {
    const dec: Decision = {
      id: "ADR-3",
      title: "Old Decision",
      slug: "old",
      status: "superseded",
      decision: "Old",
      context: "Old",
      rationale: "Old",
      alternatives: [],
      relatedRequirements: [],
      supersededBy: "ADR-4",
    };

    const result = migrateDecision(dec);
    expect(result.status).toBe("deprecated");
  });
});

// ─── Full migration with todo-app fixtures ──────────────────────────────────────

describe("migrateLegacyArtifacts", () => {
  const TEST_ROOT = join(tmpdir(), `ea-migrate-test-${Date.now()}`);
  const FIXTURES = join(__dirname, "..", "..", "..", "examples", "todo-app");

  afterEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it("should migrate todo-app fixtures in dry-run mode", () => {
    const specRoot = new SpecRoot(FIXTURES);
    const result = migrateLegacyArtifacts(specRoot, { dryRun: true });

    // The todo-app has 5 REQs, 1 CHG, 1 ADR
    expect(result.errors).toHaveLength(0);
    expect(result.migratedArtifacts.length).toBeGreaterThanOrEqual(7);

    // Verify REQs migrated
    const reqs = result.migratedArtifacts.filter((m) => m.kind === "requirement");
    expect(reqs.length).toBe(5);
    expect(reqs.map((r) => r.legacyId).sort()).toEqual([
      "REQ-1", "REQ-2", "REQ-3", "REQ-4", "REQ-5",
    ]);

    // Verify CHG migrated
    const chgs = result.migratedArtifacts.filter((m) => m.kind === "change");
    expect(chgs.length).toBeGreaterThanOrEqual(1);

    // Verify ADR migrated
    const adrs = result.migratedArtifacts.filter((m) => m.kind === "decision");
    expect(adrs.length).toBe(1);
    expect(adrs[0]!.legacyId).toBe("ADR-1");
  });

  it("should write files in non-dry-run mode", () => {
    // Copy fixture config to temp dir
    mkdirSync(TEST_ROOT, { recursive: true });
    const configDir = join(TEST_ROOT, ".anchored-spec");
    mkdirSync(configDir, { recursive: true });

    // Create a minimal spec setup with one REQ
    const reqDir = join(TEST_ROOT, "specs", "requirements");
    mkdirSync(reqDir, { recursive: true });
    writeFileSync(
      join(reqDir, "REQ-1.json"),
      JSON.stringify({
        id: "REQ-1",
        title: "Test Requirement",
        summary: "A test",
        priority: "must",
        status: "active",
        behaviorStatements: [],
        owners: ["team"],
      })
    );

    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        specRoot: "specs",
        requirementsDir: "specs/requirements",
        changesDir: "specs/changes",
        decisionsDir: "specs/decisions",
        generatedDir: "specs/generated",
      })
    );

    const specRoot = new SpecRoot(TEST_ROOT);
    const result = migrateLegacyArtifacts(specRoot, {
      outputDir: "ea/legacy",
    });

    expect(result.errors).toHaveLength(0);
    expect(result.migratedArtifacts.length).toBe(1);

    // Verify file was written
    const filePath = join(TEST_ROOT, "ea", "legacy", "REQ-1.json");
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content.id).toBe("legacy/REQ-1");
    expect(content.kind).toBe("requirement");
    expect(content.title).toBe("Test Requirement");
    expect(content.schemaVersion).toBe("1.0.0");
    expect(content.confidence).toBe("declared");
  });

  it("should filter by kind", () => {
    const specRoot = new SpecRoot(FIXTURES);
    const result = migrateLegacyArtifacts(specRoot, {
      dryRun: true,
      kind: "decision",
    });

    expect(result.migratedArtifacts.length).toBe(1);
    expect(result.migratedArtifacts[0]!.kind).toBe("decision");
  });

  it("should handle missing directories gracefully", () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    const configDir = join(TEST_ROOT, ".anchored-spec");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, "config.json"),
      JSON.stringify({
        specRoot: "specs",
        requirementsDir: "specs/requirements",
        changesDir: "specs/changes",
        decisionsDir: "specs/decisions",
        generatedDir: "specs/generated",
      })
    );

    const specRoot = new SpecRoot(TEST_ROOT);
    const result = migrateLegacyArtifacts(specRoot, { dryRun: true });

    // No files found = no artifacts, but should not error
    expect(result.migratedArtifacts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── Report rendering ───────────────────────────────────────────────────────────

describe("renderMigrationReportMarkdown", () => {
  it("should render a migration report", () => {
    const markdown = renderMigrationReportMarkdown({
      migratedArtifacts: [
        { legacyId: "REQ-1", newId: "legacy/REQ-1", kind: "requirement", filePath: "ea/legacy/REQ-1.json" },
        { legacyId: "ADR-1", newId: "legacy/ADR-1", kind: "decision", filePath: "ea/legacy/ADR-1.json" },
      ],
      errors: [],
      warnings: [{ legacyId: "REQ-2", warning: "Missing semanticRefs" }],
    });

    expect(markdown).toContain("# Legacy Migration Report");
    expect(markdown).toContain("Migrated artifacts | 2");
    expect(markdown).toContain("**REQ-1** → `legacy/REQ-1`");
    expect(markdown).toContain("**ADR-1** → `legacy/ADR-1`");
    expect(markdown).toContain("Missing semanticRefs");
  });
});

// ─── Kind registry & schema updates ────────────────────────────────────────────

import { EA_KIND_REGISTRY, EA_DOMAINS } from "../types.js";

describe("Legacy kinds in EA registry", () => {
  it("should include 3 legacy kinds in EA_KIND_REGISTRY", () => {
    const legacyKinds = EA_KIND_REGISTRY.filter(
      (e) => e.domain === "legacy"
    );
    expect(legacyKinds).toHaveLength(3);
    expect(legacyKinds.map((e) => e.kind).sort()).toEqual([
      "change", "decision", "requirement",
    ]);
  });

  it("should have EA_KIND_REGISTRY length = 44", () => {
    expect(EA_KIND_REGISTRY).toHaveLength(44);
  });

  it("should include legacy domain in EA_DOMAINS", () => {
    expect(EA_DOMAINS).toContain("legacy");
  });
});
