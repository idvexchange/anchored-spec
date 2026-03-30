/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for EaRoot v1.0 enhancements — static factory methods,
 * policy loading, verification loading, quick summary.
 *
 * Covers:
 *   - EaRoot.findProjectRoot()
 *   - EaRoot.resolveProjectConfig()
 *   - EaRoot.fromDirectory()
 *   - EaRoot constructor with v1 config
 *   - loadPolicy() — JSON and YAML
 *   - loadVerifications()
 *   - getQuickSummary()
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EaRoot } from "../loader.js";
import { resolveConfigV1 } from "../config.js";
import type { AnchoredSpecConfigV1 } from "../config.js";

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `ea-root-v1-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function scaffoldProject(root: string, configOverrides?: Partial<AnchoredSpecConfigV1>): AnchoredSpecConfigV1 {
  const config = resolveConfigV1(configOverrides);
  mkdirSync(join(root, ".anchored-spec"), { recursive: true });
  writeFileSync(join(root, ".anchored-spec", "config.json"), JSON.stringify(config, null, 2));
  for (const domain of Object.values(config.domains)) {
    mkdirSync(join(root, domain), { recursive: true });
  }
  mkdirSync(join(root, config.generatedDir), { recursive: true });
  return config;
}

// ─── findProjectRoot ────────────────────────────────────────────────────────────

describe("EaRoot.findProjectRoot", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("finds root with .anchored-spec/config.json", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(join(tempDir, ".anchored-spec", "config.json"), "{}");
    const result = EaRoot.findProjectRoot(tempDir);
    expect(result).toBe(tempDir);
  });

  it("finds root in parent directory", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(join(tempDir, ".anchored-spec", "config.json"), "{}");
    const childDir = join(tempDir, "src", "deep");
    mkdirSync(childDir, { recursive: true });
    const result = EaRoot.findProjectRoot(childDir);
    expect(result).toBe(tempDir);
  });

  it("finds root with ea/systems directory", () => {
    mkdirSync(join(tempDir, "ea", "systems"), { recursive: true });
    const result = EaRoot.findProjectRoot(tempDir);
    expect(result).toBe(tempDir);
  });

  it("finds root with legacy specs/requirements", () => {
    mkdirSync(join(tempDir, "specs", "requirements"), { recursive: true });
    const result = EaRoot.findProjectRoot(tempDir);
    expect(result).toBe(tempDir);
  });

  it("returns null when no project root found", () => {
    const result = EaRoot.findProjectRoot(join(tmpdir(), "nonexistent-" + Date.now()));
    expect(result).toBeNull();
  });
});

// ─── resolveProjectConfig ───────────────────────────────────────────────────────

describe("EaRoot.resolveProjectConfig", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("reads and resolves v1.0 config", () => {
    const written = scaffoldProject(tempDir);
    const config = EaRoot.resolveProjectConfig(tempDir);
    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe(written.rootDir);
  });

  it("auto-migrates v0.x config to v1.0", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(
      join(tempDir, ".anchored-spec", "config.json"),
      JSON.stringify({
        specRoot: "specs",
        sourceRoots: ["src"],
        ea: { enabled: true, rootDir: "ea" },
      })
    );
    const config = EaRoot.resolveProjectConfig(tempDir);
    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("ea");
    expect(config.sourceRoots).toEqual(["src"]);
  });

  it("returns defaults when no config file exists", () => {
    const config = EaRoot.resolveProjectConfig(tempDir);
    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("ea");
  });
});

// ─── fromDirectory ──────────────────────────────────────────────────────────────

describe("EaRoot.fromDirectory", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("creates EaRoot from project with config", () => {
    scaffoldProject(tempDir);
    const root = EaRoot.fromDirectory(tempDir);
    expect(root).not.toBeNull();
    expect(root!.projectRoot).toBe(tempDir);
    expect(root!.v1Config).not.toBeNull();
    expect(root!.v1Config!.schemaVersion).toBe("1.0");
  });

  it("creates EaRoot from nested child directory", () => {
    scaffoldProject(tempDir);
    const childDir = join(tempDir, "src", "components");
    mkdirSync(childDir, { recursive: true });
    const root = EaRoot.fromDirectory(childDir);
    expect(root).not.toBeNull();
    expect(root!.projectRoot).toBe(tempDir);
  });

  it("returns null when no project root found", () => {
    const result = EaRoot.fromDirectory(join(tmpdir(), "nonexistent-" + Date.now()));
    expect(result).toBeNull();
  });
});

// ─── Constructor with v1 config ─────────────────────────────────────────────────

describe("EaRoot constructor with v1 config", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("accepts AnchoredSpecConfigV1 directly", () => {
    const config = resolveConfigV1({ rootDir: "arch" });
    const root = new EaRoot(tempDir, config);
    expect(root.eaConfig.enabled).toBe(true);
    expect(root.eaConfig.rootDir).toBe("arch");
    expect(root.v1Config).not.toBeNull();
    expect(root.v1Config!.schemaVersion).toBe("1.0");
  });

  it("accepts legacy AnchoredSpecConfig", () => {
    const root = new EaRoot(tempDir, {
      specRoot: "specs",
      ea: { enabled: true, rootDir: "ea" },
    } as any);
    expect(root.eaConfig.enabled).toBe(true);
    expect(root.v1Config).toBeNull();
  });
});

// ─── loadPolicy ─────────────────────────────────────────────────────────────────

describe("EaRoot.loadPolicy", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("loads JSON policy file", () => {
    const config = scaffoldProject(tempDir, {
      workflowPolicyPath: "ea/workflow-policy.json",
    });
    const policyPath = join(tempDir, "ea", "workflow-policy.json");
    writeFileSync(policyPath, JSON.stringify({
      workflowVariants: [{ id: "feature", name: "Feature" }],
    }));
    const root = new EaRoot(tempDir, config);
    const policy = root.loadPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.workflowVariants).toHaveLength(1);
  });

  it("loads YAML policy file", () => {
    const config = scaffoldProject(tempDir);
    const policyPath = join(tempDir, "ea", "workflow-policy.yaml");
    writeFileSync(policyPath, "workflowVariants:\n  - id: feature\n    name: Feature\n");
    const root = new EaRoot(tempDir, config);
    const policy = root.loadPolicy();
    expect(policy).not.toBeNull();
    expect(policy!.workflowVariants).toHaveLength(1);
  });

  it("returns null when policy file does not exist", () => {
    const config = scaffoldProject(tempDir);
    const root = new EaRoot(tempDir, config);
    const policy = root.loadPolicy();
    expect(policy).toBeNull();
  });
});

// ─── loadVerifications ──────────────────────────────────────────────────────────

describe("EaRoot.loadVerifications", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("loads verification files from transitions domain", () => {
    const config = scaffoldProject(tempDir);
    const transDir = join(tempDir, "ea", "transitions", "wave-1");
    mkdirSync(transDir, { recursive: true });
    writeFileSync(join(transDir, "verification.json"), JSON.stringify({
      changeId: "CHG-001",
      commands: [{ name: "build", command: "npm run build", required: true }],
    }));
    const root = new EaRoot(tempDir, config);
    const verifications = root.loadVerifications();
    expect(verifications).toHaveLength(1);
    expect(verifications[0]!.changeId).toBe("CHG-001");
  });

  it("returns empty array when no verifications exist", () => {
    const config = scaffoldProject(tempDir);
    const root = new EaRoot(tempDir, config);
    const verifications = root.loadVerifications();
    expect(verifications).toEqual([]);
  });
});

// ─── getQuickSummary ────────────────────────────────────────────────────────────

describe("EaRoot.getQuickSummary", () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir(); });
  afterEach(() => { cleanDir(tempDir); });

  it("returns initialized=false when not initialized", () => {
    const config = resolveConfigV1();
    const root = new EaRoot(tempDir, config);
    const summary = root.getQuickSummary();
    expect(summary.initialized).toBe(false);
    expect(summary.totalFiles).toBe(0);
  });

  it("counts artifact files by domain", () => {
    const config = scaffoldProject(tempDir);
    // Write test artifacts
    writeFileSync(join(tempDir, "ea", "systems", "app.json"), JSON.stringify({ id: "APP-1" }));
    writeFileSync(join(tempDir, "ea", "systems", "svc.yaml"), "kind: service\nid: SVC-1\n");
    writeFileSync(join(tempDir, "ea", "data", "ds.json"), JSON.stringify({ id: "DS-1" }));
    const root = new EaRoot(tempDir, config);
    const summary = root.getQuickSummary();
    expect(summary.initialized).toBe(true);
    expect(summary.totalFiles).toBe(3);
    expect(summary.fileCountByDomain.systems).toBe(2);
    expect(summary.fileCountByDomain.data).toBe(1);
  });

  it("reports hasPolicy when policy file exists", () => {
    const config = scaffoldProject(tempDir);
    writeFileSync(join(tempDir, "ea", "workflow-policy.yaml"), "test: true\n");
    const root = new EaRoot(tempDir, config);
    const summary = root.getQuickSummary();
    expect(summary.hasPolicy).toBe(true);
  });
});
