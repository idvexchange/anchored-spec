import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  cleanupTestWorkspace,
  cliOutput,
  createTestWorkspace,
  makeEntity,
  readJsonFile,
  readTextFile,
  runCli,
  writeManifestProject,
} from "../../test-helpers/workspace.js";
const workspaces: string[] = [];
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
describe("CLI v2 commands", () => {
  it("shows top-level entity-native commands and omits removed alias groups", () => {
    const result = runCli(["--help"], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("create");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("diagrams");
    expect(result.stdout).toContain("transition");
    expect(result.stdout).not.toMatch(/\nea\s+/);
    expect(result.stdout).not.toContain("move");
    expect(result.stdout).not.toContain("enrich");
    expect(result.stdout).not.toContain("create-batch");
  });
  it("shows create descriptor discovery in help output", () => {
    const result = runCli(["create", "--help"], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("--list");
    expect(result.stdout).toContain(
      "Use --list to see every supported kind/type/schema descriptor.",
    );
    expect(result.stdout).toContain(
      'anchored-spec create --kind Domain --title "Commerce"',
    );
  });
  it("lists supported create descriptors", () => {
    const result = runCli(["create", "--list"], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Supported create descriptors");
    expect(result.stdout).toContain("Domain");
    expect(result.stdout).toContain("[schema=domain]");
    expect(result.stdout).toContain("System");
    expect(result.stdout).toContain("[schema=system]");
    expect(result.stdout).toContain("Component / website [schema=application]");
  });
  it("lists available semantic diagrams", () => {
    const result = runCli(["diagrams", "list"], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("backstage");
    expect(result.stdout).toContain("Backstage System View");
  });
  it("renders the backstage diagram with focus filtering", () => {
    const dir = makeWorkspace("cli-diagrams-backstage");
    writeManifestProject(dir, [
      makeEntity({ ref: "domain:commerce", kind: "Domain" }),
      makeEntity({
        ref: "system:checkout",
        kind: "System",
        domain: "commerce",
      }),
      makeEntity({
        ref: "component:web",
        kind: "Component",
        type: "website",
        system: "checkout",
        dependsOn: ["resource:checkout-db"],
        providesApis: ["api:checkout-api"],
      }),
      makeEntity({
        ref: "resource:checkout-db",
        kind: "Resource",
        type: "database",
        system: "checkout",
      }),
      makeEntity({
        ref: "api:checkout-api",
        kind: "API",
        type: "openapi",
        system: "checkout",
        definition: "openapi: 3.0.0",
      }),
      makeEntity({
        ref: "requirement:latency",
        kind: "Requirement",
        category: "technical",
        priority: "must",
        status: "accepted",
      }),
    ]);
    const result = runCli(
      [
        "diagrams",
        "render",
        "backstage",
        "--focus",
        "system:default/checkout",
        "--depth",
        "2",
      ],
      dir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("flowchart LR");
    expect(result.stdout).toContain("partOf");
    expect(result.stdout).toContain("inDomain");
    expect(result.stdout).toContain("dependsOn");
    expect(result.stdout).not.toContain("latency");
  });
  it("initializes the default manifest-mode project scaffold", () => {
    const dir = makeWorkspace("cli-init-manifest");
    const result = runCli(["init", "--force"], dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, ".anchored-spec", "config.json"))).toBe(true);
    expect(existsSync(join(dir, "catalog-info.yaml"))).toBe(true);
    expect(existsSync(join(dir, "docs", "README.md"))).toBe(true);
    expect(existsSync(join(dir, "docs", "01-business"))).toBe(true);
    expect(existsSync(join(dir, "docs", "guides", "user-guides"))).toBe(true);
    expect(existsSync(join(dir, "docs", "generated"))).toBe(true);
    expect(
      existsSync(join(dir, "docs", "schemas", "config-v1.schema.json")),
    ).toBe(true);
    const config = readJsonFile<{
      schemaVersion: string;
      entityMode: string;
      docs: {
        structure: string;
      };
    }>(dir, ".anchored-spec/config.json");
    expect(config.schemaVersion).toBe("1.1");
    expect(config.entityMode).toBe("manifest");
    expect(config.docs.structure).toBe("architecture-views");
  });
  it("supports inline-mode initialization for entity frontmatter projects", () => {
    const dir = makeWorkspace("cli-init-inline");
    const result = runCli(["init", "--mode", "inline", "--force"], dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, "docs"))).toBe(true);
    const config = readJsonFile<{
      entityMode: string;
      inlineDocDirs: string[];
    }>(dir, ".anchored-spec/config.json");
    expect(config.entityMode).toBe("inline");
    expect(config.inlineDocDirs).toContain("docs");
  });
  it("lists configured doc sections and creates docs from template defaults", () => {
    const dir = makeWorkspace("cli-create-doc-sections");
    expect(runCli(["init", "--force"], dir).exitCode).toBe(0);

    const listResult = runCli(["create-doc", "--list-sections"], dir);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain("component");
    expect(listResult.stdout).toContain("docs/04-component");
    expect(listResult.stdout).toContain("user-guides");

    const createResult = runCli(
      ["create-doc", "--title", "Orders Contract", "--type", "spec"],
      dir,
    );
    expect(createResult.exitCode).toBe(0);
    expect(existsSync(join(dir, "docs", "06-api", "orders-contract.md"))).toBe(
      true,
    );
    expect(cliOutput(createResult)).toContain("Section: api");
  });
  it("creates docs in an explicit configured section", () => {
    const dir = makeWorkspace("cli-create-doc-explicit-section");
    expect(runCli(["init", "--force"], dir).exitCode).toBe(0);

    const createResult = runCli(
      [
        "create-doc",
        "--title",
        "Contributor Onboarding",
        "--type",
        "guide",
        "--section",
        "developer-guides",
      ],
      dir,
    );

    expect(createResult.exitCode).toBe(0);
    expect(
      existsSync(
        join(
          dir,
          "docs",
          "guides",
          "developer-guides",
          "contributor-onboarding.md",
        ),
      ),
    ).toBe(true);
    expect(cliOutput(createResult)).toContain("Section: developer-guides");
  });
  it("creates a Backstage entity and exposes it through top-level status", () => {
    const dir = makeWorkspace("cli-create");
    expect(runCli(["init", "--force"], dir).exitCode).toBe(0);
    const createResult = runCli(
      [
        "create",
        "--kind",
        "Component",
        "--type",
        "website",
        "--title",
        "Payments App",
        "--owner",
        "group:default/platform",
      ],
      dir,
    );
    expect(createResult.exitCode).toBe(0);
    const manifest = readTextFile(dir, "catalog-info.yaml");
    expect(manifest).toContain("kind: Component");
    expect(manifest).toContain("name: payments-app");
    expect(manifest).toContain("lifecycle: experimental");
    const statusResult = runCli(["status", "--json"], dir);
    expect(statusResult.exitCode).toBe(0);
    const status = JSON.parse(statusResult.stdout) as {
      total: number;
      byKind: Record<string, number>;
      bySchema: Record<string, number>;
      byStatus: Record<string, number>;
    };
    expect(status.total).toBe(1);
    expect(status.byKind.Component).toBe(1);
    expect(status.bySchema.application).toBe(1);
    expect(status.byStatus.draft).toBe(1);
    expect(cliOutput(createResult)).toContain("Created");
  });
  it("creates System and Domain descriptors through the explicit create UX", () => {
    const dir = makeWorkspace("cli-create-context-kinds");
    expect(runCli(["init", "--force"], dir).exitCode).toBe(0);
    const createDomain = runCli(
      [
        "create",
        "--kind",
        "Domain",
        "--title",
        "Commerce",
        "--owner",
        "group:default/platform",
      ],
      dir,
    );
    const createSystem = runCli(
      [
        "create",
        "--kind",
        "System",
        "--title",
        "Checkout Platform",
        "--owner",
        "group:default/platform",
      ],
      dir,
    );
    expect(createDomain.exitCode).toBe(0);
    expect(createSystem.exitCode).toBe(0);
    const manifest = readTextFile(dir, "catalog-info.yaml");
    expect(manifest).toContain("kind: Domain");
    expect(manifest).toContain("name: commerce");
    expect(manifest).toContain("kind: System");
    expect(manifest).toContain("name: checkout-platform");
  });
  it("treats removal of an active entity as breaking in diff --compat", () => {
    const dir = makeWorkspace("cli-diff-compat");
    writeManifestProject(dir, [
      makeEntity({
        ref: "component:auth",
        kind: "Component",
        type: "service",
        status: "active",
      }),
    ]);
    expect(
      spawnSync("git", ["init"], { cwd: dir, encoding: "utf-8" }).status,
    ).toBe(0);
    expect(
      spawnSync("git", ["config", "user.name", "Test User"], {
        cwd: dir,
        encoding: "utf-8",
      }).status,
    ).toBe(0);
    expect(
      spawnSync("git", ["config", "user.email", "test@example.com"], {
        cwd: dir,
        encoding: "utf-8",
      }).status,
    ).toBe(0);
    expect(
      spawnSync("git", ["add", "."], { cwd: dir, encoding: "utf-8" }).status,
    ).toBe(0);
    expect(
      spawnSync("git", ["commit", "-m", "base"], {
        cwd: dir,
        encoding: "utf-8",
      }).status,
    ).toBe(0);
    writeManifestProject(dir, []);
    const diffResult = runCli(["diff", "HEAD", "--compat", "--json"], dir);
    expect(diffResult.exitCode).toBe(0);
    const compat = JSON.parse(diffResult.stdout) as {
      overallLevel: string;
      assessments: Array<{
        entityRef: string;
        level: string;
        reasons: Array<{
          rule: string;
        }>;
      }>;
    };
    expect(compat.overallLevel).toBe("breaking");
    expect(compat.assessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityRef: "component:default/auth",
          level: "breaking",
          reasons: expect.arrayContaining([
            expect.objectContaining({ rule: "compat:entity-removed" }),
          ]),
        }),
      ]),
    );
  });
});
