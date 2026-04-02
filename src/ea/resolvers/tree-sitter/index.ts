/**
 * Anchored Spec — Tree-sitter Discovery Resolver
 *
 * Language-agnostic code analysis for EA entity discovery.
 */

export { TreeSitterDiscoveryResolver, resetTreeSitterCache } from "./base.js";
export { aggregateMatches } from "./aggregator.js";
export { getQueryPacks, builtinPacks } from "./packs/index.js";
export type {
  QueryPack,
  QueryPattern,
  CaptureMapping,
  QueryMatch,
  PackRegistry,
} from "./types.js";
