/**
 * Anchored Spec — Spec Loader
 *
 * Loads spec JSON files from the filesystem, resolves the spec root,
 * and provides typed access to requirements, changes, decisions, and policy.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { minimatch } from "minimatch";
import type {
  AnchoredSpecConfig,
  Requirement,
  Change,
  Decision,
  WorkflowPolicy,
  ChangeVerification,
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

function loadJsonFilesFromDir<T>(dirPath: string, pattern?: RegExp, excludeGlobs?: string[]): T[] {
  if (!existsSync(dirPath)) return [];

  const items: T[] = [];
  const entries = readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);

    if (stat.isFile() && entry.endsWith(".json")) {
      if (pattern && !pattern.test(entry)) continue;
      if (excludeGlobs?.length && excludeGlobs.some((g) => minimatch(entry, g))) continue;
      items.push(loadJsonFile<T>(fullPath));
    } else if (stat.isDirectory()) {
      // Support nested directories (e.g., changes/CHG-2026-0001-foo/change.json)
      const relDir = entry;
      if (excludeGlobs?.length && excludeGlobs.some((g) => minimatch(relDir, g))) continue;
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

  private get excludeGlobs(): string[] {
    return this.config.exclude ?? ["**/.*"];
  }

  loadRequirements(): Requirement[] {
    return loadJsonFilesFromDir<Requirement>(this.requirementsDir, /^REQ-.*\.json$/, this.excludeGlobs);
  }

  loadChanges(): Change[] {
    return loadJsonFilesFromDir<Change>(this.changesDir, undefined, this.excludeGlobs);
  }

  loadDecisions(): Decision[] {
    return loadJsonFilesFromDir<Decision>(this.decisionsDir, /^ADR-.*\.json$/, this.excludeGlobs);
  }

  loadWorkflowPolicy(): WorkflowPolicy | null {
    const policyPath = this.workflowPolicyPath;
    if (!existsSync(policyPath)) return null;
    return loadJsonFile<WorkflowPolicy>(policyPath);
  }

  loadChangeVerifications(): ChangeVerification[] {
    const changesDir = this.changesDir;
    if (!existsSync(changesDir)) return [];
    const verifications: ChangeVerification[] = [];
    for (const entry of readdirSync(changesDir)) {
      const fullPath = join(changesDir, entry);
      if (statSync(fullPath).isDirectory()) {
        const verifyPath = join(fullPath, "verification.json");
        if (existsSync(verifyPath)) {
          verifications.push(loadJsonFile<ChangeVerification>(verifyPath));
        }
      }
    }
    return verifications;
  }

  /**
   * Check if the spec root has been initialized.
   */
  isInitialized(): boolean {
    return existsSync(this.specRoot);
  }

  /**
   * Check if EA extension is enabled in config.
   */
  get eaEnabled(): boolean {
    return this.config.ea?.enabled === true;
  }

  /**
   * Get an EaRoot instance for accessing EA artifacts.
   * Returns null if EA is not configured/enabled.
   * Lazily creates the EaRoot to avoid importing EA code unless needed.
   */
  async getEaRoot(): Promise<import("../ea/loader.js").EaRoot | null> {
    if (!this.eaEnabled) return null;
    const { EaRoot } = await import("../ea/loader.js");
    return new EaRoot(this.projectRoot, this.config);
  }

  /**
   * Load all spec artifacts. When EA is enabled, also loads EA legacy
   * domain artifacts (requirements, changes, decisions) from the EA
   * pipeline, providing a unified view.
   *
   * Returns core spec data augmented with an optional `eaArtifacts` array.
   */
  async loadAll(): Promise<{
    requirements: Requirement[];
    changes: Change[];
    decisions: Decision[];
    policy: WorkflowPolicy | null;
    eaArtifacts: unknown[];
  }> {
    const requirements = this.loadRequirements();
    const changes = this.loadChanges();
    const decisions = this.loadDecisions();
    const policy = this.loadWorkflowPolicy();

    let eaArtifacts: unknown[] = [];
    if (this.eaEnabled) {
      try {
        const eaRoot = await this.getEaRoot();
        if (eaRoot && eaRoot.isInitialized()) {
          const result = await eaRoot.loadArtifacts();
          eaArtifacts = result.artifacts;
        }
      } catch {
        // EA loading failure is non-fatal for backward compatibility
      }
    }

    return { requirements, changes, decisions, policy, eaArtifacts };
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
