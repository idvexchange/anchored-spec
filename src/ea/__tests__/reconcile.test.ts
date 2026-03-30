/**
 * Tests for the EA Reconcile Pipeline
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify as yamlStringify } from "yaml";
import { reconcileEaProject, renderReconcileOutput } from "../reconcile.js";

// ─── Temp Directory Helpers ────────────────────────────────────────────────────

let tempDir: string;

function createTempProject(): string {
  tempDir = join(tmpdir(), `ea-reconcile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tempDir, { recursive: true });

  // Create .anchored-spec/config.json
  const configDir = join(tempDir, ".anchored-spec");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({
      schemaVersion: "1.0.0",
      rootDir: "ea",
      generatedDir: "ea/generated",
      domains: {
        systems: "ea/systems",
        delivery: "ea/delivery",
        data: "ea/data",
        information: "ea/information",
        business: "ea/business",
        transitions: "ea/transitions",
      },
    }),
  );

  // Create domain directories
  for (const domain of ["systems", "delivery", "data", "information", "business", "transitions"]) {
    mkdirSync(join(tempDir, "ea", domain), { recursive: true });
  }
  mkdirSync(join(tempDir, "ea", "generated"), { recursive: true });
  mkdirSync(join(tempDir, "ea", "schemas"), { recursive: true });

  return tempDir;
}

function writeArtifact(dir: string, filename: string, content: Record<string, unknown>): void {
  writeFileSync(join(dir, filename), yamlStringify(content));
}

beforeEach(() => {
  createTempProject();
});

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe("reconcileEaProject", () => {
  it("passes with no artifacts", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
    });

    expect(report.passed).toBe(true);
    expect(report.steps.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalErrors).toBe(0);
  });

  it("passes with valid artifacts", async () => {
    writeArtifact(join(tempDir, "ea", "systems"), "APP-test.yaml", {
      id: "APP-test",
      schemaVersion: "1.0.0",
      kind: "application",
      title: "Test App",
      status: "active",
      summary: "A test application",
      owners: ["team-a"],
      confidence: "declared",
    });

    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
    });

    expect(report.passed).toBe(true);
    expect(report.summary.validationErrors).toBe(0);
  });

  it("detects validation errors", async () => {
    writeArtifact(join(tempDir, "ea", "systems"), "APP-bad.yaml", {
      id: "APP-bad",
      schemaVersion: "1.0.0",
      kind: "application",
      title: "Bad App",
      status: "active",
      summary: "Test",
      owners: [],  // empty owners on active → error
      confidence: "declared",
    });

    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
      skipDrift: true,
    });

    expect(report.summary.validationErrors).toBeGreaterThan(0);
  });

  it("skip-generate omits generation step", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
    });

    expect(report.steps.find((s) => s.step === "generate")).toBeUndefined();
  });

  it("skip-drift omits drift step", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
      skipDrift: true,
    });

    expect(report.steps.find((s) => s.step === "drift")).toBeUndefined();
  });

  it("fail-fast stops at first failure", async () => {
    writeArtifact(join(tempDir, "ea", "systems"), "APP-bad.yaml", {
      id: "APP-bad",
      schemaVersion: "1.0.0",
      kind: "application",
      title: "Bad App",
      status: "active",
      summary: "Test",
      owners: [],
      confidence: "declared",
    });

    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
      failFast: true,
    });

    // Should have validate step but drift should be skipped due to fail-fast
    const valStep = report.steps.find((s) => s.step === "validate");
    expect(valStep).toBeDefined();

    // If validate failed, drift should not have run
    if (valStep && !valStep.passed) {
      expect(report.steps.find((s) => s.step === "drift")).toBeUndefined();
    }
  });

  it("includes sub-reports in output", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
    });

    expect(report.validationResult).toBeDefined();
    expect(report.driftReport).toBeDefined();
  });

  it("runs generation step when not skipped", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
    });

    expect(report.steps.find((s) => s.step === "generate")).toBeDefined();
    expect(report.generationReport).toBeDefined();
  });
});

// ─── renderReconcileOutput ──────────────────────────────────────────────────────

describe("renderReconcileOutput", () => {
  it("renders passing report", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
    });

    const output = renderReconcileOutput(report);
    expect(output).toContain("✓");
    expect(output).toContain("PASSED");
  });

  it("renders failing report with error details", async () => {
    writeArtifact(join(tempDir, "ea", "systems"), "APP-bad.yaml", {
      id: "APP-bad",
      schemaVersion: "1.0.0",
      kind: "application",
      title: "Bad App",
      status: "active",
      summary: "Test",
      owners: [],
      confidence: "declared",
    });

    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
      skipDrift: true,
    });

    const output = renderReconcileOutput(report);
    expect(output).toContain("✗");
  });

  it("includes step-by-step output", async () => {
    const report = await reconcileEaProject({
      projectRoot: tempDir,
      eaRoot: "ea",
      skipGenerate: true,
    });

    const output = renderReconcileOutput(report);
    expect(output).toContain("Validate");
    expect(output).toContain("Drift");
  });
});
