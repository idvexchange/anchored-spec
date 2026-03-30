/**
 * Anchored Spec — Config-Driven Resolver Loader
 *
 * Loads resolvers from the config.json `resolvers` array.
 * Supports built-in resolver names, tree-sitter with query pack options,
 * and custom resolvers via dynamic import of module paths.
 */

import { join } from "node:path";
import type { EaResolverConfig } from "../config.js";
import type { EaResolver, EaResolverContext } from "./types.js";
import type { EaArtifactDraft } from "../discovery.js";
import { TreeSitterDiscoveryResolver } from "./tree-sitter/base.js";
import { getQueryPacks } from "./tree-sitter/packs/index.js";

/** Built-in resolver names that don't need a path. */
const BUILTIN_NAMES = new Set([
  "openapi",
  "kubernetes",
  "terraform",
  "sql-ddl",
  "dbt",
  "tree-sitter",
]);

/**
 * A loaded resolver — either sync (EaResolver) or async (TreeSitter).
 * The discover command should check `isAsync` and await accordingly.
 */
export interface LoadedResolver {
  name: string;
  isAsync: boolean;
  discoverSync?: (ctx: EaResolverContext) => EaArtifactDraft[] | null;
  discoverAsync?: (ctx: EaResolverContext) => Promise<EaArtifactDraft[] | null>;
}

/**
 * Load a single resolver from config.
 *
 * @param config - Resolver config entry
 * @param builtinMap - Map of built-in resolver name → constructor
 * @param projectRoot - Absolute path to project root (for resolving relative paths)
 */
export async function loadResolver(
  config: EaResolverConfig,
  builtinMap: Record<string, new () => EaResolver>,
  projectRoot: string,
): Promise<LoadedResolver> {
  // 1. Built-in resolver by name
  if (config.name) {
    if (config.name === "tree-sitter") {
      const languages = config.options?.queryPacks as string[] | undefined;
      const packs = getQueryPacks(languages);

      // Load custom packs if specified
      const customPackPaths = config.options?.customPacks as string[] | undefined;
      if (customPackPaths) {
        for (const packPath of customPackPaths) {
          const absPath = join(projectRoot, packPath);
          try {
            const mod = await import(absPath);
            const customPacks = mod.default ?? mod.queryPacks ?? mod.packs;
            if (Array.isArray(customPacks)) {
              packs.push(...customPacks);
            }
          } catch (err) {
            throw new Error(
              `Failed to load custom query pack from "${packPath}": ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      const resolver = new TreeSitterDiscoveryResolver(packs);
      return {
        name: resolver.name,
        isAsync: true,
        discoverAsync: (ctx) => resolver.discoverArtifacts(ctx),
      };
    }

    const ResolverClass = builtinMap[config.name];
    if (!ResolverClass) {
      throw new Error(
        `Unknown built-in resolver "${config.name}". Available: ${[...BUILTIN_NAMES].join(", ")}`,
      );
    }

    const resolver = new ResolverClass();
    return {
      name: resolver.name,
      isAsync: false,
      discoverSync: (ctx) => resolver.discoverArtifacts?.(ctx) ?? null,
    };
  }

  // 2. Custom resolver by path
  if (config.path) {
    const absPath = join(projectRoot, config.path);
    let mod: Record<string, unknown>;
    try {
      mod = await import(absPath);
    } catch (err) {
      throw new Error(
        `Failed to load custom resolver from "${config.path}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Support: default export as class, default export as instance, or named `resolver`
    const exported = mod.default ?? mod.resolver;
    let resolver: EaResolver;

    if (typeof exported === "function") {
      // Constructor — instantiate it
      resolver = new (exported as new () => EaResolver)();
    } else if (exported && typeof exported === "object" && "name" in exported) {
      // Already an instance
      resolver = exported as EaResolver;
    } else {
      throw new Error(
        `Custom resolver at "${config.path}" must export a class or an EaResolver object as default export.`,
      );
    }

    return {
      name: resolver.name,
      isAsync: false,
      discoverSync: (ctx) => resolver.discoverArtifacts?.(ctx) ?? null,
    };
  }

  throw new Error(
    'Resolver config must have either "name" (built-in) or "path" (custom module).',
  );
}

/**
 * Load all resolvers from config.
 * Returns an array of loaded resolvers ready to execute.
 */
export async function loadResolversFromConfig(
  configs: EaResolverConfig[],
  builtinMap: Record<string, new () => EaResolver>,
  projectRoot: string,
): Promise<LoadedResolver[]> {
  const resolvers: LoadedResolver[] = [];
  for (const config of configs) {
    const resolver = await loadResolver(config, builtinMap, projectRoot);
    resolvers.push(resolver);
  }
  return resolvers;
}
