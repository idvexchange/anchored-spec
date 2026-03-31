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
    expect(result.stdout).toContain("APP-app-a");
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
    expect(result.stdout).toContain("APP-frontend");
    expect(result.stdout).toContain("APP-backend");
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
    expect(json.matrix[0].applicationId).toBe("APP-test");
    expect(json.matrix[0].dataStoreId).toBe("STORE-test-db");
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
