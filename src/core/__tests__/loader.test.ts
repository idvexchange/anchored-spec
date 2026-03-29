import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SpecRoot, resolveConfig, findProjectRoot } from "../loader.js";

function createTempDir(): string {
  const dir = join(tmpdir(), `anchored-spec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("resolveConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("returns defaults when no config file exists", () => {
    const config = resolveConfig(tempDir);
    expect(config.specRoot).toBe("specs");
    expect(config.requirementsDir).toBe("specs/requirements");
  });

  it("merges config file with defaults and cascades specRoot", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(
      join(tempDir, ".anchored-spec", "config.json"),
      JSON.stringify({ specRoot: "custom-specs" })
    );
    const config = resolveConfig(tempDir);
    expect(config.specRoot).toBe("custom-specs");
    expect(config.requirementsDir).toBe("custom-specs/requirements"); // cascaded from specRoot
    expect(config.changesDir).toBe("custom-specs/changes");
    expect(config.decisionsDir).toBe("custom-specs/decisions");
    expect(config.generatedDir).toBe("custom-specs/generated");
  });

  it("allows explicit subdirectory overrides", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(
      join(tempDir, ".anchored-spec", "config.json"),
      JSON.stringify({ specRoot: "custom-specs", requirementsDir: "reqs" })
    );
    const config = resolveConfig(tempDir);
    expect(config.specRoot).toBe("custom-specs");
    expect(config.requirementsDir).toBe("reqs"); // explicit override wins
    expect(config.changesDir).toBe("custom-specs/changes"); // cascaded
  });

  it("handles malformed config JSON gracefully", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(join(tempDir, ".anchored-spec", "config.json"), "not valid json");
    expect(() => resolveConfig(tempDir)).toThrow();
  });
});

describe("findProjectRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("finds project root from nested directory", () => {
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(join(tempDir, ".anchored-spec", "config.json"), "{}");
    mkdirSync(join(tempDir, "src", "components"), { recursive: true });
    const found = findProjectRoot(join(tempDir, "src", "components"));
    expect(found).toBe(tempDir);
  });

  it("finds project root via specs/requirements directory", () => {
    mkdirSync(join(tempDir, "specs", "requirements"), { recursive: true });
    mkdirSync(join(tempDir, "src"), { recursive: true });
    const found = findProjectRoot(join(tempDir, "src"));
    expect(found).toBe(tempDir);
  });

  it("returns null when no project root found", () => {
    const found = findProjectRoot(tempDir);
    expect(found).toBeNull();
  });
});

describe("SpecRoot", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("resolves paths relative to project root", () => {
    const spec = new SpecRoot(tempDir);
    expect(spec.requirementsDir).toBe(join(tempDir, "specs", "requirements"));
    expect(spec.changesDir).toBe(join(tempDir, "specs", "changes"));
    expect(spec.decisionsDir).toBe(join(tempDir, "specs", "decisions"));
  });

  it("reports not initialized when spec root missing", () => {
    const spec = new SpecRoot(tempDir);
    expect(spec.isInitialized()).toBe(false);
  });

  it("reports initialized when spec root exists", () => {
    mkdirSync(join(tempDir, "specs"), { recursive: true });
    const spec = new SpecRoot(tempDir);
    expect(spec.isInitialized()).toBe(true);
  });

  it("accepts custom config", () => {
    const spec = new SpecRoot(tempDir, {
      specRoot: "my-specs",
      requirementsDir: "my-specs/reqs",
    });
    expect(spec.requirementsDir).toBe(join(tempDir, "my-specs", "reqs"));
  });
});

describe("SpecRoot.loadRequirements", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, "specs", "requirements"), { recursive: true });
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("returns empty array when directory is empty", () => {
    const spec = new SpecRoot(tempDir);
    expect(spec.loadRequirements()).toEqual([]);
  });

  it("returns empty array when directory does not exist", () => {
    const spec = new SpecRoot(tempDir, { specRoot: "nonexistent" });
    expect(spec.loadRequirements()).toEqual([]);
  });

  it("loads requirement JSON files", () => {
    writeFileSync(
      join(tempDir, "specs", "requirements", "REQ-1.json"),
      JSON.stringify({ id: "REQ-1", title: "Test" })
    );
    const spec = new SpecRoot(tempDir);
    const reqs = spec.loadRequirements();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.id).toBe("REQ-1");
  });

  it("only loads files matching REQ-*.json pattern", () => {
    writeFileSync(
      join(tempDir, "specs", "requirements", "REQ-1.json"),
      JSON.stringify({ id: "REQ-1" })
    );
    writeFileSync(
      join(tempDir, "specs", "requirements", "notes.json"),
      JSON.stringify({ notes: "should be skipped" })
    );
    writeFileSync(
      join(tempDir, "specs", "requirements", ".gitkeep"),
      ""
    );
    const spec = new SpecRoot(tempDir);
    expect(spec.loadRequirements()).toHaveLength(1);
  });

  it("throws with file path on malformed JSON", () => {
    writeFileSync(
      join(tempDir, "specs", "requirements", "REQ-1.json"),
      "{ invalid json"
    );
    const spec = new SpecRoot(tempDir);
    expect(() => spec.loadRequirements()).toThrow(/Failed to parse.*REQ-1\.json/);
  });
});

describe("SpecRoot.loadChanges", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, "specs", "changes"), { recursive: true });
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("loads changes from nested directories", () => {
    const changeDir = join(tempDir, "specs", "changes", "CHG-2025-0001-test");
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(
      join(changeDir, "change.json"),
      JSON.stringify({ id: "CHG-2025-0001-test", title: "Test" })
    );
    const spec = new SpecRoot(tempDir);
    const changes = spec.loadChanges();
    expect(changes).toHaveLength(1);
    expect(changes[0]!.id).toBe("CHG-2025-0001-test");
  });

  it("loads changes from flat JSON files", () => {
    writeFileSync(
      join(tempDir, "specs", "changes", "change.json"),
      JSON.stringify({ id: "CHG-2025-0001-flat" })
    );
    const spec = new SpecRoot(tempDir);
    expect(spec.loadChanges()).toHaveLength(1);
  });
});

describe("SpecRoot.loadWorkflowPolicy", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    mkdirSync(join(tempDir, "specs"), { recursive: true });
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("returns null when policy file does not exist", () => {
    const spec = new SpecRoot(tempDir);
    expect(spec.loadWorkflowPolicy()).toBeNull();
  });

  it("loads policy from file", () => {
    const policy = { workflowVariants: [], changeRequiredRules: [], trivialExemptions: [], lifecycleRules: {} };
    writeFileSync(
      join(tempDir, "specs", "workflow-policy.json"),
      JSON.stringify(policy)
    );
    const spec = new SpecRoot(tempDir);
    const loaded = spec.loadWorkflowPolicy();
    expect(loaded).not.toBeNull();
    expect(loaded!.trivialExemptions).toEqual([]);
  });
});

describe("SpecRoot.getSummary", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("returns zeroes when not initialized", () => {
    const spec = new SpecRoot(tempDir);
    const summary = spec.getSummary();
    expect(summary.initialized).toBe(false);
    expect(summary.requirementCount).toBe(0);
    expect(summary.changeCount).toBe(0);
    expect(summary.decisionCount).toBe(0);
  });

  it("counts artifacts correctly", () => {
    mkdirSync(join(tempDir, "specs", "requirements"), { recursive: true });
    mkdirSync(join(tempDir, "specs", "changes", "CHG-2025-0001-a"), { recursive: true });
    mkdirSync(join(tempDir, "specs", "decisions"), { recursive: true });

    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), "{}");
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-2.json"), "{}");
    writeFileSync(join(tempDir, "specs", "changes", "CHG-2025-0001-a", "change.json"), "{}");
    writeFileSync(join(tempDir, "specs", "decisions", "ADR-1.json"), "{}");

    const spec = new SpecRoot(tempDir);
    const summary = spec.getSummary();
    expect(summary.initialized).toBe(true);
    expect(summary.requirementCount).toBe(2);
    expect(summary.changeCount).toBe(1);
    expect(summary.decisionCount).toBe(1);
  });

  it("eaEnabled returns false when EA is not configured", () => {
    const spec = new SpecRoot(tempDir);
    expect(spec.eaEnabled).toBe(false);
  });

  it("eaEnabled returns true when EA is configured with enabled: true", () => {
    mkdirSync(join(tempDir, "specs"), { recursive: true });
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(
      join(tempDir, ".anchored-spec", "config.json"),
      JSON.stringify({ specRoot: "specs", ea: { enabled: true } }),
    );
    const spec = new SpecRoot(tempDir);
    expect(spec.eaEnabled).toBe(true);
  });

  it("getEaRoot returns null when EA is not enabled", async () => {
    const spec = new SpecRoot(tempDir);
    const eaRoot = await spec.getEaRoot();
    expect(eaRoot).toBeNull();
  });

  it("getEaRoot returns an EaRoot when EA is enabled", async () => {
    mkdirSync(join(tempDir, "specs"), { recursive: true });
    mkdirSync(join(tempDir, ".anchored-spec"), { recursive: true });
    writeFileSync(
      join(tempDir, ".anchored-spec", "config.json"),
      JSON.stringify({ specRoot: "specs", ea: { enabled: true } }),
    );
    const spec = new SpecRoot(tempDir);
    const eaRoot = await spec.getEaRoot();
    expect(eaRoot).not.toBeNull();
    expect(eaRoot!.projectRoot).toBe(spec.projectRoot);
  });
});
