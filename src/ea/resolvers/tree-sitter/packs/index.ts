/**
 * Anchored Spec — Tree-sitter Query Pack Registry
 *
 * Central registry of built-in query packs by language.
 */

import type { PackRegistry } from "../types.js";
import { javascriptPacks } from "./javascript.js";
import { typescriptPacks } from "./typescript.js";

/** Built-in query packs, keyed by language name. */
export const builtinPacks: PackRegistry = {
  javascript: javascriptPacks,
  typescript: typescriptPacks,
  // Future: tsx, python, go, java packs
};

/**
 * Get query packs for the given language names.
 * Returns all built-in packs if no languages specified.
 */
export function getQueryPacks(languages?: string[]): import("../types.js").QueryPack[] {
  if (!languages) {
    return Object.values(builtinPacks).flat();
  }
  if (languages.length === 0) {
    return [];
  }
  const packs: import("../types.js").QueryPack[] = [];
  for (const lang of languages) {
    const langPacks = builtinPacks[lang];
    if (langPacks) {
      packs.push(...langPacks);
    }
  }
  return packs;
}
