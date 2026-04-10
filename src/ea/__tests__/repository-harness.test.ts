import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import {
  cleanupTestWorkspace,
  createTestWorkspace,
  makeEntity,
  readJsonFile,
  writeManifestProject,
  writeTextFile,
} from "../../test-helpers/workspace.js";

const workspaces: string[] = [];
const TASK_START = join(process.cwd(), "scripts", "task-start.mjs");
const TASK_VERIFY = join(process.cwd(), "scripts", "task-verify.mjs");
const TASK_CHECK = join(process.cwd(), "scripts", "task-check.mjs");
const TASK_CLOSE = join(process.cwd(), "scripts", "task-close.mjs");

function runCommand(command: string, args: string[], cwd: string) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
}

function initGitRepo(dir: string) {
  expect(runCommand("git", ["init"], dir).status).toBe(0);
  expect(runCommand("git", ["config", "user.email", "tests@example.com"], dir).status).toBe(0);
  expect(runCommand("git", ["config", "user.name", "Harness Tests"], dir).status).toBe(0);
}

function makeWorkspace(prefix: string): string {
  const dir = createTestWorkspace(prefix);
  workspaces.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of workspaces.splice(0)) {
    cleanupTestWorkspace(dir);
  }
});

describe("repository harness scripts", () => {
  it("builds a task brief from scoped paths", () => {
    const dir = makeWorkspace("repo-harness-start");
    writeManifestProject(
      dir,
      [
        makeEntity({
          ref: "component:default/cli",
          kind: "Component",
          type: "tool",
          title: "CLI",
          annotations: {
            "anchored-spec.dev/source": "docs/04-component/cli.md",
            "anchored-spec.dev/code-location": "src/cli/",
          },
        }),
      ],
      { workflowPolicyPath: ".anchored-spec/policy.json" },
    );
    writeTextFile(dir, "AGENTS.md", "# Root agent\n");
    writeTextFile(dir, "docs/AGENTS.md", "# Docs agent\n");
    writeTextFile(dir, "docs/04-component/cli.md", "# CLI\n");
    writeTextFile(dir, "docs/guides/developer-guides/agent-harness.md", "# Harness\n");
    writeTextFile(dir, "docs/guides/user-guides/repository-harness-pattern.md", "# Pattern\n");
    writeTextFile(dir, "docs/adr/ADR-007-control-plane-and-repository-harness-boundary.md", "# ADR\n");
    writeTextFile(
      dir,
      ".anchored-spec/policy.json",
      JSON.stringify({
        workflowVariants: [{ id: "code-change", name: "Code Change", defaultTypes: ["feature"], requiredSchemas: [] }],
        changeRequiredRules: [],
        readFirstRules: [
          {
            id: "cli-docs",
            entityRefs: ["component:default/cli"],
            pathMatches: ["src/cli/**"],
            docs: ["docs/04-component/cli.md"],
          },
        ],
        trivialExemptions: ["*.md"],
        lifecycleRules: {
          plannedToActiveRequiresChange: true,
          activeToShippedRequiresCoverage: true,
          deprecatedRequiresReason: true,
        },
      }, null, 2),
    );
    writeTextFile(dir, "src/cli/index.ts", "export const cli = true;\n");
    writeTextFile(dir, "src/cli/__tests__/index.test.ts", "import { describe, it, expect } from 'vitest'; describe('x', () => it('y', () => expect(true).toBe(true)));\n");

    const result = spawnSync("node", [TASK_START, "src/cli/index.ts", "--json"], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const brief = JSON.parse(result.stdout);
    expect(brief.paths).toContain("src/cli/index.ts");
    expect(brief.matchedEntities[0].ref).toBe("component:default/cli");
    expect(brief.readFirst).toContain("docs/04-component/cli.md");
    expect(brief.commands).toContain("pnpm exec tsc --noEmit");
    expect(brief.commands.some((command: string) => command.includes("vitest run"))).toBe(true);
    expect(readJsonFile(dir, ".anchored-spec/task-brief.json")).toMatchObject({
      paths: ["src/cli/index.ts"],
    });
  });

  it("runs verification from an explicit brief file", () => {
    const dir = makeWorkspace("repo-harness-verify");
    writeTextFile(
      dir,
      ".anchored-spec/custom-brief.json",
      JSON.stringify({
        paths: ["src/demo.ts"],
        matchedTaskRoutes: ["repository-harness"],
        commands: ["node -e \"process.stdout.write('ok')\""],
        broaderCommands: [],
        baseline: { managed: false },
      }, null, 2),
    );

    const result = spawnSync("node", [TASK_VERIFY, "--brief", ".anchored-spec/custom-brief.json", "--json"], {
      cwd: dir,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.summary.status).toBe("passed");
    expect(report.results[0].command).toContain("node -e");
    expect(report.baseline.recommendedCommand).toBeNull();
    expect(readJsonFile(dir, ".anchored-spec/verification-report.json")).toMatchObject({
      summary: { status: "passed" },
    });
  });

  it("routes ask-shaped requests and narrows read-first docs from policy", () => {
    const dir = makeWorkspace("repo-harness-ask");
    writeManifestProject(
      dir,
      [
        makeEntity({
          ref: "component:default/cli",
          kind: "Component",
          type: "tool",
          title: "CLI",
          annotations: {
            "anchored-spec.dev/source": "docs/04-component/cli.md",
            "anchored-spec.dev/code-location": "src/cli/",
          },
        }),
      ],
      { workflowPolicyPath: ".anchored-spec/policy.json" },
    );
    writeTextFile(dir, "AGENTS.md", "# Root agent\n");
    writeTextFile(dir, "docs/AGENTS.md", "# Docs agent\n");
    writeTextFile(dir, "docs/04-component/cli.md", "# CLI\n");
    writeTextFile(dir, "docs/06-api/cli-api.md", "# API\n");
    writeTextFile(dir, "docs/guides/developer-guides/agent-harness.md", "# Harness\n");
    writeTextFile(dir, "docs/guides/user-guides/repository-harness-pattern.md", "# Pattern\n");
    writeTextFile(dir, "docs/adr/ADR-007-control-plane-and-repository-harness-boundary.md", "# ADR\n");
    writeTextFile(
      dir,
      ".anchored-spec/policy.json",
      JSON.stringify({
        workflowVariants: [{ id: "code-change", name: "Code Change", defaultTypes: ["feature"], requiredSchemas: [] }],
        changeRequiredRules: [],
        trivialExemptions: ["*.md"],
        lifecycleRules: {
          plannedToActiveRequiresChange: true,
          activeToShippedRequiresCoverage: true,
          deprecatedRequiresReason: true,
        },
        extensions: {
          harness: {
            commonRequestRouting: [
              {
                id: "cli-surface",
                baselineManaged: true,
                matchSignals: ["cli", "command", "output"],
                strongSignals: ["cli command"],
                defaultPaths: ["src/cli"],
                entityRefs: ["component:default/cli"],
                readFirst: ["docs/04-component/cli.md", "docs/06-api/cli-api.md"],
                leafAgents: ["AGENTS.md"],
              },
            ],
          },
        },
      }, null, 2),
    );
    writeTextFile(dir, "src/cli/index.ts", "export const cli = true;\n");

    const result = runCommand("node", [TASK_START, "--ask", "fix cli command output", "--json"], dir);

    expect(result.status).toBe(0);
    const brief = JSON.parse(result.stdout);
    expect(brief.matchedCommonRoute).toBe("cli-surface");
    expect(brief.paths).toContain("src/cli");
    expect(brief.readFirst).toContain("docs/04-component/cli.md");
    expect(brief.readFirst).toContain("docs/06-api/cli-api.md");
    expect(brief.baseline.managed).toBe(true);
  });

  it("builds scope from git diff for changed files", () => {
    const dir = makeWorkspace("repo-harness-diff");
    writeManifestProject(
      dir,
      [
        makeEntity({
          ref: "component:default/cli",
          kind: "Component",
          type: "tool",
          title: "CLI",
          annotations: {
            "anchored-spec.dev/source": "docs/04-component/cli.md",
            "anchored-spec.dev/code-location": "src/cli/",
          },
        }),
      ],
      { workflowPolicyPath: ".anchored-spec/policy.json" },
    );
    writeTextFile(dir, "AGENTS.md", "# Root agent\n");
    writeTextFile(dir, "docs/AGENTS.md", "# Docs agent\n");
    writeTextFile(dir, "docs/04-component/cli.md", "# CLI\n");
    writeTextFile(dir, "docs/guides/developer-guides/agent-harness.md", "# Harness\n");
    writeTextFile(dir, "docs/guides/user-guides/repository-harness-pattern.md", "# Pattern\n");
    writeTextFile(dir, "docs/adr/ADR-007-control-plane-and-repository-harness-boundary.md", "# ADR\n");
    writeTextFile(
      dir,
      ".anchored-spec/policy.json",
      JSON.stringify({
        workflowVariants: [{ id: "code-change", name: "Code Change", defaultTypes: ["feature"], requiredSchemas: [] }],
        changeRequiredRules: [],
        trivialExemptions: ["*.md"],
        lifecycleRules: {
          plannedToActiveRequiresChange: true,
          activeToShippedRequiresCoverage: true,
          deprecatedRequiresReason: true,
        },
        extensions: {
          harness: {
            pathRoutes: [
              {
                id: "cli-surface",
                baselineManaged: true,
                include: ["src/cli/**"],
                entityRefs: ["component:default/cli"],
                readFirst: ["docs/04-component/cli.md"],
              },
            ],
          },
        },
      }, null, 2),
    );
    writeTextFile(dir, "src/cli/index.ts", "export const cli = 1;\n");

    initGitRepo(dir);
    expect(runCommand("git", ["add", "."], dir).status).toBe(0);
    expect(runCommand("git", ["commit", "-m", "initial"], dir).status).toBe(0);

    writeTextFile(dir, "src/cli/index.ts", "export const cli = 2;\n");

    const result = runCommand("node", [TASK_START, "--changed", "--json"], dir);

    expect(result.status).toBe(0);
    const brief = JSON.parse(result.stdout);
    expect(brief.paths).toContain("src/cli/index.ts");
    expect(brief.matchedEntities[0].ref).toBe("component:default/cli");
    expect(brief.matchedTaskRoutes).toContain("cli-surface");
  });

  it("recommends and captures baselines for managed scopes", () => {
    const dir = makeWorkspace("repo-harness-baseline");
    writeTextFile(
      dir,
      ".anchored-spec/custom-brief.json",
      JSON.stringify({
        paths: ["scripts/task-start.mjs"],
        matchedTaskRoutes: ["repository-harness"],
        commands: ["node -e \"process.stdout.write('ok')\""],
        broaderCommands: [],
        baseline: { managed: true },
      }, null, 2),
    );

    const first = runCommand("node", [TASK_VERIFY, "--brief", ".anchored-spec/custom-brief.json", "--json"], dir);
    expect(first.status).toBe(0);
    const firstReport = JSON.parse(first.stdout);
    expect(firstReport.baseline.available).toBe(false);
    expect(firstReport.baseline.recommendedCommand).toBe("pnpm task:verify --update-baseline");

    const captured = runCommand("node", [TASK_VERIFY, "--brief", ".anchored-spec/custom-brief.json", "--update-baseline", "--json"], dir);
    expect(captured.status).toBe(0);
    const capturedReport = JSON.parse(captured.stdout);
    expect(capturedReport.baseline.updated).toBe(true);

    const second = runCommand("node", [TASK_VERIFY, "--brief", ".anchored-spec/custom-brief.json", "--json"], dir);
    expect(second.status).toBe(0);
    const secondReport = JSON.parse(second.stdout);
    expect(secondReport.baseline.available).toBe(true);
    expect(secondReport.baseline.summary.stillPassing).toBe(1);
  });

  it("checks required harness surfaces and records execution observability", () => {
    const dir = makeWorkspace("repo-harness-close");
    writeTextFile(
      dir,
      "package.json",
      JSON.stringify({
        name: "demo",
        scripts: {
          "task:start": "node ./scripts/task-start.mjs",
          "task:verify": "node ./scripts/task-verify.mjs",
          "task:check": "node ./scripts/task-check.mjs",
          "task:close": "node ./scripts/task-close.mjs",
          "test:harness": "vitest run src/ea/__tests__/repository-harness.test.ts",
        },
      }, null, 2),
    );
    writeTextFile(dir, ".gitignore", ".anchored-spec/task-brief.json\n.anchored-spec/verification-report.json\n.anchored-spec/verification-baseline.json\n.anchored-spec/execution-report.json\n");
    writeTextFile(dir, "docs/AGENTS.md", "# Docs\n");
    writeTextFile(dir, "docs/guides/developer-guides/agent-harness.md", "# Harness\n");
    writeTextFile(
      dir,
      ".anchored-spec/policy.json",
      JSON.stringify({
        workflowVariants: [{ id: "repository-harness", name: "Repository Harness", defaultTypes: ["chore"], requiredSchemas: [] }],
        changeRequiredRules: [],
        trivialExemptions: ["*.md"],
        lifecycleRules: {
          plannedToActiveRequiresChange: true,
          activeToShippedRequiresCoverage: true,
          deprecatedRequiresReason: true,
        },
      }, null, 2),
    );
    writeTextFile(
      dir,
      ".anchored-spec/task-brief.json",
      JSON.stringify({
        paths: ["scripts/task-start.mjs"],
        matchedTaskRoutes: ["repository-harness"],
        matchedCommonRoute: null,
        readFirst: ["docs/guides/developer-guides/agent-harness.md"],
        leafAgents: ["docs/AGENTS.md"],
        crossHints: [".anchored-spec/policy.json"],
        commands: ["node -e \"process.stdout.write('ok')\""],
        broaderCommands: [],
      }, null, 2),
    );
    writeTextFile(
      dir,
      ".anchored-spec/verification-report.json",
      JSON.stringify({
        commandMode: "focused",
        scope: { paths: ["scripts/task-start.mjs"], matchedTaskRoutes: ["repository-harness"] },
        results: [{ command: "node -e \"process.stdout.write('ok')\"", status: "passed" }],
      }, null, 2),
    );

    const checkResult = spawnSync("node", [TASK_CHECK, "--json"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(checkResult.status).toBe(0);

    const closeResult = spawnSync("node", [TASK_CLOSE, "--read", "docs/guides/developer-guides/agent-harness.md", "--agent", "docs/AGENTS.md", "--hint", ".anchored-spec/policy.json", "--json"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(closeResult.status).toBe(0);
    const execution = JSON.parse(closeResult.stdout);
    expect(execution.compliance.docs).toBe(true);
    expect(execution.compliance.commands).toBe(true);
  });
});
