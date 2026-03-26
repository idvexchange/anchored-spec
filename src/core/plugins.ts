/**
 * Anchored Spec — Plugin System
 *
 * Load and execute custom checks from plugins defined in config.
 * Plugins are Node modules that export an AnchoredSpecPlugin object.
 */

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import type {
  AnchoredSpecPlugin,
  PluginContext,
  ValidationError,
} from "./types.js";

// ─── Plugin Resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a plugin specifier to an absolute path.
 * Supports:
 *  - Relative paths: "./my-plugin" or "./plugins/custom.js"
 *  - Package names: "anchored-spec-plugin-foo"
 */
function resolvePluginPath(specifier: string, projectRoot: string): string {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return resolve(projectRoot, specifier);
  }
  // npm package — resolve from project's node_modules
  return join(projectRoot, "node_modules", specifier);
}

// ─── Plugin Loading ─────────────────────────────────────────────────────────────

export async function loadPlugin(
  specifier: string,
  projectRoot: string,
): Promise<AnchoredSpecPlugin> {
  const pluginPath = resolvePluginPath(specifier, projectRoot);

  // Try common entry points
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
    throw new Error(
      `Plugin "${specifier}" not found. Tried: ${candidates.join(", ")}`,
    );
  }

  const mod = await import(resolvedPath);
  const plugin: AnchoredSpecPlugin = mod.default ?? mod;

  if (!plugin.name) {
    throw new Error(
      `Plugin "${specifier}" must export a "name" property.`,
    );
  }

  return plugin;
}

export async function loadPlugins(
  specifiers: string[],
  projectRoot: string,
): Promise<AnchoredSpecPlugin[]> {
  const plugins: AnchoredSpecPlugin[] = [];

  for (const spec of specifiers) {
    try {
      plugins.push(await loadPlugin(spec, projectRoot));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to load plugin "${spec}": ${msg}`);
    }
  }

  return plugins;
}

// ─── Plugin Execution ───────────────────────────────────────────────────────────

export function runPluginChecks(
  plugins: AnchoredSpecPlugin[],
  ctx: PluginContext,
): ValidationError[] {
  const errors: ValidationError[] = [];

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
          message: `Plugin "${plugin.name}" check "${check.id}" threw: ${msg}`,
          severity: "error",
          rule: `plugin:${plugin.name}/${check.id}`,
        });
      }
    }
  }

  return errors;
}
