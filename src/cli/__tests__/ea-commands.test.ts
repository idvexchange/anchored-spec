import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `anchored-spec-ea-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function runCLI(
  args: string,
  cwd: string,
): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const error = err as { status: number; stdout: string; stderr: string };
    return {
      stdout: (error.stdout ?? "") + (error.stderr ?? ""),
      exitCode: error.status ?? 1,
    };
  }
}

// ─── EA Top-Level Command ────────────────────────────────────────────────────

describe("CLI: ea", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("shows help text", () => {
    const result = runCLI("ea --help", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Deprecated");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("validate");
    expect(result.stdout).toContain("graph");
    expect(result.stdout).toContain("report");
  });
});

// ─── EA Init ─────────────────────────────────────────────────────────────────

describe("CLI: ea init", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("creates EA directory structure", () => {
    const result = runCLI("ea init", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("initialized");
    expect(existsSync(join(tempDir, "ea", "systems"))).toBe(true);
    expect(existsSync(join(tempDir, "ea", "delivery"))).toBe(true);
    expect(existsSync(join(tempDir, "ea", "data"))).toBe(true);
    expect(existsSync(join(tempDir, "ea", "information"))).toBe(true);
    expect(existsSync(join(tempDir, "ea", "business"))).toBe(true);
    expect(existsSync(join(tempDir, "ea", "transitions"))).toBe(true);
    expect(existsSync(join(tempDir, "ea", "generated"))).toBe(true);
  });

  it("creates config file with v1.0 format", () => {
    runCLI("ea init", tempDir);
    const configPath = join(tempDir, ".anchored-spec", "config.json");
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.schemaVersion).toBe("1.0");
    expect(config.rootDir).toBe("ea");
  });

  it("creates .gitkeep files in subdirectories", () => {
    runCLI("ea init", tempDir);
    expect(
      existsSync(join(tempDir, "ea", "systems", ".gitkeep")),
    ).toBe(true);
    expect(
      existsSync(join(tempDir, "ea", "delivery", ".gitkeep")),
    ).toBe(true);
  });

  it("creates example artifacts with --with-examples", () => {
    const result = runCLI("ea init --with-examples", tempDir);
    expect(result.exitCode).toBe(0);
    expect(
      existsSync(join(tempDir, "ea", "systems", "APP-example-service.yaml")),
    ).toBe(true);
    expect(
      existsSync(join(tempDir, "ea", "delivery", "ENV-development.yaml")),
    ).toBe(true);
  });

  it("uses custom root directory with --root-dir", () => {
    const result = runCLI("ea init --root-dir architecture", tempDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "architecture", "systems"))).toBe(true);
    expect(existsSync(join(tempDir, "architecture", "delivery"))).toBe(true);
  });

  it("is idempotent (can run twice)", () => {
    runCLI("ea init", tempDir);
    const result = runCLI("ea init", tempDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "ea", "systems"))).toBe(true);
  });
});

// ─── EA Create ───────────────────────────────────────────────────────────────

describe("CLI: ea create", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("creates an application artifact in YAML", () => {
    const result = runCLI(
      'ea create application --title "Order Service"',
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("APP-order-service");
    expect(result.stdout).toContain("application");

    const filePath = join(tempDir, "ea", "systems", "APP-order-service.yaml");
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("kind: application");
    expect(content).toContain("id: APP-order-service");
    expect(content).toContain("name: Order Service");
  });

  it("creates a deployment artifact", () => {
    const result = runCLI(
      'ea create deployment --title "Production K8s"',
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const filePath = join(
      tempDir,
      "ea",
      "delivery",
      "DEPLOY-production-k8s.yaml",
    );
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("kind: deployment");
  });

  it("creates an environment artifact", () => {
    const result = runCLI(
      'ea create environment --title "Staging"',
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const filePath = join(tempDir, "ea", "delivery", "ENV-staging.yaml");
    expect(existsSync(filePath)).toBe(true);
  });

  it("creates a platform artifact", () => {
    const result = runCLI(
      'ea create platform --title "Core Platform"',
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    // Platform is in the delivery domain
    const filePath = join(
      tempDir,
      "ea",
      "delivery",
      "PLAT-core-platform.yaml",
    );
    expect(existsSync(filePath)).toBe(true);
  });

  it("creates artifact in JSON format", () => {
    const result = runCLI(
      'ea create application --title "JSON App" --json',
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const filePath = join(tempDir, "ea", "systems", "APP-json-app.json");
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content.kind).toBe("application");
    expect(content.id).toBe("APP-json-app");
    expect(content.title).toBe("JSON App");
  });

  it("places artifacts in correct domain directories", () => {
    // Systems domain kinds
    runCLI('ea create application --title "Test App"', tempDir);
    expect(
      existsSync(join(tempDir, "ea", "systems", "APP-test-app.yaml")),
    ).toBe(true);

    // Delivery domain kinds
    runCLI('ea create deployment --title "Test Deploy"', tempDir);
    expect(
      existsSync(join(tempDir, "ea", "delivery", "DEPLOY-test-deploy.yaml")),
    ).toBe(true);
  });

  it("fails for unknown kind", () => {
    const result = runCLI(
      'ea create unknown-kind --title "Test"',
      tempDir,
    );
    expect(result.exitCode).not.toBe(0);
  });

  it("slugifies titles correctly", () => {
    const result = runCLI(
      'ea create application --title "My Complex App Name!"',
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    expect(
      existsSync(
        join(tempDir, "ea", "systems", "APP-my-complex-app-name.yaml"),
      ),
    ).toBe(true);
  });
});

// ─── EA Validate ─────────────────────────────────────────────────────────────

describe("CLI: ea validate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("passes validation with no artifacts", () => {
    const result = runCLI("ea validate", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0 artifacts");
  });

  it("validates created artifacts successfully", () => {
    runCLI('ea create application --title "My App"', tempDir);
    const result = runCLI("ea validate", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("1 artifacts");
  });

  it("reports validation errors for invalid artifacts", () => {
    // Write a malformed artifact
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-bad.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: application
id: bad-id-no-prefix

metadata:
  name: Bad App
  summary: Missing proper ID prefix
  owners: []
  tags: []
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations: []
`,
    );
    const result = runCLI("ea validate", tempDir);
    // Should have errors (id-format violation: id doesn't start with APP-)
    expect(result.stdout).toContain("error");
  });

  it("outputs JSON with --json flag", () => {
    runCLI('ea create application --title "Test"', tempDir);
    const result = runCLI("ea validate --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty("valid");
    expect(json).toHaveProperty("artifactsLoaded");
    expect(json).toHaveProperty("errors");
    expect(json).toHaveProperty("warnings");
    expect(json).toHaveProperty("summary");
  });

  it("filters by domain with --domain", () => {
    runCLI('ea create application --title "App 1"', tempDir);
    runCLI('ea create environment --title "Dev Env"', tempDir);
    const result = runCLI("ea validate --domain systems --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    // Domain filter loads only systems artifacts
    expect(json.artifactsLoaded).toBe(1);
  });

  it("fails with --strict on warnings", () => {
    runCLI('ea create application --title "Lonely App"', tempDir);
    const result = runCLI("ea validate --strict", tempDir);
    // Orphan artifact is a warning; --strict promotes to error
    expect(result.exitCode).toBe(1);
  });

  it("detects duplicate IDs", () => {
    // Create two artifacts with the same ID
    const yaml = `apiVersion: anchored-spec/ea/v1
kind: application
id: APP-duplicate

metadata:
  name: Duplicate App
  summary: Duplicate test
  owners:
    - team-a
  tags: []
  confidence: declared
  status: draft
  schemaVersion: "1.0.0"

relations: []
`;
    writeFileSync(join(tempDir, "ea", "systems", "APP-duplicate.yaml"), yaml);
    writeFileSync(join(tempDir, "ea", "systems", "APP-duplicate-2.yaml"), yaml);

    const result = runCLI("ea validate", tempDir);
    expect(result.stdout).toContain("duplicate");
  });
});

// ─── EA Graph ────────────────────────────────────────────────────────────────

describe("CLI: ea graph", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("outputs Mermaid graph by default", () => {
    runCLI('ea create application --title "App A"', tempDir);
    const result = runCLI("ea graph", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("graph LR");
    // Graph now uses entity refs as node IDs (sanitized for Mermaid)
    expect(result.stdout).toContain("app-a");
  });

  it("outputs Mermaid with --format mermaid", () => {
    runCLI('ea create application --title "Test"', tempDir);
    const result = runCLI("ea graph --format mermaid", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("graph LR");
  });

  it("outputs DOT with --format dot", () => {
    runCLI('ea create application --title "Test"', tempDir);
    const result = runCLI("ea graph --format dot", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("digraph");
  });

  it("outputs JSON with --format json", () => {
    runCLI('ea create application --title "Test"', tempDir);
    const result = runCLI("ea graph --format json", tempDir);
    expect(result.exitCode).toBe(0);
    // Single isolated node has no outgoing edges → adjacency JSON is {}
    const json = JSON.parse(result.stdout);
    expect(typeof json).toBe("object");
  });

  it("shows relations between artifacts", () => {
    // Create two artifacts with a relation
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-frontend.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: application
id: APP-frontend

metadata:
  name: Frontend App
  summary: UI application
  owners:
    - team-ui
  tags: []
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations:
  - type: uses
    target: APP-backend
`,
    );
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-backend.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: application
id: APP-backend

metadata:
  name: Backend App
  summary: API backend
  owners:
    - team-api
  tags: []
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations: []
`,
    );

    const result = runCLI("ea graph --format mermaid", tempDir);
    expect(result.exitCode).toBe(0);
    // Graph uses entity refs as node IDs (sanitized for Mermaid)
    expect(result.stdout).toContain("frontend");
    expect(result.stdout).toContain("backend");
    expect(result.stdout).toContain("uses");
  });

  it("handles empty graph gracefully", () => {
    const result = runCLI("ea graph", tempDir);
    expect(result.exitCode).toBe(0);
  });
});

// ─── EA Report ───────────────────────────────────────────────────────────────

describe("CLI: ea report", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("outputs markdown system-data-matrix", () => {
    runCLI('ea create application --title "My App"', tempDir);
    const result = runCLI(
      "ea report --view system-data-matrix",
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# System-Data Matrix");
  });

  it("outputs JSON system-data-matrix", () => {
    runCLI('ea create application --title "My App"', tempDir);
    const result = runCLI(
      "ea report --view system-data-matrix --format json",
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty("applications");
    expect(json).toHaveProperty("dataStores");
    expect(json).toHaveProperty("matrix");
    expect(json).toHaveProperty("summary");
  });

  it("shows connections when artifacts have relations", () => {
    // Create app with uses relation to data store
    writeFileSync(
      join(tempDir, "ea", "systems", "APP-test.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: application
id: APP-test

metadata:
  name: Test App
  summary: A test application for reports
  owners:
    - team-test
  tags: []
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations:
  - type: uses
    target: STORE-test-db
`,
    );
    writeFileSync(
      join(tempDir, "ea", "data", "STORE-test-db.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: data-store
id: STORE-test-db

metadata:
  name: Test Database
  summary: A test PostgreSQL database
  owners:
    - team-data
  tags: []
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

technology:
  engine: postgresql
  category: relational

relations: []
`,
    );

    const result = runCLI(
      "ea report --view system-data-matrix --format json",
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.summary.connectionCount).toBe(1);
    expect(json.matrix[0].applicationId).toBe("component:test");
    expect(json.matrix[0].dataStoreId).toBe("resource:test-db");
  });

  it("fails for unknown view", () => {
    const result = runCLI(
      "ea report --view unknown-view",
      tempDir,
    );
    expect(result.exitCode).not.toBe(0);
  });
});

// ─── EA link-docs ────────────────────────────────────────────────────────────

describe("CLI: ea link-docs --bidirectional", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
    // Create an artifact with a traceRef pointing at a .md file and a .ts file
    mkdirSync(join(tempDir, "docs"), { recursive: true });
    mkdirSync(join(tempDir, "apps", "api", "src"), { recursive: true });

    writeFileSync(
      join(tempDir, "ea", "systems", "SVC-api.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: service
id: SVC-api

metadata:
  name: API Service
  summary: The API service
  owners: [team-api]
  tags: [api]
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations: []

traceRefs:
  - path: docs/api-design.md
    role: context
  - path: apps/api/src/index.ts
    role: source
`,
    );

    // Create the referenced files
    writeFileSync(
      join(tempDir, "docs", "api-design.md"),
      "---\ntype: spec\n---\n# API Design\n",
    );
    writeFileSync(
      join(tempDir, "apps", "api", "src", "index.ts"),
      'export function main() { console.log("hello"); }\n',
    );
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("adds frontmatter to .md files referenced by traceRefs", () => {
    const result = runCLI("link-docs --bidirectional", tempDir);
    expect(result.exitCode).toBe(0);

    const mdContent = readFileSync(
      join(tempDir, "docs", "api-design.md"),
      "utf-8",
    );
    expect(mdContent).toContain("SVC-api");
  });

  it("does not inject frontmatter into .ts files", () => {
    const result = runCLI("link-docs --bidirectional", tempDir);
    expect(result.exitCode).toBe(0);

    const tsContent = readFileSync(
      join(tempDir, "apps", "api", "src", "index.ts"),
      "utf-8",
    );
    // .ts file must be untouched — no YAML frontmatter injected
    expect(tsContent).not.toContain("---");
    expect(tsContent).not.toContain("ea-artifacts");
    expect(tsContent).toBe(
      'export function main() { console.log("hello"); }\n',
    );
  });

  it("skips non-markdown files in dry-run as well", () => {
    const result = runCLI("link-docs --bidirectional --dry-run --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    // Only the .md file should appear in docsUpdated, not the .ts file
    const updatedPaths = json.docsUpdated.map(
      (d: { path: string }) => d.path,
    );
    expect(updatedPaths).toContain("docs/api-design.md");
    expect(updatedPaths).not.toContain("apps/api/src/index.ts");
  });
});

// ─── EA trace --check severity classification ────────────────────────────────

describe("CLI: trace --check severity", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
    mkdirSync(join(tempDir, "docs"), { recursive: true });
    mkdirSync(join(tempDir, "apps", "api", "src"), { recursive: true });

    // Artifact with traceRefs to both .md and .ts files (both exist, no backlink)
    writeFileSync(
      join(tempDir, "ea", "systems", "SVC-mixed.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: service
id: SVC-mixed

metadata:
  name: Mixed Service
  summary: Service with mixed trace targets
  owners: [team-core]
  tags: [core]
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations: []

traceRefs:
  - path: docs/design.md
    role: context
  - path: apps/api/src/handler.ts
    role: source
`,
    );

    // Create the referenced files (no frontmatter in the .md)
    writeFileSync(
      join(tempDir, "docs", "design.md"),
      "# Design\nNo frontmatter here.\n",
    );
    writeFileSync(
      join(tempDir, "apps", "api", "src", "handler.ts"),
      'export function handle() {}\n',
    );
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("classifies .md one-way links as warning and .ts as info in JSON", () => {
    const result = runCLI("trace --check --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.oneWayArtifactToDoc).toHaveLength(2);

    const mdLink = json.oneWayArtifactToDoc.find(
      (o: { path: string }) => o.path === "docs/design.md",
    );
    const tsLink = json.oneWayArtifactToDoc.find(
      (o: { path: string }) => o.path === "apps/api/src/handler.ts",
    );

    expect(mdLink).toBeDefined();
    expect(mdLink.severity).toBe("warning");
    expect(mdLink.reason).toBe("missing frontmatter");

    expect(tsLink).toBeDefined();
    expect(tsLink.severity).toBe("info");
    expect(tsLink.reason).toBe("non-markdown file");
  });

  it("shows different indicators for actionable vs structural in human output", () => {
    const result = runCLI("trace --check", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("actionable");
    expect(result.stdout).toContain("structural");
  });
});

// ─── EA trace --fix-broken ───────────────────────────────────────────────────

describe("CLI: trace --fix-broken", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
    mkdirSync(join(tempDir, "docs"), { recursive: true });

    // Artifact with one valid and one broken traceRef
    writeFileSync(
      join(tempDir, "ea", "systems", "SVC-stale.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: service
id: SVC-stale

metadata:
  name: Stale Service
  summary: Service with broken refs
  owners: [team-core]
  tags: [core]
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations: []

traceRefs:
  - path: docs/existing.md
    role: context
  - path: docs/deleted-spec.md
    role: context
  - path: docs/also-deleted.md
    role: context
`,
    );

    // Only create the first doc — the other two are "deleted"
    writeFileSync(
      join(tempDir, "docs", "existing.md"),
      "---\nea-artifacts: [SVC-stale]\n---\n# Existing\n",
    );
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("reports broken refs in dry-run without modifying files", () => {
    const result = runCLI("trace --fix-broken --dry-run --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.dryRun).toBe(true);
    expect(json.removed).toHaveLength(2);
    expect(json.removed.map((r: { path: string }) => r.path)).toContain(
      "docs/deleted-spec.md",
    );
    expect(json.removed.map((r: { path: string }) => r.path)).toContain(
      "docs/also-deleted.md",
    );

    // File should be unchanged
    const artifact = readFileSync(
      join(tempDir, "ea", "systems", "SVC-stale.yaml"),
      "utf-8",
    );
    expect(artifact).toContain("deleted-spec.md");
  });

  it("removes broken traceRefs and keeps valid ones", () => {
    const result = runCLI("trace --fix-broken --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.dryRun).toBe(false);
    expect(json.removed).toHaveLength(2);
    expect(json.artifactsModified).toBe(1);

    // Artifact file should now only have the valid ref
    const artifact = readFileSync(
      join(tempDir, "ea", "systems", "SVC-stale.yaml"),
      "utf-8",
    );
    expect(artifact).toContain("docs/existing.md");
    expect(artifact).not.toContain("deleted-spec.md");
    expect(artifact).not.toContain("also-deleted.md");
  });

  it("reports nothing to remove when all refs are valid", () => {
    // Remove the broken refs first
    runCLI("trace --fix-broken", tempDir);

    // Run again — should find nothing
    const result = runCLI("trace --fix-broken --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.removed).toHaveLength(0);
    expect(json.artifactsModified).toBe(0);
  });
});

// ─── batch-update tests ──────────────────────────────────────────────────────

describe("CLI: batch-update", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);

    // Create two services with observed confidence
    runCLI(
      'ea create service --title "Auth Service"',
      tempDir,
    );
    runCLI(
      'ea create service --title "Billing Service"',
      tempDir,
    );
    // Create one application (different kind)
    runCLI(
      'ea create application --title "Main App"',
      tempDir,
    );
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("dry-run reports changes without modifying files", () => {
    const result = runCLI(
      "batch-update --filter confidence=declared --set confidence=approved --dry-run --json",
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.dryRun).toBe(true);
    expect(json.totalUpdated).toBeGreaterThanOrEqual(2);

    // Files should still say declared
    const content = readFileSync(
      join(tempDir, "ea", "systems", "SVC-auth-service.yaml"),
      "utf-8",
    );
    expect(content).toContain("declared");
  });

  it("updates confidence on matching artifacts", () => {
    const result = runCLI(
      "batch-update --filter confidence=declared,kind=service --set confidence=approved --json",
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.totalUpdated).toBe(2);
    expect(json.updated.every((u: { changes: { newValue: string }[] }) =>
      u.changes.some((c) => c.newValue === "approved"),
    )).toBe(true);

    // Verify file was actually changed
    const content = readFileSync(
      join(tempDir, "ea", "systems", "SVC-auth-service.yaml"),
      "utf-8",
    );
    expect(content).toContain("approved");
    expect(content).not.toMatch(/confidence:\s+declared/);
  });

  it("domain filter limits scope", () => {
    const result = runCLI(
      "batch-update --filter confidence=declared --set confidence=approved --domain systems --json",
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    // Services and applications both go to systems domain, so all 3 matched
    expect(json.totalUpdated).toBe(3);
  });

  it("rejects invalid filter field", () => {
    const result = runCLI(
      "batch-update --filter foo=bar --set confidence=declared",
      tempDir,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("Cannot filter");
  });

  it("rejects protected field in --set", () => {
    const result = runCLI(
      "batch-update --filter confidence=declared --set id=new-id",
      tempDir,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("Cannot set protected field");
  });

  it("no-op when no artifacts need changes", () => {
    // First promote
    runCLI(
      "batch-update --filter confidence=declared --set confidence=approved",
      tempDir,
    );
    // Second run - nothing to change
    const result = runCLI(
      "batch-update --filter confidence=approved --set confidence=approved --json",
      tempDir,
    );
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.totalUpdated).toBe(0);
  });
});

// ─── enrich --merge-strategy tests ───────────────────────────────────────────

describe("CLI: enrich --merge-strategy", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
    runCLI(
      'ea create service --title "Merge Service"',
      tempDir,
    );

    // Add initial relations via enrich
    const patchPath = join(tempDir, "initial-patch.json");
    writeFileSync(
      patchPath,
      JSON.stringify({
        relations: [
          { type: "consumes", target: "SVC-other" },
          { type: "owns", target: "SVC-child" },
        ],
      }),
    );
    runCLI(`enrich SVC-merge-service --from ${patchPath}`, tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("append (default) adds new, skips duplicates", () => {
    const patchPath = join(tempDir, "append-patch.json");
    writeFileSync(
      patchPath,
      JSON.stringify({
        relations: [
          { type: "consumes", target: "SVC-other" }, // duplicate
          { type: "produces", target: "SVC-new" }, // new
        ],
      }),
    );

    const result = runCLI(
      `enrich SVC-merge-service --from ${patchPath} --merge-strategy append --dry-run`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    // Should have 3 relations (2 original + 1 new, duplicate skipped)
    expect(result.stdout).toContain("consumes");
    expect(result.stdout).toContain("produces");
    // Count relations entries in dry-run output
    const matches = result.stdout.match(/type:/g);
    expect(matches).toHaveLength(3);
  });

  it("replace overwrites entire relations array", () => {
    const patchPath = join(tempDir, "replace-patch.json");
    writeFileSync(
      patchPath,
      JSON.stringify({
        relations: [
          { type: "produces", target: "SVC-replaced" },
        ],
      }),
    );

    const result = runCLI(
      `enrich SVC-merge-service --from ${patchPath} --merge-strategy replace --dry-run`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    // Should only have the replacement relation
    const matches = result.stdout.match(/type:/g);
    expect(matches).toHaveLength(1);
    expect(result.stdout).toContain("SVC-replaced");
    expect(result.stdout).not.toContain("SVC-child");
  });

  it("upsert updates matched entries and adds new ones", () => {
    const patchPath = join(tempDir, "upsert-patch.json");
    writeFileSync(
      patchPath,
      JSON.stringify({
        relations: [
          { type: "consumes", target: "SVC-other", description: "updated" },
          { type: "produces", target: "SVC-brand-new" },
        ],
      }),
    );

    const result = runCLI(
      `enrich SVC-merge-service --from ${patchPath} --merge-strategy upsert --dry-run`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    // Should have 3 relations: owns (kept), consumes (updated), produces (new)
    const matches = result.stdout.match(/type:/g);
    expect(matches).toHaveLength(3);
    expect(result.stdout).toContain("SVC-brand-new");
    expect(result.stdout).toContain("updated");
  });

  it("rejects invalid strategy", () => {
    const patchPath = join(tempDir, "bad-patch.json");
    writeFileSync(patchPath, JSON.stringify({ relations: [] }));

    const result = runCLI(
      `enrich SVC-merge-service --from ${patchPath} --merge-strategy invalid`,
      tempDir,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain("Invalid merge strategy");
  });
});

// ─── trace --source-annotations tests ────────────────────────────────────────

describe("CLI: trace --source-annotations", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    runCLI("ea init", tempDir);
    mkdirSync(join(tempDir, "docs"), { recursive: true });
    mkdirSync(join(tempDir, "src"), { recursive: true });

    // Create a service artifact with traceRefs to both a doc and a source file
    writeFileSync(
      join(tempDir, "ea", "systems", "SVC-traced.yaml"),
      `apiVersion: anchored-spec/ea/v1
kind: service
id: SVC-traced

metadata:
  name: Traced Service
  summary: Service with source and doc traceRefs
  owners: [team-core]
  tags: [core]
  confidence: declared
  status: active
  schemaVersion: "1.0.0"

relations: []

traceRefs:
  - path: docs/design.md
    role: specification
  - path: src/handler.ts
    role: implementation
`,
    );

    // Doc with proper frontmatter (bidirectional)
    writeFileSync(
      join(tempDir, "docs", "design.md"),
      "---\nea-artifacts: [SVC-traced]\n---\n# Design\n",
    );

    // Source file with @anchored-spec annotation
    writeFileSync(
      join(tempDir, "src", "handler.ts"),
      `// @anchored-spec: SVC-traced
export function handle() {}
`,
    );
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("without --source-annotations, source traceRef is one-way info", () => {
    const result = runCLI("trace --check --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    const sourceOneWay = json.oneWayArtifactToDoc.find(
      (o: { path: string }) => o.path === "src/handler.ts",
    );
    expect(sourceOneWay).toBeDefined();
    expect(sourceOneWay.severity).toBe("info");
    expect(sourceOneWay.reason).toBe("non-markdown file");
  });

  it("with --source-annotations, annotated source becomes bidirectional", () => {
    const result = runCLI("trace --check --source-annotations --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    // Should NOT appear in one-way list anymore
    const sourceOneWay = json.oneWayArtifactToDoc.find(
      (o: { path: string }) => o.path === "src/handler.ts",
    );
    expect(sourceOneWay).toBeUndefined();
    // Bidirectional count should include the source file
    expect(json.bidirectionalCount).toBe(2);
  });

  it("source annotation also works via config sourceAnnotations.enabled", () => {
    // Enable via config instead of CLI flag
    const configPath = join(tempDir, ".anchored-spec", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.sourceAnnotations = { enabled: true };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

    const result = runCLI("trace --check --json", tempDir);
    expect(result.exitCode).toBe(0);

    const json = JSON.parse(result.stdout);
    expect(json.bidirectionalCount).toBe(2);
  });
});

// ─── init --version-policy-defaults tests ────────────────────────────────────

describe("CLI: init --version-policy-defaults", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("bootstraps versionPolicy in config.json", () => {
    const result = runCLI("ea init --version-policy-defaults", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("version policy defaults");

    const configPath = join(tempDir, ".anchored-spec", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.versionPolicy).toBeDefined();
    expect(config.versionPolicy.defaultCompatibility).toBe("breaking-allowed");
    expect(config.versionPolicy.perKind["api-contract"].compatibility).toBe("backward-only");
    expect(config.versionPolicy.perKind["event-contract"].compatibility).toBe("backward-only");
    expect(config.versionPolicy.perKind["canonical-entity"].compatibility).toBe("full");
  });

  it("init without --version-policy-defaults has no versionPolicy", () => {
    runCLI("ea init", tempDir);

    const configPath = join(tempDir, ".anchored-spec", "config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.versionPolicy).toBeUndefined();
  });
});