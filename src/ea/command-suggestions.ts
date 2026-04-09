import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { parse as parseYaml } from "yaml";
import { minimatch } from "minimatch";

import type { BackstageEntity } from "./backstage/types.js";
import {
  getEntityCodeLocation,
  getEntityId,
  getEntitySource,
  getEntityTraceRefs,
} from "./backstage/accessors.js";
import type { ImpactReport } from "./impact.js";

export interface SuggestedCommandPlan {
  sourceRef: string;
  impactedEntityRefs: string[];
  impactedWorkspaces: SuggestedWorkspace[];
  commands: string[];
  broaderCommands: string[];
  actionCommands: string[];
  reasons: string[];
}

export interface SuggestedWorkspace {
  name: string;
  dir: string;
  entityRefs: string[];
}

interface WorkflowPolicyRule {
  id: string;
  include?: string[];
  exclude?: string[];
  commands?: string[];
  broaderCommands?: string[];
  actionCommands?: string[];
}

interface WorkflowPolicyShape {
  changeRequiredRules?: WorkflowPolicyRule[];
}

interface WorkspacePackage {
  name: string;
  dir: string;
  scripts: Record<string, string>;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "build", ".next", ".turbo"]);

export function buildSuggestedCommandPlan(
  report: ImpactReport,
  entities: BackstageEntity[],
  projectRoot: string,
  workflowPolicy?: Record<string, unknown> | null,
): SuggestedCommandPlan {
  const entityByRef = new Map(entities.map((entity) => [getEntityId(entity), entity]));
  const targetRefs = [report.sourceRef, ...report.impacted.map((entry) => entry.id)];
  const uniqueRefs = [...new Set(targetRefs)];
  const workspaces = discoverWorkspacePackages(projectRoot);
  const pathsByEntity = new Map<string, string[]>();

  for (const ref of uniqueRefs) {
    const entity = entityByRef.get(ref);
    if (!entity) continue;
    pathsByEntity.set(ref, collectEntityPaths(entity));
  }

  const workspaceMatches = new Map<string, { workspace: WorkspacePackage; entityRefs: Set<string> }>();
  for (const [entityRef, paths] of pathsByEntity) {
    for (const path of paths) {
      const workspace = matchWorkspaceForPath(path, workspaces);
      if (!workspace) continue;
      const existing = workspaceMatches.get(workspace.dir) ?? { workspace, entityRefs: new Set<string>() };
      existing.entityRefs.add(entityRef);
      workspaceMatches.set(workspace.dir, existing);
    }
  }

  const commands = new Set<string>();
  const broaderCommands = new Set<string>();
  const actionCommands = new Set<string>();
  const reasons = new Set<string>();

  const rules = normalizeWorkflowRules(workflowPolicy);
  for (const [entityRef, paths] of pathsByEntity) {
    for (const path of paths) {
      for (const rule of rules) {
        if (!matchesRule(path, rule)) continue;
        addAll(commands, rule.commands);
        addAll(broaderCommands, rule.broaderCommands);
        addAll(actionCommands, rule.actionCommands);
        reasons.add(`workflow policy rule "${rule.id}" matched ${path}`);
      }
      const workspace = matchWorkspaceForPath(path, workspaces);
      if (workspace) {
        addWorkspaceScriptSuggestions(workspace, commands, broaderCommands, actionCommands);
        reasons.add(`workspace "${workspace.name}" inferred from ${path} for ${entityRef}`);
      }
    }
  }

  return {
    sourceRef: report.sourceRef,
    impactedEntityRefs: report.impacted.map((entry) => entry.id),
    impactedWorkspaces: [...workspaceMatches.values()]
      .map(({ workspace, entityRefs }) => ({
        name: workspace.name,
        dir: workspace.dir,
        entityRefs: [...entityRefs].sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    commands: [...commands].sort(),
    broaderCommands: [...broaderCommands].sort(),
    actionCommands: [...actionCommands].sort(),
    reasons: [...reasons].sort(),
  };
}

function collectEntityPaths(entity: BackstageEntity): string[] {
  const values = new Set<string>();
  const codeLocation = getEntityCodeLocation(entity);
  if (codeLocation) values.add(normalizeRepoPath(codeLocation));

  const source = getEntitySource(entity);
  if (source) values.add(normalizeRepoPath(source));

  for (const traceRef of getEntityTraceRefs(entity)) {
    if (traceRef.path.startsWith("http://") || traceRef.path.startsWith("https://")) continue;
    values.add(normalizeRepoPath(traceRef.path));
  }

  return [...values].filter(Boolean);
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function discoverWorkspacePackages(projectRoot: string): WorkspacePackage[] {
  const allPackageJsons = walkPackageJsons(projectRoot);
  const workspacePatterns = readWorkspacePatterns(projectRoot);
  const workspaces = allPackageJsons
    .filter((pkgPath) => pkgPath !== join(projectRoot, "package.json"))
    .filter((pkgPath) => {
      const relativePath = normalizeRepoPath(relative(projectRoot, dirname(pkgPath)));
      if (workspacePatterns.length === 0) return true;
      return workspacePatterns.some((pattern) => minimatch(relativePath, pattern) || minimatch(`${relativePath}/package.json`, pattern));
    })
    .map((pkgPath) => {
      try {
        const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string; scripts?: Record<string, string> };
        return {
          name: parsed.name ?? normalizeRepoPath(relative(projectRoot, dirname(pkgPath))),
          dir: normalizeRepoPath(relative(projectRoot, dirname(pkgPath))),
          scripts: parsed.scripts ?? {},
        } satisfies WorkspacePackage;
      } catch {
        return undefined;
      }
    })
    .filter((value): value is WorkspacePackage => Boolean(value));

  if (workspaces.length > 0) return workspaces;

  const rootPackage = join(projectRoot, "package.json");
  if (!existsSync(rootPackage)) return [];
  try {
    const parsed = JSON.parse(readFileSync(rootPackage, "utf-8")) as { name?: string; scripts?: Record<string, string> };
    return [{
      name: parsed.name ?? ".",
      dir: ".",
      scripts: parsed.scripts ?? {},
    }];
  } catch {
    return [];
  }
}

function walkPackageJsons(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      results.push(...walkPackageJsons(path));
      continue;
    }
    if (stat.isFile() && entry === "package.json") {
      results.push(path);
    }
  }
  return results;
}

function readWorkspacePatterns(projectRoot: string): string[] {
  const patterns: string[] = [];
  const rootPackagePath = join(projectRoot, "package.json");
  if (existsSync(rootPackagePath)) {
    try {
      const parsed = JSON.parse(readFileSync(rootPackagePath, "utf-8")) as {
        workspaces?: string[] | { packages?: string[] };
      };
      if (Array.isArray(parsed.workspaces)) patterns.push(...parsed.workspaces);
      if (
        parsed.workspaces &&
        !Array.isArray(parsed.workspaces) &&
        typeof parsed.workspaces === "object" &&
        Array.isArray(parsed.workspaces.packages)
      ) {
        patterns.push(...parsed.workspaces.packages);
      }
    } catch {
      // ignore malformed package.json here; normal validation handles it elsewhere
    }
  }

  const pnpmWorkspacePath = join(projectRoot, "pnpm-workspace.yaml");
  if (existsSync(pnpmWorkspacePath)) {
    try {
      const parsed = parseYaml(readFileSync(pnpmWorkspacePath, "utf-8")) as { packages?: string[] } | null;
      if (parsed?.packages) patterns.push(...parsed.packages);
    } catch {
      // ignore malformed workspace file here
    }
  }

  return [...new Set(patterns.map((pattern) => normalizeRepoPath(pattern)))];
}

function matchWorkspaceForPath(
  path: string,
  workspaces: WorkspacePackage[],
): WorkspacePackage | undefined {
  const normalized = normalizeRepoPath(path);
  let best: WorkspacePackage | undefined;
  for (const workspace of workspaces) {
    if (
      normalized === workspace.dir ||
      normalized.startsWith(`${workspace.dir}/`) ||
      workspace.dir === "."
    ) {
      if (!best || workspace.dir.length > best.dir.length) {
        best = workspace;
      }
    }
  }
  return best;
}

function normalizeWorkflowRules(
  workflowPolicy?: Record<string, unknown> | null,
): WorkflowPolicyRule[] {
  const shape = (workflowPolicy ?? {}) as WorkflowPolicyShape;
  return Array.isArray(shape.changeRequiredRules)
    ? shape.changeRequiredRules.filter((rule): rule is WorkflowPolicyRule => Boolean(rule?.id))
    : [];
}

function matchesRule(path: string, rule: WorkflowPolicyRule): boolean {
  const normalized = normalizeRepoPath(path);
  const include = Array.isArray(rule.include) ? rule.include : [];
  const exclude = Array.isArray(rule.exclude) ? rule.exclude : [];
  if (include.length === 0) return false;
  const included = include.some((pattern) => minimatch(normalized, pattern));
  if (!included) return false;
  return !exclude.some((pattern) => minimatch(normalized, pattern));
}

function addWorkspaceScriptSuggestions(
  workspace: WorkspacePackage,
  commands: Set<string>,
  broaderCommands: Set<string>,
  actionCommands: Set<string>,
): void {
  for (const scriptName of Object.keys(workspace.scripts)) {
    const command = workspace.dir === "."
      ? `pnpm run ${scriptName}`
      : `pnpm --filter ${workspace.name} run ${scriptName}`;
    if (isActionScript(scriptName)) {
      actionCommands.add(command);
    } else if (isFocusedScript(scriptName)) {
      commands.add(command);
    } else if (isBroaderScript(scriptName)) {
      broaderCommands.add(command);
    }
  }
}

function isFocusedScript(name: string): boolean {
  const value = name.toLowerCase();
  return value === "typecheck" || value === "check" || value === "build" || value === "verify";
}

function isBroaderScript(name: string): boolean {
  const value = name.toLowerCase();
  return value.includes("test") || value.includes("lint") || value.includes("e2e") || value.includes("integration");
}

function isActionScript(name: string): boolean {
  const value = name.toLowerCase();
  return value.includes("generate") || value.includes("migrate") || value.includes("seed");
}

function addAll(target: Set<string>, values?: string[]): void {
  for (const value of values ?? []) {
    if (value.trim()) target.add(value);
  }
}
