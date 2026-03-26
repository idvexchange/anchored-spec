/**
 * Anchored Spec — Spec Loader
 *
 * Loads spec JSON files from the filesystem, resolves the spec root,
 * and provides typed access to requirements, changes, decisions, and policy.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import type {
  AnchoredSpecConfig,
  Requirement,
  Change,
  Decision,
  WorkflowPolicy,
} from "./types.js";

// ─── Default Configuration ─────────────────────────────────────────────────────

function buildDefaults(specRoot: string): AnchoredSpecConfig {
  return {
    specRoot,
    schemasDir: `${specRoot}/schemas`,
    requirementsDir: `${specRoot}/requirements`,
    changesDir: `${specRoot}/changes`,
    decisionsDir: `${specRoot}/decisions`,
    workflowPolicyPath: `${specRoot}/workflow-policy.json`,
    generatedDir: `${specRoot}/generated`,
  };
}

const CONFIG_FILE = ".anchored-spec/config.json";

// ─── Config Resolution ─────────────────────────────────────────────────────────

/**
 * Walk up parent directories to find .anchored-spec/config.json.
 * Returns the directory containing it, or null if not found.
 */
export function findProjectRoot(startDir: string): string | null {
  let current = resolve(startDir);
  const root = dirname(current) === current ? current : undefined;

  while (true) {
    if (existsSync(join(current, CONFIG_FILE))) {
      return current;
    }
    // Also check for specRoot dir — but require a recognizable subdirectory
    // to avoid false-positives on random "specs/" dirs in monorepos
    if (
      existsSync(join(current, "specs", "requirements")) ||
      existsSync(join(current, "specs", "workflow-policy.json"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }

  return null;
}

/**
 * Resolve the anchored-spec configuration.
 * Looks for .anchored-spec/config.json in the project root.
 * Falls back to defaults if not found.
 *
 * When a user overrides specRoot, subdirectory paths cascade
 * automatically unless explicitly overridden.
 */
export function resolveConfig(projectRoot: string): AnchoredSpecConfig {
  const configPath = join(projectRoot, CONFIG_FILE);
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, "utf-8")) as Partial<AnchoredSpecConfig>;
    const specRoot = raw.specRoot ?? "specs";
    const defaults = buildDefaults(specRoot);
    return { ...defaults, ...raw };
  }
  return buildDefaults("specs");
}

// ─── JSON File Loading ─────────────────────────────────────────────────────────

function loadJsonFile<T>(filePath: string): T {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${filePath}: ${message}`);
  }
}

function loadJsonFilesFromDir<T>(dirPath: string, pattern?: RegExp): T[] {
  if (!existsSync(dirPath)) return [];

  const items: T[] = [];
  const entries = readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith(".json")) {
      if (pattern && !pattern.test(entry)) continue;
      items.push(loadJsonFile<T>(fullPath));
    } else if (stat.isDirectory()) {
      // Support nested directories (e.g., changes/CHG-2026-0001-foo/change.json)
      const nestedJson = join(fullPath, "change.json");
      if (existsSync(nestedJson)) {
        items.push(loadJsonFile<T>(nestedJson));
      }
    }
  }

  return items;
}

// ─── Spec Root ─────────────────────────────────────────────────────────────────

export class SpecRoot {
  readonly projectRoot: string;
  readonly config: AnchoredSpecConfig;

  constructor(projectRoot: string, config?: AnchoredSpecConfig) {
    this.projectRoot = resolve(projectRoot);
    this.config = config ?? resolveConfig(this.projectRoot);
  }

  private resolvePath(configKey: keyof AnchoredSpecConfig): string {
    const value = this.config[configKey];
    if (typeof value !== "string") return "";
    return join(this.projectRoot, value);
  }

  get specRoot(): string {
    return this.resolvePath("specRoot");
  }

  get requirementsDir(): string {
    return this.resolvePath("requirementsDir");
  }

  get changesDir(): string {
    return this.resolvePath("changesDir");
  }

  get decisionsDir(): string {
    return this.resolvePath("decisionsDir");
  }

  get generatedDir(): string {
    return this.resolvePath("generatedDir");
  }

  get workflowPolicyPath(): string {
    return join(this.projectRoot, this.config.workflowPolicyPath ?? "specs/workflow-policy.json");
  }

  // ─── Loaders ───────────────────────────────────────────────────────────────

  loadRequirements(): Requirement[] {
    return loadJsonFilesFromDir<Requirement>(this.requirementsDir, /^REQ-.*\.json$/);
  }

  loadChanges(): Change[] {
    return loadJsonFilesFromDir<Change>(this.changesDir);
  }

  loadDecisions(): Decision[] {
    return loadJsonFilesFromDir<Decision>(this.decisionsDir, /^ADR-.*\.json$/);
  }

  loadWorkflowPolicy(): WorkflowPolicy | null {
    const policyPath = this.workflowPolicyPath;
    if (!existsSync(policyPath)) return null;
    return loadJsonFile<WorkflowPolicy>(policyPath);
  }

  /**
   * Check if the spec root has been initialized.
   */
  isInitialized(): boolean {
    return existsSync(this.specRoot);
  }

  /**
   * Get a summary of what's in the spec root.
   * Uses directory listing for counts to avoid full JSON parsing.
   */
  getSummary(): {
    initialized: boolean;
    requirementCount: number;
    changeCount: number;
    decisionCount: number;
    hasPolicy: boolean;
  } {
    if (!this.isInitialized()) {
      return {
        initialized: false,
        requirementCount: 0,
        changeCount: 0,
        decisionCount: 0,
        hasPolicy: false,
      };
    }

    const countFiles = (dir: string, pattern: RegExp): number => {
      if (!existsSync(dir)) return 0;
      return readdirSync(dir).filter((f) => pattern.test(f)).length;
    };

    const countChangeDirs = (dir: string): number => {
      if (!existsSync(dir)) return 0;
      return readdirSync(dir).filter((entry) => {
        const fullPath = join(dir, entry);
        return (
          (statSync(fullPath).isDirectory() && existsSync(join(fullPath, "change.json"))) ||
          (statSync(fullPath).isFile() && entry.endsWith(".json"))
        );
      }).length;
    };

    return {
      initialized: true,
      requirementCount: countFiles(this.requirementsDir, /^REQ-.*\.json$/),
      changeCount: countChangeDirs(this.changesDir),
      decisionCount: countFiles(this.decisionsDir, /^ADR-.*\.json$/),
      hasPolicy: existsSync(this.workflowPolicyPath),
    };
  }
}
