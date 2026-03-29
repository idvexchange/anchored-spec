/**
 * Anchored Spec — OpenAPI Resolver
 *
 * Resolves API anchors against OpenAPI 3.0/3.1 spec files (YAML/JSON),
 * collects observed endpoint state, and discovers api-contract artifacts.
 *
 * Design reference: docs/ea-phase2f-drift-generators-subsumption.md (OpenAPI Resolver)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { EaArtifactBase } from "../types.js";
import type { EaArtifactDraft } from "../discovery.js";
import type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
} from "./types.js";

// ─── OpenAPI Spec Shape (minimal subset we need) ────────────────────────────────

/** Minimal shape of a parsed OpenAPI document. */
export interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  paths?: Record<string, Record<string, OpenApiOperation>>;
  /** Internal: source file path (relative to project root). */
  _sourceFile: string;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}

// ─── YAML Parser (lightweight, no external deps) ────────────────────────────────

/**
 * Parse YAML or JSON content. Uses JSON.parse for JSON files.
 * For YAML, uses a lightweight parser that handles the subset of YAML
 * found in OpenAPI specs (mappings, sequences, scalars, multi-line strings).
 */
function parseContent(content: string, filepath: string): unknown {
  const ext = extname(filepath).toLowerCase();
  if (ext === ".json") {
    return JSON.parse(content);
  }

  // For YAML files, attempt JSON first (some .yaml files are actually JSON)
  try {
    return JSON.parse(content);
  } catch {
    // Parse as YAML
    return parseSimpleYaml(content);
  }
}

/**
 * Lightweight YAML parser sufficient for OpenAPI specs.
 * Handles: mappings, sequences, quoted/unquoted scalars, multi-line.
 * Does NOT handle: anchors/aliases, tags, complex keys, flow collections nested deeply.
 */
export function parseSimpleYaml(text: string): unknown {
  const lines = text.split("\n");
  let idx = 0;

  function currentIndent(line: string): number {
    const match = line.match(/^( *)/);
    return match ? match[1]!.length : 0;
  }

  function skipBlanksAndComments(): void {
    while (idx < lines.length) {
      const trimmed = lines[idx]!.trim();
      if (trimmed === "" || trimmed.startsWith("#")) {
        idx++;
      } else {
        break;
      }
    }
  }

  function parseValue(raw: string): unknown {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "~" || trimmed === "null") return null;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    if (/^-?\d+\.\d+$/.test(trimmed)) return parseFloat(trimmed);

    // Quoted strings
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }

    // Inline array: [a, b, c]
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner === "") return [];
      return inner.split(",").map((s) => parseValue(s));
    }

    // Inline object: {a: b, c: d}
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner === "") return {};
      const obj: Record<string, unknown> = {};
      for (const pair of inner.split(",")) {
        const colonIdx = pair.indexOf(":");
        if (colonIdx > 0) {
          const k = pair.slice(0, colonIdx).trim();
          const v = pair.slice(colonIdx + 1).trim();
          obj[k] = parseValue(v);
        }
      }
      return obj;
    }

    return trimmed;
  }

  function parseBlock(minIndent: number): unknown {
    skipBlanksAndComments();
    if (idx >= lines.length) return null;

    const line = lines[idx]!;
    const indent = currentIndent(line);
    const trimmed = line.trim();

    // Sequence item
    if (trimmed.startsWith("- ") || trimmed === "-") {
      const arr: unknown[] = [];
      while (idx < lines.length) {
        skipBlanksAndComments();
        if (idx >= lines.length) break;
        const cur = lines[idx]!;
        const ci = currentIndent(cur);
        const ct = cur.trim();
        if (ci < indent || (ci === indent && !ct.startsWith("-"))) break;
        if (ci > indent) break;

        idx++;
        const afterDash = ct.slice(1).trim();

        if (afterDash === "" || afterDash.endsWith(":")) {
          // Sub-block under the dash
          if (afterDash.endsWith(":")) {
            // Inline key on the dash line: "- key:"
            const key = afterDash.slice(0, -1).trim();
            const obj: Record<string, unknown> = {};
            // Check if there's a value on the same line
            obj[key] = parseBlock(indent + 2);
            // There might be more sibling keys at the same indent
            while (idx < lines.length) {
              skipBlanksAndComments();
              if (idx >= lines.length) break;
              const nxt = lines[idx]!;
              const ni = currentIndent(nxt);
              if (ni <= indent) break;
              const nt = nxt.trim();
              const cIdx = nt.indexOf(":");
              if (cIdx > 0 && !nt.startsWith("-")) {
                const nk = nt.slice(0, cIdx).trim();
                const nv = nt.slice(cIdx + 1).trim();
                idx++;
                if (nv === "") {
                  obj[nk] = parseBlock(ni + 2);
                } else {
                  obj[nk] = parseValue(nv);
                }
              } else {
                break;
              }
            }
            arr.push(obj);
          } else {
            arr.push(parseBlock(indent + 2));
          }
        } else if (afterDash.includes(": ") || afterDash.endsWith(":")) {
          // Mapping starting on the dash line
          const colonIdx = afterDash.indexOf(":");
          const key = afterDash.slice(0, colonIdx).trim();
          const val = afterDash.slice(colonIdx + 1).trim();
          const obj: Record<string, unknown> = {};
          obj[key] = val === "" ? parseBlock(indent + 2) : parseValue(val);

          // Collect remaining keys at deeper indent
          while (idx < lines.length) {
            skipBlanksAndComments();
            if (idx >= lines.length) break;
            const nxt = lines[idx]!;
            const ni = currentIndent(nxt);
            if (ni <= indent) break;
            const nt = nxt.trim();
            const cIdx2 = nt.indexOf(":");
            if (cIdx2 > 0 && !nt.startsWith("-")) {
              const nk = nt.slice(0, cIdx2).trim();
              const nv = nt.slice(cIdx2 + 1).trim();
              idx++;
              if (nv === "") {
                obj[nk] = parseBlock(ni + 2);
              } else {
                obj[nk] = parseValue(nv);
              }
            } else {
              break;
            }
          }
          arr.push(obj);
        } else {
          arr.push(parseValue(afterDash));
        }
      }
      return arr;
    }

    // Mapping
    if (trimmed.includes(":")) {
      const obj: Record<string, unknown> = {};
      while (idx < lines.length) {
        skipBlanksAndComments();
        if (idx >= lines.length) break;
        const cur = lines[idx]!;
        const ci = currentIndent(cur);
        if (ci < minIndent) break;
        const ct = cur.trim();

        const colonIdx = ct.indexOf(":");
        if (colonIdx <= 0 || ct.startsWith("-")) break;

        const key = ct.slice(0, colonIdx).trim();
        const val = ct.slice(colonIdx + 1).trim();
        idx++;

        if (val === "" || val === "|" || val === ">") {
          if (val === "|" || val === ">") {
            // Multi-line scalar
            const mLines: string[] = [];
            const baseIndent = ci + 2;
            while (idx < lines.length) {
              const ml = lines[idx]!;
              if (ml.trim() === "") {
                mLines.push("");
                idx++;
                continue;
              }
              if (currentIndent(ml) < baseIndent) break;
              mLines.push(ml.slice(baseIndent));
              idx++;
            }
            obj[key] = val === "|" ? mLines.join("\n") : mLines.join(" ").trim();
          } else {
            obj[key] = parseBlock(ci + 2);
          }
        } else {
          obj[key] = parseValue(val);
        }
      }
      return obj;
    }

    // Plain scalar
    idx++;
    return parseValue(trimmed);
  }

  return parseBlock(0);
}

// ─── File Discovery ─────────────────────────────────────────────────────────────

const OPENAPI_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".anchored-spec"]);

/**
 * Recursively find OpenAPI spec files in a directory.
 * A file is considered OpenAPI if it contains "openapi" or "swagger" key at root.
 */
export function findOpenApiFiles(rootDir: string, maxDepth = 5): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith(".") && SKIP_DIRS.has(entry)) continue;
      if (SKIP_DIRS.has(entry)) continue;

      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile() && OPENAPI_EXTENSIONS.has(extname(entry).toLowerCase())) {
        // Quick check: is it an OpenAPI file?
        try {
          const content = readFileSync(full, "utf-8").slice(0, 2000);
          if (
            content.includes("openapi:") ||
            content.includes('"openapi"') ||
            content.includes("swagger:") ||
            content.includes('"swagger"')
          ) {
            results.push(full);
          }
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(rootDir, 0);
  return results;
}

/**
 * Load and parse an OpenAPI spec file.
 * Returns null if the file cannot be parsed.
 */
export function loadOpenApiSpec(filepath: string, projectRoot: string): OpenApiSpec | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = parseContent(content, filepath) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;

    // Must have openapi or swagger key
    if (!parsed.openapi && !parsed.swagger) return null;

    return {
      ...parsed,
      _sourceFile: relative(projectRoot, filepath),
    } as unknown as OpenApiSpec;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Check if an OpenAPI spec has a specific endpoint (method + path). */
export function hasEndpoint(spec: OpenApiSpec, method: string, path: string): boolean {
  const paths = spec.paths ?? {};
  const pathEntry = paths[path];
  if (!pathEntry) return false;
  return method.toLowerCase() in pathEntry;
}

/** Find which specs contain a given endpoint. */
function findEndpointLocations(
  specs: OpenApiSpec[],
  method: string,
  path: string,
): string[] {
  return specs
    .filter((s) => hasEndpoint(s, method, path))
    .map((s) => s._sourceFile);
}

/** Extract all endpoints from an OpenAPI spec as "METHOD /path" strings. */
export function extractAllEndpoints(spec: OpenApiSpec): string[] {
  const endpoints: string[] = [];
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    if (!methods || typeof methods !== "object") continue;
    for (const method of Object.keys(methods)) {
      if (method.startsWith("x-") || method === "parameters" || method === "summary" || method === "description") {
        continue;
      }
      endpoints.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return endpoints.sort();
}

/** Slugify a title for use as artifact ID. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ─── OpenAPI Resolver ───────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "openapi:specs";

/**
 * OpenAPI Resolver — resolves API anchors, collects observed endpoint state,
 * and discovers api-contract artifacts from OpenAPI spec files.
 *
 * Supports OpenAPI 3.0, 3.1, and Swagger 2.0 specs in YAML or JSON format.
 */
export class OpenApiResolver implements EaResolver {
  readonly name = "openapi";
  readonly domains: EaResolver["domains"] = ["systems"];
  readonly kinds = ["api-contract", "application", "service"];

  /**
   * Resolve API anchors on an artifact against OpenAPI spec files.
   *
   * Looks for anchors in the `apis` category and checks them against
   * all discovered OpenAPI specs. Each anchor should be in the format
   * "METHOD /path" (e.g., "GET /users", "POST /orders").
   */
  resolveAnchors(
    artifact: EaArtifactBase,
    ctx: EaResolverContext,
  ): EaAnchorResolution[] | null {
    const apiAnchors = artifact.anchors?.apis;
    if (!apiAnchors || apiAnchors.length === 0) return null;

    const specs = this.loadSpecs(ctx);
    if (specs.length === 0) {
      ctx.logger.warn("No OpenAPI specs found", { projectRoot: ctx.projectRoot });
      return null;
    }

    const resolutions: EaAnchorResolution[] = [];
    const now = new Date().toISOString();

    for (const anchor of apiAnchors) {
      const parts = anchor.split(" ");
      const method = (parts[0] ?? "").toUpperCase();
      const path = parts.slice(1).join(" ");

      if (!method || !path) {
        resolutions.push({
          anchorKind: "apis",
          anchorValue: anchor,
          status: "unknown",
          confidence: "low",
          resolvedAt: now,
          message: `Invalid anchor format: expected "METHOD /path", got "${anchor}"`,
        });
        continue;
      }

      const locations = findEndpointLocations(specs, method, path);

      resolutions.push({
        anchorKind: "apis",
        anchorValue: anchor,
        status: locations.length > 0 ? "found" : "missing",
        confidence: "high",
        resolvedAt: now,
        foundIn: locations.length > 0 ? locations : undefined,
        message:
          locations.length > 0
            ? undefined
            : `API endpoint ${method} ${path} not found in any OpenAPI spec`,
      });
    }

    return resolutions;
  }

  /**
   * Collect observed state — enumerate all endpoints from all OpenAPI specs.
   */
  collectObservedState(ctx: EaResolverContext): ObservedEaState | null {
    const specs = this.loadSpecs(ctx);
    if (specs.length === 0) return null;

    const entities: ObservedEntity[] = [];

    for (const spec of specs) {
      for (const [path, methods] of Object.entries(spec.paths ?? {})) {
        if (!methods || typeof methods !== "object") continue;
        for (const method of Object.keys(methods)) {
          if (method.startsWith("x-") || method === "parameters" || method === "summary" || method === "description") {
            continue;
          }
          const op = (methods as Record<string, OpenApiOperation>)[method];
          entities.push({
            externalId: `${method.toUpperCase()} ${path}`,
            inferredKind: "api-contract",
            inferredDomain: "systems",
            metadata: {
              specFile: spec._sourceFile,
              operationId: op?.operationId,
              summary: op?.summary,
              tags: op?.tags,
              deprecated: op?.deprecated,
              specVersion: spec.openapi ?? spec.swagger,
              apiTitle: spec.info?.title,
            },
          });
        }
      }
    }

    return {
      source: "openapi",
      collectedAt: new Date().toISOString(),
      entities,
      relationships: [],
    };
  }

  /**
   * Discover api-contract artifacts from OpenAPI spec files.
   *
   * Each OpenAPI spec file produces one draft artifact with all its endpoints
   * listed as API anchors.
   */
  discoverArtifacts(ctx: EaResolverContext): EaArtifactDraft[] | null {
    const specs = this.loadSpecs(ctx);
    if (specs.length === 0) return null;

    const drafts: EaArtifactDraft[] = [];
    const now = new Date().toISOString();

    for (const spec of specs) {
      const title = spec.info?.title ?? "Untitled API";
      const slug = slugify(title);
      const apis = extractAllEndpoints(spec);

      drafts.push({
        suggestedId: `systems/API-${slug}`,
        kind: "api-contract",
        title,
        summary:
          spec.info?.description ?? `API contract discovered from ${spec._sourceFile}`,
        status: "draft",
        confidence: "observed",
        anchors: apis.length > 0 ? { apis } : undefined,
        discoveredBy: "openapi",
        discoveredAt: now,
        kindSpecificFields: {
          protocol: "rest",
          specFormat: "openapi",
          specPath: spec._sourceFile,
          version: spec.info?.version,
        },
      });
    }

    return drafts;
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  /**
   * Load all OpenAPI specs from the project.
   * Uses the resolver cache to avoid re-scanning on repeated calls.
   */
  private loadSpecs(ctx: EaResolverContext): OpenApiSpec[] {
    // Try cache first
    const cacheKey = `${CACHE_KEY_PREFIX}:${ctx.source ?? "default"}`;
    const cached = ctx.cache.get<OpenApiSpec[]>(cacheKey);
    if (cached) {
      ctx.logger.debug("Using cached OpenAPI specs", { count: cached.length });
      return cached;
    }

    // Scan for files
    const scanDir = ctx.source
      ? join(ctx.projectRoot, ctx.source)
      : ctx.projectRoot;

    ctx.logger.debug("Scanning for OpenAPI specs", { dir: scanDir });
    const files = findOpenApiFiles(scanDir);

    const specs: OpenApiSpec[] = [];
    for (const file of files) {
      const spec = loadOpenApiSpec(file, ctx.projectRoot);
      if (spec) {
        specs.push(spec);
        ctx.logger.debug("Loaded OpenAPI spec", {
          file: spec._sourceFile,
          title: spec.info?.title,
          version: spec.openapi ?? spec.swagger,
        });
      }
    }

    // Cache the results
    if (specs.length > 0) {
      ctx.cache.set(cacheKey, specs);
    }

    ctx.logger.info(`Found ${specs.length} OpenAPI spec(s)`, {
      files: specs.map((s) => s._sourceFile),
    });

    return specs;
  }
}
