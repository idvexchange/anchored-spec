/**
 * EA Spec Diff — Git Integration
 *
 * Functions to load EA artifacts from git refs and diff between them.
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { EaArtifactBase } from "./types.js";
import { diffEaArtifacts } from "./diff.js";
import type { EaDiffReport } from "./diff.js";

// ─── Git Helpers ────────────────────────────────────────────────────────────────

/**
 * List all YAML artifact files under the EA root at a given git ref.
 */
function listArtifactFiles(
  projectRoot: string,
  eaRoot: string,
  ref: string,
): string[] {
  try {
    const output = execSync(
      `git ls-tree -r --name-only ${ref} -- ${eaRoot}/`,
      { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return output
      .split("\n")
      .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
      .filter((f) => !f.includes("/generated/"));
  } catch {
    return [];
  }
}

/**
 * Read a file's content from a specific git ref.
 */
function readFileAtRef(
  projectRoot: string,
  ref: string,
  filePath: string,
): string | null {
  try {
    return execSync(`git show ${ref}:${filePath}`, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

// ─── Artifact Loading ───────────────────────────────────────────────────────────

/**
 * Parse a YAML string into an artifact, returning null if invalid.
 */
function parseArtifact(content: string): EaArtifactBase | null {
  try {
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === "object" && "id" in parsed && "kind" in parsed) {
      return parsed as EaArtifactBase;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load all EA artifacts from a git ref.
 */
export function loadArtifactsFromGitRef(
  projectRoot: string,
  eaRoot: string,
  ref: string,
): EaArtifactBase[] {
  const files = listArtifactFiles(projectRoot, eaRoot, ref);
  const artifacts: EaArtifactBase[] = [];

  for (const file of files) {
    const content = readFileAtRef(projectRoot, ref, file);
    if (content) {
      const artifact = parseArtifact(content);
      if (artifact) {
        artifacts.push(artifact);
      }
    }
  }

  return artifacts;
}

/**
 * Load EA artifacts from the working tree (unstaged + staged).
 */
export function loadArtifactsFromWorkingTree(
  projectRoot: string,
  eaRoot: string,
): EaArtifactBase[] {
  const artifacts: EaArtifactBase[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (entry === "generated" || entry === "schemas" || entry === ".gitkeep") continue;
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) {
          const content = readFileSync(full, "utf-8");
          const artifact = parseArtifact(content);
          if (artifact) artifacts.push(artifact);
        }
      } catch {
        // skip unreadable files
      }
    }
  }

  walk(resolve(projectRoot, eaRoot));
  return artifacts;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export interface DiffGitOptions {
  projectRoot: string;
  eaRoot: string;
  baseRef: string;
  /** If omitted, compares against working tree */
  headRef?: string;
}

/**
 * Diff EA artifacts between two git refs (or a ref and the working tree).
 */
export function diffEaGitRefs(options: DiffGitOptions): EaDiffReport {
  const { projectRoot, eaRoot, baseRef, headRef } = options;

  const baseArtifacts = loadArtifactsFromGitRef(projectRoot, eaRoot, baseRef);

  const headArtifacts = headRef
    ? loadArtifactsFromGitRef(projectRoot, eaRoot, headRef)
    : loadArtifactsFromWorkingTree(projectRoot, eaRoot);

  return diffEaArtifacts(baseArtifacts, headArtifacts, {
    baseRef,
    headRef: headRef ?? "working-tree",
  });
}
