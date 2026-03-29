/**
 * Anchored Spec — EA Plugin System
 *
 * Load and execute custom checks from EA-aware plugins.
 * Plugins receive EaRoot context instead of SpecRoot context.
 *
 * This is the EA replacement for src/core/plugins.ts.
 */

import { resolve, join, relative } from "node:path";
import { existsSync } from "node:fs";
import type { EaArtifactBase } from "./types.js";
import type { EaValidationError } from "./validate.js";

// ─── EA Plugin Types ────────────────────────────────────────────────────────────

/** Context passed to EA plugin checks. */
export interface EaPluginContext {
  artifacts: EaArtifactBase[];
  projectRoot: string;
  config: Record<string, unknown>;
}

/** A single check provided by an EA plugin. */
export interface EaPluginCheck {
  id: string;
  description: string;
  check: (ctx: EaPluginContext) => EaValidationError[];
}

/** Hooks an EA plugin can provide. */
export interface EaPluginHooks {
  onValidate?: (ctx: { artifacts: EaArtifactBase[]; builtinFindings: EaValidationError[] }) =>
    EaValidationError[] | Promise<EaValidationError[]>;
  onGenerate?: (ctx: { artifacts: EaArtifactBase[]; generatedDir: string }) =>
    void | Promise<void>;
}

/** An EA-aware plugin. */
export interface EaPlugin {
  name: string;
  version?: string;
  checks?: EaPluginCheck[];
  hooks?: EaPluginHooks;
}

// ─── Plugin Resolution ──────────────────────────────────────────────────────────

function resolvePluginPath(specifier: string, projectRoot: string): string {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const resolved = resolve(projectRoot, specifier);
    const rel = relative(projectRoot, resolved);
    if (rel.startsWith("..")) {
      console.warn(`⚠ Plugin "${specifier}" resolves outside project root: ${resolved}`);
    }
    return resolved;
  }
  return join(projectRoot, "node_modules", specifier);
}

// ─── Plugin Loading ─────────────────────────────────────────────────────────────

export async function loadEaPlugin(
  specifier: string,
  projectRoot: string,
): Promise<EaPlugin> {
  const pluginPath = resolvePluginPath(specifier, projectRoot);

  const candidates = [
    pluginPath,
    `${pluginPath}.js`,
    `${pluginPath}.mjs`,
    `${pluginPath}/index.js`,
    `${pluginPath}/index.mjs`,
  ];

  let resolvedPath: string | null = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      resolvedPath = candidate;
      break;
    }
  }

  if (!resolvedPath) {
    throw new Error(`EA Plugin "${specifier}" not found. Tried: ${candidates.join(", ")}`);
  }

  const mod = await import(resolvedPath);
  const plugin: EaPlugin = mod.default ?? mod;

  if (!plugin.name) {
    throw new Error(`EA Plugin "${specifier}" must export a "name" property.`);
  }

  return plugin;
}

export async function loadEaPlugins(
  specifiers: string[],
  projectRoot: string,
): Promise<EaPlugin[]> {
  const plugins: EaPlugin[] = [];
  for (const spec of specifiers) {
    try {
      plugins.push(await loadEaPlugin(spec, projectRoot));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load EA plugin "${spec}": ${msg}`);
    }
  }
  return plugins;
}

// ─── Plugin Execution ───────────────────────────────────────────────────────────

export function runEaPluginChecks(
  plugins: EaPlugin[],
  ctx: EaPluginContext,
): EaValidationError[] {
  const errors: EaValidationError[] = [];

  for (const plugin of plugins) {
    if (!plugin.checks || plugin.checks.length === 0) continue;

    for (const check of plugin.checks) {
      try {
        const result = check.check(ctx);
        for (const err of result) {
          errors.push({
            ...err,
            rule: `plugin:${plugin.name}/${check.id}`,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({
          path: "",
          message: `EA Plugin "${plugin.name}" check "${check.id}" threw: ${msg}`,
          severity: "error",
          rule: `plugin:${plugin.name}/${check.id}`,
        });
      }
    }
  }

  return errors;
}
