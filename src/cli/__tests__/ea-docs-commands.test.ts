/**
 * @module ea-docs-commands.test
 *
 * End-to-end CLI integration tests for markdown prose resolver commands:
 * discover --resolver markdown, drift --domain docs, link-docs --annotate.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync } from "node:fs";

const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");

// ─── Helpers ────────────────────────────────────────────────────────

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `anchored-spec-docs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

function initEaProject(dir: string): void {
  runCLI("ea init", dir);
}

function writeMarkdown(dir: string, path: string, content: string): void {
  const fullPath = join(dir, path);
  const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  mkdirSync(parentDir, { recursive: true });
  writeFileSync(fullPath, content);
}

// ─── discover --resolver markdown ───────────────────────────────────

describe("CLI: discover --resolver markdown", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    initEaProject(tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("discovers artifacts from markdown tables", () => {
    writeMarkdown(
      tempDir,
      "docs/events.md",
      `# Events

| Event | Trigger |
|-------|---------|
| dossier.success | Verification passed |
| dossier.cancelled | User cancelled |
`,
    );

    const { stdout, exitCode } = runCLI(
      "discover --resolver markdown --dry-run",
      tempDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("dossier.success");
    expect(stdout).toContain("dossier.cancelled");
    expect(stdout).toContain("event-contract");
  });

  it("outputs JSON with --json flag", () => {
    writeMarkdown(
      tempDir,
      "docs/events.md",
      `| Event | Trigger |
|-------|---------|
| order.placed | Order submitted |
`,
    );

    const { stdout, exitCode } = runCLI(
      "discover --resolver markdown --dry-run --json",
      tempDir,
    );
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.resolversUsed).toContain("markdown");
    expect(data.summary.newArtifacts).toBeGreaterThanOrEqual(1);
    expect(data.newArtifacts[0].kind).toBe("event-contract");
  });

  it("writes fact manifests with --write-facts", () => {
    writeMarkdown(
      tempDir,
      "docs/events.md",
      `| Event | Trigger |
|-------|---------|
| order.placed | Order submitted |
`,
    );

    const { stdout, exitCode } = runCLI(
      "discover --resolver markdown --write-facts --dry-run",
      tempDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("fact manifest");
  });
});

// ─── drift --domain docs ────────────────────────────────────────────

describe("CLI: drift --domain docs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    initEaProject(tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("passes when documents are consistent", () => {
    writeMarkdown(
      tempDir,
      "docs/api.md",
      `| Event | Trigger |
|-------|---------|
| dossier.success | Verification passed |
`,
    );
    writeMarkdown(
      tempDir,
      "docs/guide.md",
      `| Event | Trigger |
|-------|---------|
| dossier.success | Verification passed |
`,
    );

    const { stdout, exitCode } = runCLI("drift --domain docs", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("PASSED");
  });

  it("fails when documents have conflicting values", () => {
    writeMarkdown(
      tempDir,
      "docs/api.md",
      `| Event | Trigger |
|-------|---------|
| dossier.success | Verification passed |
`,
    );
    writeMarkdown(
      tempDir,
      "docs/guide.md",
      `| Event | Trigger |
|-------|---------|
| dossier.success | Identity verified |
`,
    );

    const { stdout, exitCode } = runCLI("drift --domain docs", tempDir);
    expect(exitCode).toBe(1);
    expect(stdout).toContain("FAILED");
    expect(stdout).toContain("dossier.success");
  });

  it("outputs valid JSON with --json on conflict", () => {
    writeMarkdown(
      tempDir,
      "docs/a.md",
      `| Event | Trigger |
|-------|---------|
| e.1 | t1 |
`,
    );
    writeMarkdown(
      tempDir,
      "docs/b.md",
      `| Event | Trigger |
|-------|---------|
| e.1 | t2 |
`,
    );

    const { stdout, exitCode } = runCLI(
      "drift --domain docs --json",
      tempDir,
    );
    expect(exitCode).toBe(1);

    const data = JSON.parse(stdout);
    expect(data.consistency).toBeDefined();
    expect(data.consistency.passed).toBe(false);
    expect(data.consistency.errors).toBeGreaterThanOrEqual(1);
    expect(data.consistency.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when no markdown files found", () => {
    // No markdown files — only the EA structure
    const { stdout, exitCode } = runCLI("drift --domain docs", tempDir);
    expect(exitCode).toBe(0);
    expect(stdout.toLowerCase()).toContain("no markdown");
  });
});

// ─── link-docs --annotate ───────────────────────────────────────────

describe("CLI: link-docs --annotate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    initEaProject(tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("suggests annotations in dry-run mode", () => {
    writeMarkdown(
      tempDir,
      "docs/events.md",
      `| Event | Trigger |
|-------|---------|
| order.placed | Order submitted |
| order.shipped | Order shipped |
| order.delivered | Order delivered |
`,
    );

    const { stdout, exitCode } = runCLI(
      "link-docs --annotate --dry-run",
      tempDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("@ea:");
    expect(stdout).toContain("DRY RUN");
    expect(stdout).toContain("suggestion");
  });

  it("outputs JSON with --json flag", () => {
    writeMarkdown(
      tempDir,
      "docs/events.md",
      `| Event | Trigger |
|-------|---------|
| e.1 | t |
`,
    );

    const { stdout, exitCode } = runCLI(
      "link-docs --annotate --json",
      tempDir,
    );
    expect(exitCode).toBe(0);

    const data = JSON.parse(stdout);
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(data.suggestions[0].annotation).toContain("@ea:");
    expect(data.summary.total).toBeGreaterThanOrEqual(1);
  });

  it("reports nothing when all blocks are already annotated", () => {
    writeMarkdown(
      tempDir,
      "docs/events.md",
      `<!-- @ea:events user-created -->
| Event | Trigger |
|-------|---------|
| e.1 | t |
<!-- @ea:end -->
`,
    );

    const { stdout, exitCode } = runCLI(
      "link-docs --annotate --dry-run",
      tempDir,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("All classifiable blocks already have @ea:");
  });
});
