/** Anchored Spec — YAML Frontmatter Parser
 *
 * Extracts `ea-artifacts` (or `anchored-spec`) frontmatter fields from
 * markdown documents. Supports both kebab-case YAML keys and the
 * normalised `DocFrontmatter` interface used throughout the EA framework.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ─── Constants ────────────────────────────────────────────────────────

/** Regex to extract the YAML frontmatter block from the start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Quick-check regex: does the frontmatter contain an EA-relevant key?
 * Avoids a full YAML parse when we just need a boolean answer.
 */
const EA_KEY_RE = /^(ea-artifacts|anchored-spec|type|status|audience|domain)\s*:/m;

// ─── Types ────────────────────────────────────────────────────────────

/** Parsed frontmatter fields normalised to TypeScript conventions. */
export interface DocFrontmatter {
  type?: "spec" | "architecture" | "guide" | "adr" | "runbook";
  status?: "current" | "draft" | "deprecated" | "superseded";
  /** Target audience(s) — normalised from comma-separated string or array. */
  audience?: string[];
  /** EA domain(s) this document belongs to. */
  domain?: string[];
  /** Relative paths to other documents this one depends on. */
  requires?: string[];
  /** EA artifact IDs this document relates to. */
  eaArtifacts?: string[];
  /** Estimated token count for AI context budgeting. */
  tokens?: number;
  /** ISO 8601 date when the document was last verified. */
  lastVerified?: string;
}

/** Result of parsing a markdown document's frontmatter. */
export interface ParsedDoc {
  frontmatter: DocFrontmatter;
  /** The raw frontmatter YAML (between `---` delimiters). */
  rawFrontmatter: string;
  /** The markdown body (after the closing `---`). */
  body: string;
  /** Whether frontmatter was found at all. */
  hasFrontmatter: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Normalise an `audience` value that may be a comma-separated string,
 * a single string, or already an array.
 */
function normalizeAudience(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Normalise a `domain` value that may be a single string or an array.
 */
function normalizeDomain(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }
  return undefined;
}

/**
 * Coerce a value to `string[]` if it is a string or array of strings.
 */
function toStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === "string") {
    return [value];
  }
  return undefined;
}

/**
 * Deduplicate an array of strings, preserving insertion order.
 */
function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a markdown string.
 *
 * Returns extracted frontmatter (normalised to {@link DocFrontmatter}) and
 * the remaining body separately.  If no frontmatter block is found, every
 * field on the returned `frontmatter` is `undefined` and `hasFrontmatter`
 * is `false`.
 */
export function parseFrontmatter(content: string): ParsedDoc {
  const match = FRONTMATTER_RE.exec(content);

  if (!match) {
    return {
      frontmatter: {},
      rawFrontmatter: "",
      body: content,
      hasFrontmatter: false,
    };
  }

  const rawFrontmatter = match[1]!;
  const body = content.slice(match[0].length).replace(/^\r?\n/, "");

  let raw: Record<string, unknown>;
  try {
    raw = (parseYaml(rawFrontmatter) as Record<string, unknown>) ?? {};
  } catch {
    // Malformed YAML — treat as no frontmatter
    return {
      frontmatter: {},
      rawFrontmatter,
      body,
      hasFrontmatter: false,
    };
  }

  // Merge `ea-artifacts` (primary) and `anchored-spec` (alternative)
  const eaRaw = toStringArray(raw["ea-artifacts"]);
  const asRaw = toStringArray(raw["anchored-spec"]);
  let eaArtifacts: string[] | undefined;
  if (eaRaw || asRaw) {
    eaArtifacts = dedupe([...(eaRaw ?? []), ...(asRaw ?? [])]);
  }

  const frontmatter: DocFrontmatter = {
    ...(raw["type"] != null ? { type: raw["type"] as DocFrontmatter["type"] } : {}),
    ...(raw["status"] != null ? { status: raw["status"] as DocFrontmatter["status"] } : {}),
    ...(normalizeAudience(raw["audience"]) ? { audience: normalizeAudience(raw["audience"]) } : {}),
    ...(normalizeDomain(raw["domain"]) ? { domain: normalizeDomain(raw["domain"]) } : {}),
    ...(raw["requires"] != null ? { requires: toStringArray(raw["requires"]) } : {}),
    ...(eaArtifacts ? { eaArtifacts } : {}),
    ...(raw["tokens"] != null ? { tokens: Number(raw["tokens"]) } : {}),
    ...(raw["last-verified"] != null
      ? { lastVerified: String(raw["last-verified"]) }
      : raw["lastVerified"] != null
        ? { lastVerified: String(raw["lastVerified"]) }
        : {}),
  };

  return { frontmatter, rawFrontmatter, body, hasFrontmatter: true };
}

/**
 * Extract EA artifact IDs from parsed frontmatter.
 *
 * Looks for the merged `eaArtifacts` field (which already combines
 * `ea-artifacts` and `anchored-spec` sources during parsing).
 * Returns a deduplicated array, or an empty array if none are found.
 */
export function extractArtifactIds(frontmatter: DocFrontmatter): string[] {
  return frontmatter.eaArtifacts ? dedupe(frontmatter.eaArtifacts) : [];
}

/**
 * Check whether a markdown string has EA-related frontmatter.
 *
 * Performs a quick regex check without full YAML parsing — useful for
 * filtering a large number of files before doing expensive work.
 */
export function hasEaFrontmatter(content: string): boolean {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return false;
  return EA_KEY_RE.test(match[1]!);
}

/**
 * Serialise a {@link DocFrontmatter} back to a YAML frontmatter block
 * (including the `---` delimiters).
 *
 * Converts `eaArtifacts` → `ea-artifacts` and `lastVerified` →
 * `last-verified` so the output uses the canonical kebab-case keys.
 *
 * Used by `link-docs` and `create-doc` commands.
 */
export function serializeFrontmatter(frontmatter: DocFrontmatter): string {
  const obj: Record<string, unknown> = {};

  if (frontmatter.type != null) obj["type"] = frontmatter.type;
  if (frontmatter.status != null) obj["status"] = frontmatter.status;
  if (frontmatter.audience != null) obj["audience"] = frontmatter.audience;
  if (frontmatter.domain != null) obj["domain"] = frontmatter.domain;
  if (frontmatter.requires != null) obj["requires"] = frontmatter.requires;
  if (frontmatter.eaArtifacts != null) obj["ea-artifacts"] = frontmatter.eaArtifacts;
  if (frontmatter.tokens != null) obj["tokens"] = frontmatter.tokens;
  if (frontmatter.lastVerified != null) obj["last-verified"] = frontmatter.lastVerified;

  const yaml = stringifyYaml(obj, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---`;
}
