/**
 * Tests for EA Verification Engine
 *
 * Covers:
 *   - runEaVerification with clean artifacts
 *   - Broken relation targets
 *   - Orphan artifact detection
 *   - Lifecycle consistency warnings
 *   - Rule overrides (severity change, "off")
 *   - Strict mode (warnings → errors)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runEaVerification } from "../verify.js";
import { EaRoot } from "../loader.js";

let tempDir: string;

function setupEaProject(artifacts: Record<string, unknown>[]): void {
  mkdirSync(join(tempDir, "ea", "systems"), { recursive: true });
  mkdirSync(join(tempDir, "ea", "transitions"), { recursive: true });

  // Write config
  writeFileSync(
    join(tempDir, "anchored-spec.json"),
    JSON.stringify({
      schemaVersion: "1.0",
      rootDir: "ea",
    }),
  );

  // Write each artifact to the appropriate domain directory
  for (const artifact of artifacts) {
    const kind = artifact.kind as string;
    let domain = "systems";
    if (["baseline", "target", "transition-plan", "migration-wave", "exception"].includes(kind)) {
      domain = "transitions";
    }
    const id = artifact.id as string;
    mkdirSync(join(tempDir, "ea", domain), { recursive: true });
    writeFileSync(
      join(tempDir, "ea", domain, `${id}.json`),
      JSON.stringify(artifact, null, 2),
    );
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "verify-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ─── Clean artifacts ────────────────────────────────────────────────────────────

describe("runEaVerification — clean artifacts", () => {
  it("passes for well-formed artifacts with relations", async () => {
    setupEaProject([
      {
        id: "SVC-auth",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Auth Service",
        status: "active",
        confidence: "declared",
        summary: "Authentication service",
        owners: ["team-platform"],
        relations: [{ target: "SVC-db", type: "dependsOn" }],
      },
      {
        id: "SVC-db",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Database",
        status: "active",
        confidence: "declared",
        summary: "Primary database",
        owners: ["team-data"],
        relations: [{ target: "SVC-auth", type: "supports" }],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors).toEqual([]);
    expect(result.summary.artifacts.total).toBe(2);
  });
});

// ─── Broken relation targets ────────────────────────────────────────────────────

describe("runEaVerification — broken relation targets", () => {
  it("detects relation target that doesn't exist", async () => {
    setupEaProject([
      {
        id: "SVC-app",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "App",
        status: "active",
        confidence: "declared",
        summary: "Main application",
        owners: ["team-dev"],
        relations: [{ target: "SVC-nonexistent", type: "dependsOn" }],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    const brokenRel = result.findings.find((f) => f.rule === "ea:verify:broken-relation-target");
    expect(brokenRel).toBeDefined();
    expect(brokenRel!.message).toContain("SVC-nonexistent");
  });
});

// ─── Orphan artifact detection ──────────────────────────────────────────────────

describe("runEaVerification — orphan artifacts", () => {
  it("warns about active artifacts with no relations", async () => {
    setupEaProject([
      {
        id: "SVC-lonely",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Lonely Service",
        status: "active",
        confidence: "declared",
        summary: "Disconnected service",
        owners: ["team-dev"],
        relations: [],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    const orphan = result.findings.find((f) => f.rule === "ea:verify:orphan-artifact");
    expect(orphan).toBeDefined();
    expect(orphan!.message).toContain("SVC-lonely");
    expect(orphan!.severity).toBe("warning");
  });

  it("does not warn about draft artifacts with no relations", async () => {
    setupEaProject([
      {
        id: "SVC-draft",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Draft Service",
        status: "draft",
        confidence: "inferred",
        summary: "Work in progress",
        owners: [],
        relations: [],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    const orphan = result.findings.find((f) => f.rule === "ea:verify:orphan-artifact");
    expect(orphan).toBeUndefined();
  });
});

// ─── Lifecycle consistency ──────────────────────────────────────────────────────

describe("runEaVerification — lifecycle consistency", () => {
  it("warns when deprecated artifact has no deprecation reason", async () => {
    setupEaProject([
      {
        id: "SVC-old",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Old Service",
        status: "deprecated",
        confidence: "declared",
        summary: "This service does stuff",
        owners: ["team-legacy"],
        relations: [{ target: "SVC-old", type: "replaces" }],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    const deprecation = result.findings.find((f) => f.rule === "ea:verify:deprecated-needs-reason");
    expect(deprecation).toBeDefined();
  });

  it("no warning when deprecated artifact mentions 'deprecated' in summary", async () => {
    setupEaProject([
      {
        id: "SVC-old2",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Old Service 2",
        status: "deprecated",
        confidence: "declared",
        summary: "This service is deprecated in favor of new-service",
        owners: ["team-legacy"],
        relations: [{ target: "SVC-old2", type: "replaces" }],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    const deprecation = result.findings.find((f) => f.rule === "ea:verify:deprecated-needs-reason");
    expect(deprecation).toBeUndefined();
  });
});

// ─── Rule overrides ─────────────────────────────────────────────────────────────

describe("runEaVerification — rule overrides", () => {
  it("can turn off a specific rule", async () => {
    setupEaProject([
      {
        id: "SVC-lonely2",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Lonely 2",
        status: "active",
        confidence: "declared",
        summary: "No relations here",
        owners: ["team"],
        relations: [],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot, {
      ruleOverrides: { "ea:verify:orphan-artifact": "off" },
    });

    const orphan = result.findings.find((f) => f.rule === "ea:verify:orphan-artifact");
    expect(orphan).toBeUndefined();
  });

  it("can upgrade a warning to error via override", async () => {
    setupEaProject([
      {
        id: "SVC-lonely3",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Lonely 3",
        status: "active",
        confidence: "declared",
        summary: "No relations",
        owners: ["team"],
        relations: [],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot, {
      ruleOverrides: { "ea:verify:orphan-artifact": "error" },
    });

    const orphan = result.findings.find((f) => f.rule === "ea:verify:orphan-artifact");
    expect(orphan).toBeDefined();
    expect(orphan!.severity).toBe("error");
  });
});

// ─── Strict mode ────────────────────────────────────────────────────────────────

describe("runEaVerification — strict mode", () => {
  it("promotes all warnings to errors in strict mode", async () => {
    setupEaProject([
      {
        id: "SVC-strict",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Strict Service",
        status: "active",
        confidence: "declared",
        summary: "Active service with no relations",
        owners: ["team"],
        relations: [],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot, { strict: true });

    const warnings = result.findings.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(0);
    expect(result.passed).toBe(false);
  });
});

// ─── Summary structure ──────────────────────────────────────────────────────────

describe("runEaVerification — summary structure", () => {
  it("returns correct summary shape", async () => {
    setupEaProject([
      {
        id: "SVC-sum",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Summary Test",
        status: "active",
        confidence: "declared",
        summary: "Test artifact for summary",
        owners: ["team"],
        relations: [{ target: "SVC-sum", type: "self" }],
      },
    ]);

    const eaRoot = EaRoot.fromDirectory(tempDir)!;
    const result = await runEaVerification(eaRoot);

    expect(result.summary.totalChecks).toBeGreaterThan(0);
    expect(typeof result.summary.passed).toBe("number");
    expect(typeof result.summary.warnings).toBe("number");
    expect(typeof result.summary.errors).toBe("number");
    expect(result.summary.artifacts.total).toBe(1);
    expect(result.summary.artifacts.byDomain).toBeDefined();
  });
});
