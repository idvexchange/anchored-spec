/**
 * Tests for EA Status and Transition CLI commands
 *
 * Covers:
 *   - ea status: default output, --json, --domain filter
 *   - ea transition: lifecycle advancement, gate validation, --force, --dry-run
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
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
    `ea-status-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function setupProject(dir: string, artifacts: Record<string, unknown>[]): void {
  mkdirSync(join(dir, "ea", "systems"), { recursive: true });
  mkdirSync(join(dir, "ea", "transitions"), { recursive: true });

  writeFileSync(
    join(dir, "anchored-spec.json"),
    JSON.stringify({ schemaVersion: "1.0", rootDir: "ea" }),
  );

  for (const artifact of artifacts) {
    const kind = artifact.kind as string;
    let domain = "systems";
    if (["baseline", "target", "transition-plan", "migration-wave", "exception"].includes(kind)) {
      domain = "transitions";
    }
    const id = artifact.id as string;
    writeFileSync(
      join(dir, "ea", domain, `${id}.json`),
      JSON.stringify(artifact, null, 2),
    );
  }
}

let tempDir: string;

beforeEach(() => {
  tempDir = createTempDir();
});

afterEach(() => {
  cleanDir(tempDir);
});

// ─── ea status ──────────────────────────────────────────────────────────────────

describe("CLI: ea status", () => {
  it("shows status dashboard for a project with artifacts", () => {
    setupProject(tempDir, [
      {
        id: "SVC-auth",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Auth Service",
        status: "active",
        confidence: "declared",
        summary: "Authentication service",
        owners: ["team"],
        relations: [],
      },
      {
        id: "SVC-db",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "DB Service",
        status: "draft",
        confidence: "inferred",
        summary: "Database service",
        owners: [],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea status", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Status Dashboard");
    expect(stdout).toContain("systems");
    expect(stdout).toContain("Total");
  });

  it("outputs JSON with --json flag", () => {
    setupProject(tempDir, [
      {
        id: "SVC-test",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Test",
        status: "active",
        confidence: "declared",
        summary: "Test service",
        owners: [],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea status --json", tempDir);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.total).toBe(1);
    expect(data.byDomain).toBeDefined();
    expect(data.byStatus).toBeDefined();
  });

  it("filters by domain with --domain", () => {
    setupProject(tempDir, [
      {
        id: "SVC-a",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "A",
        status: "active",
        confidence: "declared",
        summary: "Service A",
        owners: [],
        relations: [],
      },
      {
        id: "BASELINE-b",
        schemaVersion: "1.0.0",
        kind: "baseline",
        title: "B",
        status: "draft",
        confidence: "inferred",
        summary: "Baseline B",
        owners: [],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea status --json --domain systems", tempDir);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.total).toBe(1);
  });

  it("fails for uninitialized project", () => {
    const { exitCode, stdout } = runCLI("ea status", tempDir);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not initialized");
  });
});

// ─── ea transition ──────────────────────────────────────────────────────────────

describe("CLI: ea transition", () => {
  it("advances artifact from draft to planned", () => {
    setupProject(tempDir, [
      {
        id: "SVC-advance",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Advance Me",
        status: "draft",
        confidence: "inferred",
        summary: "Test transition",
        owners: ["team"],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea transition SVC-advance --force", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("draft");
    expect(stdout).toContain("planned");

    // Verify file was updated
    const updated = JSON.parse(readFileSync(join(tempDir, "ea", "systems", "SVC-advance.json"), "utf-8"));
    expect(updated.status).toBe("planned");
  });

  it("advances to specific status with --to", () => {
    setupProject(tempDir, [
      {
        id: "SVC-jump",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Jump",
        status: "draft",
        confidence: "declared",
        summary: "Jump ahead to active for testing",
        owners: ["team"],
        relations: [{ target: "SVC-jump", type: "self" }],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea transition SVC-jump --to active --force", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("active");
  });

  it("dry run does not modify file", () => {
    setupProject(tempDir, [
      {
        id: "SVC-dry",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Dry Run",
        status: "draft",
        confidence: "inferred",
        summary: "Dry run test",
        owners: [],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea transition SVC-dry --dry-run", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("DRY RUN");

    const unchanged = JSON.parse(readFileSync(join(tempDir, "ea", "systems", "SVC-dry.json"), "utf-8"));
    expect(unchanged.status).toBe("draft");
  });

  it("fails gate validation for active without owner", () => {
    setupProject(tempDir, [
      {
        id: "SVC-no-owner",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "No Owner",
        status: "planned",
        confidence: "inferred",
        summary: "Short",
        owners: [],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea transition SVC-no-owner --to active", tempDir);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("no owners");
  });

  it("--force skips gate validation", () => {
    setupProject(tempDir, [
      {
        id: "SVC-forced",
        schemaVersion: "1.0.0",
        kind: "service",
        title: "Forced",
        status: "planned",
        confidence: "inferred",
        summary: "Short",
        owners: [],
        relations: [],
      },
    ]);

    const { stdout, exitCode } = runCLI("ea transition SVC-forced --to active --force", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("active");
  });

  it("fails for nonexistent artifact", () => {
    setupProject(tempDir, []);

    const { exitCode, stdout } = runCLI("ea transition SVC-ghost", tempDir);
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not found");
  });
});
