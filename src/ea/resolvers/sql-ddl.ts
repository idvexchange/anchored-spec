/**
 * Anchored Spec — SQL DDL Resolver
 *
 * Parses SQL DDL files (CREATE TABLE statements) to validate schema anchors,
 * collect observed data-layer state, and discover physical-schema/data-store artifacts.
 *
 * Design reference: docs/ea-phase2f-drift-generators-subsumption.md (SQL DDL Resolver)
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import type { BackstageEntity } from "../backstage/types.js";
import { getEntityAnchors } from "../backstage/accessors.js";
import type { EaArtifactDraft } from "../discovery.js";
import type {
  EaResolver,
  EaResolverContext,
  EaAnchorResolution,
  ObservedEaState,
  ObservedEntity,
} from "./types.js";

// ─── Parsed DDL Types ───────────────────────────────────────────────────────────

/** A parsed CREATE TABLE statement. */
export interface ParsedTable {
  /** Schema-qualified name (e.g., "public.users" or just "users"). */
  qualifiedName: string;
  /** Schema name if present. */
  schema?: string;
  /** Table name. */
  name: string;
  /** Columns with types and constraints. */
  columns: ParsedColumn[];
  /** Source file path relative to project root. */
  sourceFile: string;
}

/** A parsed column definition. */
export interface ParsedColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue?: string;
  references?: string;
}

// ─── SQL DDL Parser ─────────────────────────────────────────────────────────────

/**
 * Parse CREATE TABLE statements from SQL content.
 * Handles standard SQL DDL syntax including:
 * - Schema-qualified table names
 * - Column types, NOT NULL, PRIMARY KEY, UNIQUE, DEFAULT, REFERENCES
 * - Multi-line CREATE TABLE blocks
 */
export function parseDdl(sql: string, sourceFile: string): ParsedTable[] {
  const tables: ParsedTable[] = [];

  // Match CREATE TABLE ... (...) blocks
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`|"|')?(\w+(?:\.\w+)?)(?:`|"|')?[^(]*\(([\s\S]*?)\)\s*;/gi;

  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const fullName = match[1]!;
    const columnsBlock = match[2]!;

    const parts = fullName.split(".");
    const schema = parts.length > 1 ? parts[0] : undefined;
    const name = parts.length > 1 ? parts[1]! : parts[0]!;
    const qualifiedName = schema ? `${schema}.${name}` : name;

    const columns = parseColumns(columnsBlock);

    tables.push({ qualifiedName, schema, name, columns, sourceFile });
  }

  return tables;
}

/** Parse column definitions from the body of a CREATE TABLE statement. */
function parseColumns(block: string): ParsedColumn[] {
  const columns: ParsedColumn[] = [];

  // Split by commas that aren't inside parentheses
  const parts = splitColumnDefs(block);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip table-level constraints
    const upper = trimmed.toUpperCase();
    if (
      upper.startsWith("PRIMARY KEY") ||
      upper.startsWith("UNIQUE") ||
      upper.startsWith("FOREIGN KEY") ||
      upper.startsWith("CHECK") ||
      upper.startsWith("CONSTRAINT") ||
      upper.startsWith("INDEX")
    ) {
      continue;
    }

    const col = parseOneColumn(trimmed);
    if (col) columns.push(col);
  }

  return columns;
}

/** Split column definitions by commas, respecting parenthesized expressions. */
function splitColumnDefs(block: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of block) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) parts.push(current);
  return parts;
}

/** Parse a single column definition. */
function parseOneColumn(def: string): ParsedColumn | null {
  // Remove quotes around column name
  const cleaned = def.replace(/^[`"'](\w+)[`"']/g, "$1");
  const tokens = cleaned.split(/\s+/);
  if (tokens.length < 2) return null;

  const name = tokens[0]!.replace(/[`"']/g, "");
  // Validate it looks like a column name (not a SQL keyword)
  if (/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT|INDEX|KEY)$/i.test(name)) return null;

  const type = tokens[1]!;
  const upper = def.toUpperCase();

  return {
    name,
    type,
    nullable: !upper.includes("NOT NULL"),
    primaryKey: upper.includes("PRIMARY KEY"),
    unique: upper.includes("UNIQUE") || upper.includes("PRIMARY KEY"),
    defaultValue: extractDefault(def),
    references: extractReferences(def),
  };
}

function extractDefault(def: string): string | undefined {
  const match = def.match(/DEFAULT\s+(\S+)/i);
  return match ? match[1] : undefined;
}

function extractReferences(def: string): string | undefined {
  const match = def.match(/REFERENCES\s+(\S+)/i);
  return match ? match[1] : undefined;
}

// ─── File Discovery ─────────────────────────────────────────────────────────────

const SQL_EXTENSIONS = new Set([".sql"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".anchored-spec"]);
const SQL_DIRS = ["migrations", "db", "sql", "schema", "database", "ddl"];

/** Find SQL files in a directory, preferring common migration directories. */
export function findSqlFiles(rootDir: string, maxDepth = 5): string[] {
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
      } else if (stat.isFile() && SQL_EXTENSIONS.has(extname(entry).toLowerCase())) {
        // Quick check: does it contain CREATE TABLE?
        try {
          const content = readFileSync(full, "utf-8").slice(0, 5000);
          if (/CREATE\s+TABLE/i.test(content)) {
            results.push(full);
          }
        } catch {
          // skip
        }
      }
    }
  }

  let found = false;
  for (const dir of SQL_DIRS) {
    const candidate = join(rootDir, dir);
    if (existsSync(candidate)) {
      walk(candidate, 0);
      found = true;
    }
  }

  if (!found) {
    walk(rootDir, 0);
  }

  return results;
}

/** Load and parse all tables from a SQL file. */
export function loadSqlTables(filepath: string, projectRoot: string): ParsedTable[] {
  try {
    const content = readFileSync(filepath, "utf-8");
    const relPath = relative(projectRoot, filepath);
    return parseDdl(content, relPath);
  } catch {
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ─── SQL DDL Resolver ───────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = "sql-ddl:tables";

/**
 * SQL DDL Resolver — resolves schema anchors against CREATE TABLE statements,
 * collects observed table state, and discovers physical-schema/data-store artifacts.
 */
export class SqlDdlResolver implements EaResolver {
  readonly name = "sql-ddl";
  readonly domains: EaResolver["domains"] = ["data"];
  readonly kinds = ["physical-schema", "data-store"];

  /**
   * Resolve schema anchors against DDL definitions.
   * Anchors in the `schemas` category matching "schema.table" or "table" format.
   */
  resolveAnchors(
    entity: BackstageEntity,
    ctx: EaResolverContext,
  ): EaAnchorResolution[] | null {
    const schemaAnchors = getEntityAnchors(entity)?.schemas;
    if (!schemaAnchors || schemaAnchors.length === 0) return null;

    const tables = this.loadTables(ctx);
    if (tables.length === 0) {
      ctx.logger.warn("No SQL DDL files found", { projectRoot: ctx.projectRoot });
      return null;
    }

    const tableIndex = new Map<string, ParsedTable>();
    for (const t of tables) {
      tableIndex.set(t.qualifiedName, t);
      tableIndex.set(t.name, t);
    }

    const resolutions: EaAnchorResolution[] = [];
    const now = new Date().toISOString();

    for (const anchor of schemaAnchors) {
      const table = tableIndex.get(anchor);

      if (table) {
        resolutions.push({
          anchorKind: "schemas",
          anchorValue: anchor,
          status: "found",
          confidence: "high",
          resolvedAt: now,
          foundIn: [table.sourceFile],
          metadata: {
            columns: table.columns.length,
            columnNames: table.columns.map((c) => c.name),
            schema: table.schema,
          },
        });
      } else {
        resolutions.push({
          anchorKind: "schemas",
          anchorValue: anchor,
          status: "missing",
          confidence: "high",
          resolvedAt: now,
          message: `Table ${anchor} not found in any SQL DDL file`,
        });
      }
    }

    return resolutions;
  }

  /**
   * Collect observed state — all tables from DDL files.
   */
  collectObservedState(ctx: EaResolverContext): ObservedEaState | null {
    const tables = this.loadTables(ctx);
    if (tables.length === 0) return null;

    const entities: ObservedEntity[] = [];
    const schemas = new Set<string>();

    for (const t of tables) {
      entities.push({
        externalId: t.qualifiedName,
        inferredKind: "physical-schema",
        inferredDomain: "data",
        metadata: {
          name: t.name,
          schema: t.schema,
          columns: t.columns.length,
          columnNames: t.columns.map((c) => c.name),
          columnTypes: t.columns.map((c) => `${c.name}:${c.type}`),
          sourceFile: t.sourceFile,
          primaryKeys: t.columns.filter((c) => c.primaryKey).map((c) => c.name),
        },
      });

      if (t.schema) schemas.add(t.schema);
    }

    // Each unique schema namespace → data-store entity
    for (const schema of schemas) {
      entities.push({
        externalId: `schema:${schema}`,
        inferredKind: "data-store",
        inferredDomain: "data",
        metadata: { schema, tableCount: tables.filter((t) => t.schema === schema).length },
      });
    }

    return {
      source: "sql-ddl",
      collectedAt: new Date().toISOString(),
      entities,
      relationships: [],
    };
  }

  /**
   * Discover physical-schema and data-store artifacts from DDL files.
   */
  discoverArtifacts(ctx: EaResolverContext): EaArtifactDraft[] | null {
    const tables = this.loadTables(ctx);
    if (tables.length === 0) return null;

    const drafts: EaArtifactDraft[] = [];
    const now = new Date().toISOString();
    const seen = new Set<string>();
    const schemas = new Set<string>();

    for (const t of tables) {
      const dedupeKey = t.qualifiedName;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const slug = slugify(t.qualifiedName);
      drafts.push({
        suggestedId: `data/SCHEMA-${slug}`,
        kind: "physical-schema",
        title: t.qualifiedName,
        summary: `Table ${t.qualifiedName} with ${t.columns.length} columns (from ${t.sourceFile})`,
        status: "draft",
        confidence: "observed",
        anchors: { schemas: [t.qualifiedName] },
        discoveredBy: "sql-ddl",
        discoveredAt: now,
        kindSpecificFields: {
          columns: t.columns.map((c) => ({
            name: c.name,
            type: c.type,
            nullable: c.nullable,
            primaryKey: c.primaryKey,
          })),
          sourceFile: t.sourceFile,
        },
      });

      if (t.schema) schemas.add(t.schema);
    }

    // Each unique schema namespace → data-store draft
    for (const schema of schemas) {
      const slug = slugify(schema);
      const tableCount = tables.filter((t) => t.schema === schema).length;
      drafts.push({
        suggestedId: `data/STORE-${slug}`,
        kind: "data-store",
        title: `${schema} database schema`,
        summary: `Database schema ${schema} with ${tableCount} table(s)`,
        status: "draft",
        confidence: "observed",
        anchors: { schemas: [`${schema}.*`] },
        discoveredBy: "sql-ddl",
        discoveredAt: now,
        kindSpecificFields: { schema, tableCount },
      });
    }

    return drafts.length > 0 ? drafts : null;
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private loadTables(ctx: EaResolverContext): ParsedTable[] {
    const cacheKey = `${CACHE_KEY_PREFIX}:${ctx.source ?? "default"}`;
    const cached = ctx.cache.get<ParsedTable[]>(cacheKey);
    if (cached) {
      ctx.logger.debug("Using cached SQL tables", { count: cached.length });
      return cached;
    }

    const scanDir = ctx.source ? join(ctx.projectRoot, ctx.source) : ctx.projectRoot;
    ctx.logger.debug("Scanning for SQL DDL files", { dir: scanDir });

    const files = findSqlFiles(scanDir);
    const allTables: ParsedTable[] = [];

    for (const file of files) {
      const tables = loadSqlTables(file, ctx.projectRoot);
      allTables.push(...tables);
    }

    if (allTables.length > 0) {
      ctx.cache.set(cacheKey, allTables);
    }

    ctx.logger.info(`Found ${allTables.length} table(s)`, {
      files: files.map((f) => relative(ctx.projectRoot, f)),
    });

    return allTables;
  }
}
