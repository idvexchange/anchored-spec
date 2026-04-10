import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { minimatch } from "minimatch";
import { parse as parseYaml } from "yaml";

import type {
  RepositoryCommandSuggestion,
  RepositoryEvidenceAdapter,
  RepositoryTarget,
} from "./repository-evidence.js";

interface WorkspacePackage {
  name: string;
  dir: string;
  scripts: Record<string, string>;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", "build", ".next", ".turbo"]);

export class NodeWorkspaceEvidenceAdapter implements RepositoryEvidenceAdapter {
  readonly id = "node-workspaces";

  discoverTargets(projectRoot: string): RepositoryTarget[] {
    return discoverWorkspacePackages(projectRoot).map((workspace) => ({
      id: workspace.name,
      name: workspace.name,
      path: workspace.dir,
      kind: "workspace",
      metadata: {
        scripts: workspace.scripts,
      },
    }));
  }

  suggestCommands(target: RepositoryTarget): RepositoryCommandSuggestion[] {
    const scripts = isStringRecord(target.metadata?.scripts) ? target.metadata.scripts : {};
    const suggestions: RepositoryCommandSuggestion[] = [];

    for (const scriptName of Object.keys(scripts)) {
      const command = target.path === "."
        ? `pnpm run ${scriptName}`
        : `pnpm --filter ${target.name} run ${scriptName}`;
      if (isActionScript(scriptName)) {
        suggestions.push({ command, tier: "actionCommands", kind: classifyScriptKind(scriptName), targetId: target.id });
      } else if (isFocusedScript(scriptName)) {
        suggestions.push({ command, tier: "commands", kind: classifyScriptKind(scriptName), targetId: target.id });
      } else if (isBroaderScript(scriptName)) {
        suggestions.push({ command, tier: "broaderCommands", kind: classifyScriptKind(scriptName), targetId: target.id });
      }
    }

    return suggestions;
  }
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

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
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

function classifyScriptKind(name: string): RepositoryCommandSuggestion["kind"] {
  const value = name.toLowerCase();
  if (value.includes("typecheck")) return "typecheck";
  if (value === "check") return "check";
  if (value === "build") return "build";
  if (value === "verify") return "verify";
  if (value.includes("lint")) return "lint";
  if (value.includes("integration")) return "integration";
  if (value.includes("e2e")) return "e2e";
  if (value.includes("test")) return "test";
  if (value.includes("generate")) return "generate";
  if (value.includes("migrate")) return "migrate";
  if (value.includes("seed")) return "seed";
  return "custom";
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => typeof entry === "string");
}
