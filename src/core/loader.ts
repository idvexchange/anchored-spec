/**
 * Anchored Spec — Spec Loader
 *
 * Loads spec JSON files from the filesystem, resolves the spec root,
 * and provides typed access to requirements, changes, decisions, and policy.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  AnchoredSpecConfig,
  Requirement,
  Change,
  Decision,
  WorkflowPolicy,
} from "./types.js";

// ─── Default Configuration ─────────────────────────────────────────────────────

const DEFAULT_CONFIG: AnchoredSpecConfig = {
  specRoot: "specs",
  schemasDir: "specs/schemas",
  requirementsDir: "specs/requirements",
  changesDir: "specs/changes",
  decisionsDir: "specs/decisions",
  workflowPolicyPath: "specs/workflow-policy.json",
  generatedDir: "specs/generated",
};

const CONFIG_FILE = ".anchored-spec/config.json";

// ─── Config Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the anchored-spec configuration.
 * Looks for .anchored-spec/config.json in the project root.
 * Falls back to defaults if not found.
 */
export function resolveConfig(projectRoot: string): AnchoredSpecConfig {
  const configPath = join(projectRoot, CONFIG_FILE);
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...raw };
  }
  return { ...DEFAULT_CONFIG };
}

// ─── JSON File Loading ─────────────────────────────────────────────────────────

function loadJsonFile<T>(path: string): T {
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as T;
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
   */
  getSummary(): {
    initialized: boolean;
    requirementCount: number;
    changeCount: number;
    decisionCount: number;
    hasPolicy: boolean;
  } {
    return {
      initialized: this.isInitialized(),
      requirementCount: this.isInitialized() ? this.loadRequirements().length : 0,
      changeCount: this.isInitialized() ? this.loadChanges().length : 0,
      decisionCount: this.isInitialized() ? this.loadDecisions().length : 0,
      hasPolicy: existsSync(this.workflowPolicyPath),
    };
  }
}
