import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const CLI_PATH = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");

function createTempDir(): string {
  const dir = join(tmpdir(), `anchored-spec-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function runCLI(args: string, cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const error = err as { status: number; stdout: string; stderr: string };
    return { stdout: (error.stdout ?? "") + (error.stderr ?? ""), exitCode: error.status ?? 1 };
  }
}

// ─── Init Command ──────────────────────────────────────────────────────────────

describe("CLI: init", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project", scripts: {} }, null, 2));
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("creates spec infrastructure", () => {
    const result = runCLI("init --no-examples", tempDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "specs", "requirements"))).toBe(true);
    expect(existsSync(join(tempDir, "specs", "changes"))).toBe(true);
    expect(existsSync(join(tempDir, "specs", "decisions"))).toBe(true);
    expect(existsSync(join(tempDir, "specs", "generated"))).toBe(true);
    expect(existsSync(join(tempDir, ".anchored-spec", "config.json"))).toBe(true);
    expect(existsSync(join(tempDir, "specs", "workflow-policy.json"))).toBe(true);
  });

  it("creates starter example by default", () => {
    const result = runCLI("init", tempDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "specs", "requirements", "REQ-1.json"))).toBe(true);
    const req = JSON.parse(readFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), "utf-8"));
    expect(req.id).toBe("REQ-1");
    expect(req.status).toBe("draft");
  });

  it("adds spec scripts to package.json", () => {
    runCLI("init --no-examples", tempDir);
    const pkg = JSON.parse(readFileSync(join(tempDir, "package.json"), "utf-8"));
    expect(pkg.scripts["spec:verify"]).toBe("anchored-spec verify");
    expect(pkg.scripts["spec:generate"]).toBe("anchored-spec generate");
    expect(pkg.scripts["spec:status"]).toBe("anchored-spec status");
    expect(pkg.scripts["spec:create"]).toBe("anchored-spec create");
  });

  it("adds generated dir to .gitignore", () => {
    runCLI("init --no-examples", tempDir);
    const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("specs/generated/");
  });

  it("appends to existing .gitignore", () => {
    writeFileSync(join(tempDir, ".gitignore"), "node_modules\n");
    runCLI("init --no-examples", tempDir);
    const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf-8");
    expect(gitignore).toContain("node_modules");
    expect(gitignore).toContain("specs/generated/");
  });

  it("supports --dry-run without writing files", () => {
    const result = runCLI("init --dry-run", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("DRY RUN");
    expect(existsSync(join(tempDir, "specs"))).toBe(false);
  });

  it("supports custom --spec-root", () => {
    runCLI("init --spec-root my-specs --no-examples", tempDir);
    expect(existsSync(join(tempDir, "my-specs", "requirements"))).toBe(true);
    expect(existsSync(join(tempDir, "my-specs", "workflow-policy.json"))).toBe(true);
  });

  it("is idempotent", () => {
    runCLI("init --no-examples", tempDir);
    const result = runCLI("init --no-examples", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("already exists");
  });
});

// ─── Create Command ────────────────────────────────────────────────────────────

describe("CLI: create", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("creates a requirement", () => {
    const result = runCLI('create requirement --title "User can log in"', tempDir);
    expect(result.exitCode).toBe(0);
    const reqPath = join(tempDir, "specs", "requirements", "REQ-1.json");
    expect(existsSync(reqPath)).toBe(true);
    const req = JSON.parse(readFileSync(reqPath, "utf-8"));
    expect(req.id).toBe("REQ-1");
    expect(req.title).toBe("User can log in");
    expect(req.status).toBe("draft");
  });

  it("auto-increments requirement IDs", () => {
    runCLI('create requirement --title "First"', tempDir);
    runCLI('create requirement --title "Second"', tempDir);
    expect(existsSync(join(tempDir, "specs", "requirements", "REQ-1.json"))).toBe(true);
    expect(existsSync(join(tempDir, "specs", "requirements", "REQ-2.json"))).toBe(true);
  });

  it("creates a feature change", () => {
    const result = runCLI('create change --title "Add login" --type feature --slug add-login', tempDir);
    expect(result.exitCode).toBe(0);
    const changeDir = readdirSync(join(tempDir, "specs", "changes")).find((d) => d.startsWith("CHG-"));
    expect(changeDir).toBeDefined();
    const change = JSON.parse(readFileSync(join(tempDir, "specs", "changes", changeDir!, "change.json"), "utf-8"));
    expect(change.type).toBe("feature");
    expect(change.workflowVariant).toBe("feature-behavior-first");
  });

  it("creates a chore change without workflowVariant", () => {
    const result = runCLI('create change --title "Update deps" --type chore --slug update-deps', tempDir);
    expect(result.exitCode).toBe(0);
    const changeDir = readdirSync(join(tempDir, "specs", "changes")).find((d) => d.startsWith("CHG-"));
    const change = JSON.parse(readFileSync(join(tempDir, "specs", "changes", changeDir!, "change.json"), "utf-8"));
    expect(change.type).toBe("chore");
    expect(change.workflowVariant).toBeUndefined();
  });

  it("creates a fix change with bugfixSpec", () => {
    const result = runCLI('create change --title "Fix crash" --type fix --slug fix-crash', tempDir);
    expect(result.exitCode).toBe(0);
    const changeDir = readdirSync(join(tempDir, "specs", "changes")).find((d) => d.startsWith("CHG-"));
    const change = JSON.parse(readFileSync(join(tempDir, "specs", "changes", changeDir!, "change.json"), "utf-8"));
    expect(change.bugfixSpec).toBeDefined();
    expect(change.bugfixSpec.currentBehavior).toContain("TODO");
  });

  it("rejects invalid change type", () => {
    const result = runCLI('create change --title "Bad" --type invalid --slug bad', tempDir);
    expect(result.exitCode).toBe(1);
  });

  it("creates a decision", () => {
    const result = runCLI('create decision --title "Use PostgreSQL for persistence" --slug use-postgres', tempDir);
    expect(result.exitCode).toBe(0);
    const decPath = join(tempDir, "specs", "decisions", "ADR-1.json");
    expect(existsSync(decPath)).toBe(true);
    const dec = JSON.parse(readFileSync(decPath, "utf-8"));
    expect(dec.id).toBe("ADR-1");
    expect(dec.alternatives).toHaveLength(1);
  });

  it("supports --dry-run for requirement", () => {
    const result = runCLI('create requirement --title "Dry" --dry-run', tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Would create");
    expect(existsSync(join(tempDir, "specs", "requirements", "REQ-1.json"))).toBe(false);
  });

  it("supports --dry-run for change", () => {
    const result = runCLI('create change --title "Dry" --type feature --slug dry --dry-run', tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Would create");
  });

  it("fails without initialized specs", () => {
    const emptyDir = createTempDir();
    const result = runCLI('create requirement --title "Should fail"', emptyDir);
    expect(result.exitCode).toBe(1);
    cleanDir(emptyDir);
  });
});

// ─── Verify Command ────────────────────────────────────────────────────────────

describe("CLI: verify", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("passes with no artifacts", () => {
    const result = runCLI("verify", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("All checks passed");
  });

  it("passes with a valid requirement", () => {
    const req = {
      id: "REQ-1",
      title: "Valid requirement",
      summary: "A well-formed requirement for testing.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "When a user submits the form, the system shall save the data.",
          format: "EARS",
          trigger: "user submits the form",
          response: "the system shall save the data",
        },
      ],
      owners: ["team"],
      docSource: "canonical-json",
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("verify", tempDir);
    expect(result.exitCode).toBe(0);
  });

  it("fails with invalid requirement", () => {
    writeFileSync(
      join(tempDir, "specs", "requirements", "REQ-1.json"),
      JSON.stringify({ id: "BAD" })
    );
    const result = runCLI("verify", tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("error");
  });

  it("promotes warnings to errors with --strict", () => {
    const req = {
      id: "REQ-1",
      title: "Requirement with vague language",
      summary: "A requirement that should work properly.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        {
          id: "BS-1",
          text: "The system should work properly when handling data.",
          format: "EARS",
          response: "the system should work properly",
        },
      ],
      owners: ["team"],
      docSource: "canonical-json",
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("verify --strict", tempDir);
    expect(result.exitCode).toBe(1);
  });

  it("fails without initialized specs", () => {
    const emptyDir = createTempDir();
    const result = runCLI("verify", emptyDir);
    expect(result.exitCode).toBe(1);
    cleanDir(emptyDir);
  });
});

// ─── Generate Command ──────────────────────────────────────────────────────────

describe("CLI: generate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("generates markdown from requirements", () => {
    const req = {
      id: "REQ-1",
      title: "Test Requirement",
      summary: "A test requirement for generation.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        { id: "BS-1", text: "When triggered, the system shall respond.", format: "EARS", response: "the system shall respond" },
      ],
      owners: ["team"],
      docSource: "canonical-json",
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("generate", tempDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "specs", "generated", "requirements.md"))).toBe(true);
    expect(existsSync(join(tempDir, "specs", "generated", "status.md"))).toBe(true);
    const md = readFileSync(join(tempDir, "specs", "generated", "requirements.md"), "utf-8");
    expect(md).toContain("REQ-1");
    expect(md).toContain("Test Requirement");
  });

  it("detects stale files with --check", () => {
    const req = {
      id: "REQ-1",
      title: "Stale check test",
      summary: "Testing the check flag with stale content.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        { id: "BS-1", text: "When triggered, the system shall respond.", format: "EARS", response: "the system shall respond" },
      ],
      owners: ["team"],
      docSource: "canonical-json",
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));

    // Generate first
    runCLI("generate", tempDir);

    // Should be up-to-date
    const checkOk = runCLI("generate --check", tempDir);
    expect(checkOk.exitCode).toBe(0);
    expect(checkOk.stdout).toContain("Up-to-date");

    // Modify the generated file to make it stale
    writeFileSync(join(tempDir, "specs", "generated", "requirements.md"), "stale content");
    const checkStale = runCLI("generate --check", tempDir);
    expect(checkStale.exitCode).toBe(1);
    expect(checkStale.stdout).toContain("Stale");
  });
});

// ─── Status Command ────────────────────────────────────────────────────────────

describe("CLI: status", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("shows dashboard with no artifacts", () => {
    const result = runCLI("status", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Requirements");
    expect(result.stdout).toContain("No requirements yet");
  });

  it("outputs JSON with --json flag", () => {
    const result = runCLI("status --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.requirements.total).toBe(0);
  });

  it("shows counts when artifacts exist", () => {
    const req = {
      id: "REQ-1",
      title: "Test Requirement",
      summary: "A test requirement for status.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        { id: "BS-1", text: "When triggered, the system shall respond.", format: "EARS", response: "the system shall respond" },
      ],
      owners: ["team"],
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("status --json", tempDir);
    const json = JSON.parse(result.stdout);
    expect(json.requirements.total).toBe(1);
  });
});

// ─── Transition Command ────────────────────────────────────────────────────────

describe("CLI: transition", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("transitions a change to next phase", () => {
    runCLI("create change --type feature --slug test-feature --title \"Test Feature\"", tempDir);
    const changesDir = join(tempDir, "specs", "changes");
    const entries = readdirSync(changesDir);
    const changeDirName = entries.find((e) => e.includes("test-feature"))!;
    const changePath = join(changesDir, changeDirName, "change.json");
    const change = JSON.parse(readFileSync(changePath, "utf-8"));
    expect(change.phase).toBe("design");

    // Use --force to skip gate validation (no requirements linked)
    const result = runCLI(`transition ${change.id} --to planned --force`, tempDir);
    expect(result.exitCode).toBe(0);
    const updated = JSON.parse(readFileSync(changePath, "utf-8"));
    expect(updated.phase).toBe("planned");
  });

  it("supports --dry-run", () => {
    runCLI("create change --type feature --slug dry-run --title \"Dry Run Test\"", tempDir);
    const changesDir = join(tempDir, "specs", "changes");
    const entries = readdirSync(changesDir);
    const changeDirName = entries.find((e) => e.includes("dry-run"))!;
    const changePath = join(changesDir, changeDirName, "change.json");
    const change = JSON.parse(readFileSync(changePath, "utf-8"));

    const result = runCLI(`transition ${change.id} --to planned --dry-run --force`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toLowerCase()).toContain("dry");
    // Phase should NOT have changed
    const after = JSON.parse(readFileSync(changePath, "utf-8"));
    expect(after.phase).toBe("design");
  });
});

// ─── Drift Command ─────────────────────────────────────────────────────────────

describe("CLI: drift", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
    mkdirSync(join(tempDir, "src"), { recursive: true });
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("reports no drift when no active requirements", () => {
    const result = runCLI("drift --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.findings).toHaveLength(0);
  });

  it("detects missing symbols", () => {
    writeFileSync(join(tempDir, "src", "empty.ts"), "export const x = 1;\n");
    const req = {
      id: "REQ-1",
      title: "Test Drift Detection",
      summary: "Requirement with semantic refs for drift testing.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        { id: "BS-01", text: "When triggered, the system shall detect drift.", format: "EARS", response: "The system shall detect drift" },
      ],
      semanticRefs: { interfaces: ["MissingInterface"] },
      owners: ["team"],
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("drift --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.summary.missing).toBe(1);
  });

  it("exits with error on --fail-on-missing", () => {
    writeFileSync(join(tempDir, "src", "empty.ts"), "export const x = 1;\n");
    const req = {
      id: "REQ-1",
      title: "Fail on Missing Test",
      summary: "Requirement with missing refs for error exit testing.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        { id: "BS-01", text: "When triggered, the system shall fail.", format: "EARS", response: "The system shall fail" },
      ],
      semanticRefs: { symbols: ["GhostSymbol"] },
      owners: ["team"],
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("drift --fail-on-missing", tempDir);
    expect(result.exitCode).toBe(1);
  });
});

// ─── Import Command ─────────────────────────────────────────────────────────────

describe("CLI: import", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("imports markdown ADRs", () => {
    const adrDir = join(tempDir, "legacy-adrs");
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(
      join(adrDir, "001-use-postgres.md"),
      `# ADR-1: Use PostgreSQL\n\n## Status\n\nAccepted\n\n## Context\n\nWe need a database.\n\n## Decision\n\nUse PostgreSQL.\n\n## Consequences\n\nNeed DBA.\n`,
    );
    const result = runCLI(`import legacy-adrs --json`, tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.length).toBeGreaterThan(0);
    expect(json[0].type).toBe("decision");
    expect(existsSync(join(tempDir, "specs", "decisions", "ADR-01.json"))).toBe(true);
  });

  it("supports --dry-run", () => {
    const adrDir = join(tempDir, "docs");
    mkdirSync(adrDir, { recursive: true });
    writeFileSync(
      join(adrDir, "adr-002.md"),
      `# ADR-2: Use TypeScript\n\n## Status\n\nAccepted\n\n## Context\n\nType safety.\n\n## Decision\n\nUse TypeScript.\n`,
    );
    const result = runCLI(`import docs --dry-run --json`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tempDir, "specs", "decisions", "ADR-02.json"))).toBe(false);
  });

  it("fails on non-existent path", () => {
    const result = runCLI("import nonexistent-dir", tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("not found");
  });
});

// ─── Report Command ─────────────────────────────────────────────────────────────

describe("CLI: report", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("generates empty report with no artifacts", () => {
    const result = runCLI("report --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.totalRequirements).toBe(0);
    expect(json.trace).toHaveLength(0);
  });

  it("generates traceability report with artifacts", () => {
    const req = {
      id: "REQ-1",
      title: "Report Test Requirement",
      summary: "A requirement for report testing purposes.",
      priority: "must",
      status: "active",
      behaviorStatements: [
        { id: "BS-01", text: "When reporting, the system shall generate trace.", format: "EARS", response: "The system shall generate trace" },
      ],
      owners: ["team"],
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("report --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.totalRequirements).toBe(1);
    expect(json.trace).toHaveLength(1);
    expect(json.trace[0].reqId).toBe("REQ-1");
  });

  it("writes markdown report to file", () => {
    const req = {
      id: "REQ-1",
      title: "Markdown Report Test",
      summary: "A requirement for markdown report file testing.",
      priority: "must",
      status: "draft",
      behaviorStatements: [
        { id: "BS-01", text: "When reporting, the system shall write markdown.", format: "EARS", response: "The system shall write markdown" },
      ],
      owners: ["team"],
    };
    writeFileSync(join(tempDir, "specs", "requirements", "REQ-1.json"), JSON.stringify(req, null, 2));
    const result = runCLI("report", tempDir);
    expect(result.exitCode).toBe(0);
    const reportPath = join(tempDir, "specs", "generated", "report.md");
    expect(existsSync(reportPath)).toBe(true);
    const md = readFileSync(reportPath, "utf-8");
    expect(md).toContain("Traceability Report");
    expect(md).toContain("REQ-1");
  });
});

// ─── Migrate Command ───────────────────────────────────────────────────────────

describe("CLI: migrate", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("reports all up-to-date when no artifacts", () => {
    const result = runCLI("migrate", tempDir);
    expect(result.exitCode).toBe(0);
  });

  it("supports --dry-run", () => {
    const result = runCLI("migrate --dry-run", tempDir);
    expect(result.exitCode).toBe(0);
  });
});

// ─── Check Command ──────────────────────────────────────────────────────────────

describe("CLI: check", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("works with --paths to bypass git", () => {
    const result = runCLI("check --paths src/main.ts --json", tempDir);
    // Exit 1 because src/** is governed and no active change covers it
    const json = JSON.parse(result.stdout);
    expect(json.paths).toContain("src/main.ts");
    expect(json.uncoveredPaths).toBeDefined();
  });

  it("reports valid when paths are trivially exempt", () => {
    const result = runCLI("check --paths README.md --json", tempDir);
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.valid).toBe(true);
  });

  it("fails on git errors in non-git repo", () => {
    const result = runCLI("check --json", tempDir);
    expect(result.exitCode).toBe(1);
  });

  it("fails without initialized specs", () => {
    const emptyDir = createTempDir();
    const result = runCLI("check --paths foo.ts", emptyDir);
    expect(result.exitCode).toBe(1);
    cleanDir(emptyDir);
  });

  it("validates branch names — rejects injection attempts", () => {
    const result = runCLI("check --against \"main; echo pwned\" --json", tempDir);
    expect(result.exitCode).toBe(1);
  });
});

// ─── Slug Validation ────────────────────────────────────────────────────────────

describe("CLI: create slug handling", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("auto-derives slug from title when not provided", () => {
    const result = runCLI("create change --type feature --title \"Add User Login\"", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("add-user-login");
  });

  it("rejects path-traversal slugs", () => {
    const result = runCLI("create change --type feature --title test --slug \"../../../etc\"", tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Invalid slug");
  });

  it("auto-derives slug for decisions too", () => {
    const result = runCLI("create decision --title \"Use PostgreSQL\"", tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ADR-");
  });
});

// ─── --cwd Global Option ────────────────────────────────────────────────────────

describe("CLI: --cwd", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    writeFileSync(join(tempDir, "package.json"), JSON.stringify({ name: "test-project" }));
    runCLI("init --no-examples", tempDir);
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("supports --cwd to target a different project", () => {
    // Run from /tmp but target tempDir via --cwd
    const result = runCLI(`--cwd ${tempDir} status --json`, "/tmp");
    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.requirements).toBeDefined();
  });
});
