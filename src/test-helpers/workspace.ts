import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";

import type { BackstageEntity } from "../ea/backstage/types.js";
import { resolveConfigV1, type AnchoredSpecConfigV1 } from "../ea/config.js";
import {
  legacyFixtureToEntity,
  type LegacyEntityFixture,
} from "./entity-fixtures.js";

const REPO_ROOT = process.cwd();
export const CLI_PATH = join(REPO_ROOT, "dist", "cli", "index.js");

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type EntityInput =
  | BackstageEntity
  | LegacyEntityFixture;

export function createTestWorkspace(prefix: string): string {
  const dir = join(
    REPO_ROOT,
    ".test-workspaces",
    `${prefix}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupTestWorkspace(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function runCli(args: string[], cwd: string): CliRunResult {
  const result = spawnSync("node", [CLI_PATH, ...args], {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });

  return {
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    exitCode: result.status ?? (result.error ? 1 : 0),
  };
}

export function cliOutput(result: CliRunResult): string {
  return `${result.stdout}${result.stderr}`;
}

export function makeArtifact(
  overrides: Partial<LegacyEntityFixture> & { id: string; kind: string } & Record<
      string,
      unknown
    >,
): LegacyEntityFixture {
  return {
    ...overrides,
    id: overrides.id,
    kind: overrides.kind,
    title: overrides.title ?? overrides.id,
    summary: overrides.summary ?? "A sufficiently detailed test summary.",
    owners: overrides.owners ?? ["team-platform"],
    tags: overrides.tags ?? [],
    confidence: overrides.confidence ?? "declared",
    status: overrides.status ?? "active",
    relations: overrides.relations ?? [],
  };
}

export function toBackstageEntity(input: EntityInput): BackstageEntity {
  return isBackstageEntity(input) ? input : legacyFixtureToEntity(input);
}

export function writeTextFile(
  dir: string,
  relativePath: string,
  content: string,
): void {
  const filePath = join(dir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

export function readTextFile(dir: string, relativePath: string): string {
  const filePath = relativePath.startsWith("/")
    ? relativePath
    : join(dir, relativePath);
  return readFileSync(filePath, "utf-8");
}

export function readJsonFile<T>(dir: string, relativePath: string): T {
  return JSON.parse(readTextFile(dir, relativePath)) as T;
}

export function writeManifestProject(
  dir: string,
  inputs: EntityInput[] = [],
  overrides: Partial<AnchoredSpecConfigV1> = {},
): AnchoredSpecConfigV1 {
  const config = resolveConfigV1({
    ...overrides,
    entityMode: "manifest",
    manifestPath: overrides.manifestPath ?? "catalog-info.yaml",
  });

  writeTextFile(
    dir,
    ".anchored-spec/config.json",
    JSON.stringify(config, null, 2) + "\n",
  );
  mkdirSync(join(dir, config.generatedDir), { recursive: true });

  const manifestDocs = inputs
    .map((input) => `---\n${stringify(toBackstageEntity(input)).trimEnd()}\n`)
    .join("");
  writeTextFile(
    dir,
    config.manifestPath ?? "catalog-info.yaml",
    manifestDocs || "# Backstage Software Catalog\n",
  );

  return config;
}

export function writeInlineProject(
  dir: string,
  docs: Array<{ path: string; entity?: EntityInput; body?: string }>,
  overrides: Partial<AnchoredSpecConfigV1> = {},
): AnchoredSpecConfigV1 {
  const config = resolveConfigV1({
    ...overrides,
    entityMode: "inline",
    inlineDocDirs: overrides.inlineDocDirs ?? ["docs"],
  });

  writeTextFile(
    dir,
    ".anchored-spec/config.json",
    JSON.stringify(config, null, 2) + "\n",
  );
  mkdirSync(join(dir, config.generatedDir), { recursive: true });

  for (const doc of docs) {
    const frontmatter = doc.entity
      ? `---\n${stringify(toBackstageEntity(doc.entity)).trimEnd()}\n---\n\n`
      : "";
    writeTextFile(dir, doc.path, `${frontmatter}${doc.body ?? ""}`);
  }

  return config;
}

function isBackstageEntity(input: EntityInput): input is BackstageEntity {
  return (
    "metadata" in input &&
    typeof input.metadata === "object" &&
    input.metadata !== null &&
    "spec" in input &&
    typeof input.spec === "object" &&
    input.spec !== null
  );
}
