/**
 * EA Spec Diff — Git Integration
 *
 * Functions to load Backstage entities from git refs and diff between them.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { BackstageEntity } from "./backstage/types.js";
import { parseBackstageYaml, parseFrontmatterEntity } from "./backstage/parser.js";
import type { AnchoredSpecConfigV1 } from "./config.js";
import { diffEntities } from "./diff.js";
import type { EaDiffReport } from "./diff.js";

function listFilesAtRef(
  projectRoot: string,
  targetPath: string,
  ref: string,
): string[] {
  try {
    const output = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", ref, "--", targetPath],
      { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return output.split("\n").filter(Boolean).filter((file) => !file.includes("/generated/"));
  } catch {
    return [];
  }
}

function readFileAtRef(
  projectRoot: string,
  ref: string,
  filePath: string,
): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${filePath}`], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function parseEntitiesFromFileContent(content: string, filePath: string): BackstageEntity[] {
  if (filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
    return parseFrontmatterEntity(content, filePath).entities.map((entry) => entry.entity);
  }
  return parseBackstageYaml(content, filePath).entities.map((entry) => entry.entity);
}

function collectFilesFromWorkingTree(
  projectRoot: string,
  roots: string[],
  extensions: string[],
): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const relPath = relative(projectRoot, fullPath);
      if (relPath.includes("/generated/")) continue;

      try {
        const stats = statSync(fullPath);
        if (stats.isDirectory()) {
          walk(fullPath);
        } else if (extensions.some((extension) => entry.endsWith(extension))) {
          files.push(fullPath);
        }
      } catch {
        // Skip unreadable files.
      }
    }
  }

  for (const root of roots) {
    walk(resolve(projectRoot, root));
  }

  return files;
}

export function loadEntitiesFromGitRef(
  projectRoot: string,
  config: AnchoredSpecConfigV1,
  ref: string,
): BackstageEntity[] {
  const files = new Set<string>();
  const entityMode = config.entityMode ?? "manifest";

  if (entityMode === "inline") {
    for (const dir of config.inlineDocDirs ?? ["docs"]) {
      for (const file of listFilesAtRef(projectRoot, dir, ref)) {
        if (file.endsWith(".md") || file.endsWith(".markdown")) {
          files.add(file);
        }
      }
    }
  } else {
    const manifestPath = config.manifestPath ?? "catalog-info.yaml";
    if (readFileAtRef(projectRoot, ref, manifestPath) != null) {
      files.add(manifestPath);
    }
    if (config.catalogDir) {
      for (const file of listFilesAtRef(projectRoot, config.catalogDir, ref)) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          files.add(file);
        }
      }
    }
  }

  const entities: BackstageEntity[] = [];
  for (const file of files) {
    const content = readFileAtRef(projectRoot, ref, file);
    if (content) {
      entities.push(...parseEntitiesFromFileContent(content, file));
    }
  }
  return entities;
}

export function loadEntitiesFromWorkingTree(
  projectRoot: string,
  config: AnchoredSpecConfigV1,
): BackstageEntity[] {
  const entityMode = config.entityMode ?? "manifest";
  const files = entityMode === "inline"
    ? collectFilesFromWorkingTree(projectRoot, config.inlineDocDirs ?? ["docs"], [".md", ".markdown"])
    : [
        ...(config.manifestPath && existsSync(resolve(projectRoot, config.manifestPath))
          ? [resolve(projectRoot, config.manifestPath)]
          : []),
        ...collectFilesFromWorkingTree(projectRoot, config.catalogDir ? [config.catalogDir] : [], [".yaml", ".yml"]),
      ];

  const entities: BackstageEntity[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    entities.push(...parseEntitiesFromFileContent(content, file));
  }
  return entities;
}

export interface DiffGitOptions {
  projectRoot: string;
  config: AnchoredSpecConfigV1;
  baseRef: string;
  /** If omitted, compares against working tree */
  headRef?: string;
}

export interface EaGitDiffResult {
  report: EaDiffReport;
  baseEntities: BackstageEntity[];
  headEntities: BackstageEntity[];
}

/**
 * Diff Backstage entities between two git refs (or a ref and the working tree).
 */
export function diffEaGitRefs(options: DiffGitOptions): EaGitDiffResult {
  const { projectRoot, config, baseRef, headRef } = options;

  const baseEntities = loadEntitiesFromGitRef(projectRoot, config, baseRef);
  const headEntities = headRef
    ? loadEntitiesFromGitRef(projectRoot, config, headRef)
    : loadEntitiesFromWorkingTree(projectRoot, config);

  return {
    report: diffEntities(baseEntities, headEntities, {
      baseRef,
      headRef: headRef ?? "working-tree",
    }),
    baseEntities,
    headEntities,
  };
}

export const loadArtifactsFromGitRef = loadEntitiesFromGitRef;
export const loadArtifactsFromWorkingTree = loadEntitiesFromWorkingTree;
