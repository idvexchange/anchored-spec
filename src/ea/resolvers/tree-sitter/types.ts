/**
 * Anchored Spec — Tree-sitter Discovery Resolver Types
 *
 * Declarative types for query packs that describe code patterns
 * to discover across any language with a Tree-sitter grammar.
 */

import type { EaDomain } from "../../types.js";

// ─── Query Pack Types ────────────────────────────────────────────────────────────

/** A capture mapping from a Tree-sitter query capture to a semantic role. */
export interface CaptureMapping {
  /** Tree-sitter capture name (e.g. "@route.path"). */
  capture: string;
  /** Semantic role this capture fills. */
  role: "title" | "anchor" | "method" | "table" | "event" | "service" | "metadata";
}

/** A single pattern within a query pack. */
export interface QueryPattern {
  /** Human-readable pattern name (e.g. "express-route-handler"). */
  name: string;
  /** Tree-sitter S-expression query string. */
  query: string;
  /** How to interpret query captures. */
  captures: CaptureMapping[];
  /** Schema profile this pattern produces (e.g. "api-contract"). */
  inferredSchema: string;
  /** EA domain for produced entities. */
  inferredDomain: EaDomain;
  /** Optional: category for aggregation grouping. */
  category?: "route" | "db-access" | "event" | "external-call" | "service-boundary";
}

/** A collection of patterns for a specific language/framework. */
export interface QueryPack {
  /** Pack name (e.g. "express-routes"). */
  name: string;
  /** Tree-sitter grammar language (e.g. "javascript", "python"). */
  language: string;
  /** File globs this pack applies to. */
  fileGlobs: string[];
  /** Patterns to search for. */
  patterns: QueryPattern[];
}

// ─── Query Match Types ──────────────────────────────────────────────────────────

/** A single match from running a pattern against a source file. */
export interface QueryMatch {
  /** The pattern that matched. */
  pattern: QueryPattern;
  /** Relative file path where the match was found. */
  file: string;
  /** Resolved capture values (capture name → matched text). */
  captures: Record<string, string>;
  /** Start line (0-based). */
  startLine: number;
  /** End line (0-based). */
  endLine: number;
}

// ─── Pack Registry ──────────────────────────────────────────────────────────────

/** Registry of built-in query packs by language. */
export type PackRegistry = Record<string, QueryPack[]>;
