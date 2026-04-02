import { describe, it, expect, beforeEach } from "vitest";
import { join } from "node:path";
import type { BackstageEntity } from "../backstage/types.js";import type { EaResolverContext } from "../resolvers/types.js";
import { silentLogger } from "../resolvers/types.js";
import {
  SqlDdlResolver,
  parseDdl,
  findSqlFiles,
  loadSqlTables,
} from "../resolvers/sql-ddl.js";
import { NoOpCache } from "../cache.js";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SQL_FILE = join(FIXTURES_DIR, "sql", "migrations.sql");

function makeCtx(overrides?: Partial<EaResolverContext>): EaResolverContext {
  return {
    projectRoot: FIXTURES_DIR,
    entities: [],
    cache: new NoOpCache(),
    logger: silentLogger,
    source: "sql",
    ...overrides,
  };
}

function makeEntity(specOverrides: Record<string, unknown> = {}): BackstageEntity {
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name: "schema-users",
      annotations: { "anchored-spec.dev/confidence": "declared" },
    },
    spec: {
      type: "physical-schema",
      owner: "team-data",
      lifecycle: "production",
      ...specOverrides,
    },
  };
}

// ─── parseDdl ───────────────────────────────────────────────────────────────────

describe("parseDdl", () => {
  it("should parse CREATE TABLE statements", () => {
    const sql = `CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL);`;
    const tables = parseDdl(sql, "test.sql");
    expect(tables.length).toBe(1);
    expect(tables[0]!.name).toBe("users");
    expect(tables[0]!.columns.length).toBe(2);
  });

  it("should parse schema-qualified names", () => {
    const sql = `CREATE TABLE public.users (id INT PRIMARY KEY);`;
    const tables = parseDdl(sql, "test.sql");
    expect(tables[0]!.qualifiedName).toBe("public.users");
    expect(tables[0]!.schema).toBe("public");
    expect(tables[0]!.name).toBe("users");
  });

  it("should parse column constraints", () => {
    const sql = `CREATE TABLE t (
      id UUID PRIMARY KEY NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100),
      ref_id INT REFERENCES other(id),
      count INT DEFAULT 0
    );`;
    const tables = parseDdl(sql, "test.sql");
    const cols = tables[0]!.columns;

    expect(cols[0]!.primaryKey).toBe(true);
    expect(cols[0]!.nullable).toBe(false);
    expect(cols[1]!.unique).toBe(true);
    expect(cols[1]!.nullable).toBe(false);
    expect(cols[2]!.nullable).toBe(true);
    expect(cols[3]!.references).toBe("other(id)");
    expect(cols[4]!.defaultValue).toBe("0");
  });

  it("should parse multiple tables", () => {
    const sql = `
      CREATE TABLE a (id INT PRIMARY KEY);
      CREATE TABLE b (id INT PRIMARY KEY);
      CREATE TABLE c (id INT PRIMARY KEY);
    `;
    expect(parseDdl(sql, "test.sql").length).toBe(3);
  });

  it("should handle IF NOT EXISTS", () => {
    const sql = `CREATE TABLE IF NOT EXISTS t (id INT PRIMARY KEY);`;
    const tables = parseDdl(sql, "test.sql");
    expect(tables[0]!.name).toBe("t");
  });

  it("should skip table-level constraints", () => {
    const sql = `CREATE TABLE t (
      a INT,
      b INT,
      PRIMARY KEY (a, b),
      UNIQUE (a),
      FOREIGN KEY (b) REFERENCES other(id)
    );`;
    const tables = parseDdl(sql, "test.sql");
    expect(tables[0]!.columns.length).toBe(2);
  });
});

// ─── findSqlFiles ───────────────────────────────────────────────────────────────

describe("findSqlFiles", () => {
  it("should find SQL files with CREATE TABLE", () => {
    const files = findSqlFiles(FIXTURES_DIR);
    expect(files.length).toBe(1);
    expect(files[0]!.endsWith("migrations.sql")).toBe(true);
  });

  it("should return empty for non-existent directory", () => {
    expect(findSqlFiles("/does/not/exist")).toEqual([]);
  });
});

// ─── loadSqlTables ──────────────────────────────────────────────────────────────

describe("loadSqlTables", () => {
  it("should load tables from SQL file", () => {
    const tables = loadSqlTables(SQL_FILE, FIXTURES_DIR);
    expect(tables.length).toBe(4); // users, orders, products, order_items
  });

  it("should parse all table names", () => {
    const tables = loadSqlTables(SQL_FILE, FIXTURES_DIR);
    const names = tables.map((t) => t.qualifiedName);
    expect(names).toContain("public.users");
    expect(names).toContain("public.orders");
    expect(names).toContain("inventory.products");
    expect(names).toContain("public.order_items");
  });

  it("should parse column details", () => {
    const tables = loadSqlTables(SQL_FILE, FIXTURES_DIR);
    const users = tables.find((t) => t.name === "users")!;
    expect(users.columns.length).toBe(6);
    const email = users.columns.find((c) => c.name === "email")!;
    expect(email.type).toBe("VARCHAR(255)");
    expect(email.nullable).toBe(false);
    expect(email.unique).toBe(true);
  });
});

// ─── SqlDdlResolver.resolveAnchors ──────────────────────────────────────────────

describe("SqlDdlResolver.resolveAnchors", () => {
  let resolver: SqlDdlResolver;

  beforeEach(() => {
    resolver = new SqlDdlResolver();
  });

  it("should return null when no schema anchors", () => {
    const entity = makeEntity({ anchors: {} });
    expect(resolver.resolveAnchors(entity, makeCtx())).toBeNull();
  });

  it("should resolve found tables", () => {
    const entity = makeEntity({ anchors: { schemas: ["public.users"] } });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("found");
    expect(result[0]!.metadata?.columns).toBe(6);
  });

  it("should resolve by table name only", () => {
    const entity = makeEntity({ anchors: { schemas: ["users"] } });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result[0]!.status).toBe("found");
  });

  it("should resolve missing tables", () => {
    const entity = makeEntity({ anchors: { schemas: ["nonexistent"] } });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result[0]!.status).toBe("missing");
  });

  it("should resolve mixed found and missing", () => {
    const entity = makeEntity({
      anchors: { schemas: ["public.users", "nonexistent"] },
    });
    const result = resolver.resolveAnchors(entity, makeCtx())!;
    expect(result.length).toBe(2);
    expect(result[0]!.status).toBe("found");
    expect(result[1]!.status).toBe("missing");
  });
});

// ─── SqlDdlResolver.collectObservedState ────────────────────────────────────────

describe("SqlDdlResolver.collectObservedState", () => {
  let resolver: SqlDdlResolver;

  beforeEach(() => {
    resolver = new SqlDdlResolver();
  });

  it("should collect table state", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    expect(state).not.toBeNull();
    expect(state.source).toBe("sql-ddl");
    // 4 tables + 2 schemas (public, inventory)
    expect(state.entities.length).toBe(6);
  });

  it("should include physical-schema and data-store entities", () => {
    const state = resolver.collectObservedState(makeCtx())!;
    const schemas = state.entities.filter((e) => e.inferredSchema === "physical-schema");
    const stores = state.entities.filter((e) => e.inferredSchema === "data-store");
    expect(schemas.length).toBe(4);
    expect(stores.length).toBe(2);
  });

  it("should return null when no SQL found", () => {
    const ctx = makeCtx({ projectRoot: "/does/not/exist" });
    expect(resolver.collectObservedState(ctx)).toBeNull();
  });
});

// ─── SqlDdlResolver.discoverEntities ───────────────────────────────────────────

describe("SqlDdlResolver.discoverEntities", () => {
  let resolver: SqlDdlResolver;

  beforeEach(() => {
    resolver = new SqlDdlResolver();
  });

  it("should discover physical-schema and data-store drafts", () => {
    const drafts = resolver.discoverEntities(makeCtx())!;
    expect(drafts).not.toBeNull();
    const schemas = drafts.filter((d) => d.schema === "physical-schema");
    const stores = drafts.filter((d) => d.schema === "data-store");
    expect(schemas.length).toBe(4);
    expect(stores.length).toBe(2);
  });

  it("should create correct draft structure", () => {
    const drafts = resolver.discoverEntities(makeCtx())!;
    for (const draft of drafts) {
      expect(draft.status).toBe("draft");
      expect(draft.confidence).toBe("observed");
      expect(draft.discoveredBy).toBe("sql-ddl");
    }
  });

  it("should include column details in schemaFields", () => {
    const drafts = resolver.discoverEntities(makeCtx())!;
    const users = drafts.find((d) => d.title === "public.users");
    expect(users?.schemaFields?.columns).toBeDefined();
  });
});

// ─── Resolver Metadata ──────────────────────────────────────────────────────────

describe("SqlDdlResolver metadata", () => {
  it("should have correct name", () => {
    expect(new SqlDdlResolver().name).toBe("sql-ddl");
  });

  it("should target data domain", () => {
    expect(new SqlDdlResolver().domains).toEqual(["data"]);
  });

  it("should handle physical-schema and data-store schemas", () => {
    expect(new SqlDdlResolver().schemas).toContain("physical-schema");
    expect(new SqlDdlResolver().schemas).toContain("data-store");
  });
});
