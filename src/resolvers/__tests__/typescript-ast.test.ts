import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import typescriptAstResolver, { resetProjectCache } from "../../resolvers/typescript-ast.js";

// DriftResolveContext shape (inlined after core removal)
interface DriftResolveContext {
  projectRoot: string;
  fileIndex?: ReadonlyArray<{ path: string; relativePath: string }>;
}

const TMP = join(import.meta.dirname ?? __dirname, "__tmp_ast_resolver__");

beforeEach(() => {
  mkdirSync(join(TMP, "src"), { recursive: true });
  resetProjectCache();
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  resetProjectCache();
});

function makeCtx(files?: Array<{ path: string; relativePath: string }>): DriftResolveContext {
  return {
    projectRoot: TMP,
    fileIndex: files ?? [],
  };
}

describe("TypeScript AST Drift Resolver", () => {
  it("resolves exported interface by name", () => {
    const filePath = join(TMP, "src/user.ts");
    writeFileSync(filePath, `
      export interface UserService {
        getUser(id: string): Promise<unknown>;
      }
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/user.ts" }]);
    const result = typescriptAstResolver.resolve("interface", "UserService", ctx);

    expect(result).not.toBeNull();
    expect(result).toContain("src/user.ts");
  });

  it("resolves exported function symbol", () => {
    const filePath = join(TMP, "src/calc.ts");
    writeFileSync(filePath, `
      export function calculateTotal(items: number[]): number {
        return items.reduce((a, b) => a + b, 0);
      }
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/calc.ts" }]);
    const result = typescriptAstResolver.resolve("symbol", "calculateTotal", ctx);

    expect(result).not.toBeNull();
    expect(result).toContain("src/calc.ts");
  });

  it("resolves exported const symbol", () => {
    const filePath = join(TMP, "src/config.ts");
    writeFileSync(filePath, `export const MAX_RETRIES = 3;`);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/config.ts" }]);
    const result = typescriptAstResolver.resolve("symbol", "MAX_RETRIES", ctx);

    expect(result).not.toBeNull();
    expect(result).toContain("src/config.ts");
  });

  it("resolves re-exported symbol via barrel file", () => {
    const implFile = join(TMP, "src/impl.ts");
    const barrelFile = join(TMP, "src/index.ts");
    writeFileSync(implFile, `export class AuthService {}`);
    writeFileSync(barrelFile, `export { AuthService } from './impl';`);

    const ctx = makeCtx([
      { path: implFile, relativePath: "src/impl.ts" },
      { path: barrelFile, relativePath: "src/index.ts" },
    ]);
    const result = typescriptAstResolver.resolve("interface", "AuthService", ctx);

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(1);
    expect(result!.some((f) => f.includes("impl.ts"))).toBe(true);
  });

  it("resolves Express-style route handler", () => {
    const filePath = join(TMP, "src/routes.ts");
    writeFileSync(filePath, `
      const app = { get: Function.prototype, post: Function.prototype };
      app.get("/api/v1/users", () => {});
      app.post("/api/v1/users", () => {});
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/routes.ts" }]);

    const getResult = typescriptAstResolver.resolve("route", "GET /api/v1/users", ctx);
    expect(getResult).not.toBeNull();
    expect(getResult).toContain("src/routes.ts");

    resetProjectCache();
    const postResult = typescriptAstResolver.resolve("route", "POST /api/v1/users", ctx);
    expect(postResult).not.toBeNull();
    expect(postResult).toContain("src/routes.ts");
  });

  it("resolves error code from enum member", () => {
    const filePath = join(TMP, "src/errors.ts");
    writeFileSync(filePath, `
      export enum ErrorCode {
        AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN",
        USER_NOT_FOUND = "USER_NOT_FOUND",
      }
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/errors.ts" }]);
    const result = typescriptAstResolver.resolve("errorCode", "AUTH_INVALID_TOKEN", ctx);

    expect(result).not.toBeNull();
    expect(result).toContain("src/errors.ts");
  });

  it("resolves error code from string literal", () => {
    const filePath = join(TMP, "src/handler.ts");
    writeFileSync(filePath, `
      function handleError(err: Error) {
        if (err.message === "RATE_LIMIT_EXCEEDED") {
          return { status: 429 };
        }
      }
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/handler.ts" }]);
    const result = typescriptAstResolver.resolve("errorCode", "RATE_LIMIT_EXCEEDED", ctx);

    expect(result).not.toBeNull();
    expect(result).toContain("src/handler.ts");
  });

  it("resolves schema reference from string literal", () => {
    const filePath = join(TMP, "src/schema.ts");
    writeFileSync(filePath, `const schema = loadSchema("UserCreateRequest");`);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/schema.ts" }]);
    const result = typescriptAstResolver.resolve("schema", "UserCreateRequest", ctx);

    expect(result).not.toBeNull();
    expect(result).toContain("src/schema.ts");
  });

  it("does not false-positive on partial schema name matches", () => {
    const filePath = join(TMP, "src/schema.ts");
    writeFileSync(filePath, `const schema = loadSchema("UserCreateRequest");`);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/schema.ts" }]);
    const result = typescriptAstResolver.resolve("schema", "User", ctx);

    expect(result).toBeNull();
  });

  it("resolves compound Class.method symbols", () => {
    const filePath = join(TMP, "src/auth.ts");
    writeFileSync(filePath, `
      export class AuthService {
        login(email: string) { return true; }
        logout() {}
      }
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/auth.ts" }]);

    const loginResult = typescriptAstResolver.resolve("symbol", "AuthService.login", ctx);
    expect(loginResult).not.toBeNull();
    expect(loginResult).toContain("src/auth.ts");

    resetProjectCache();
    const logoutResult = typescriptAstResolver.resolve("symbol", "AuthService.logout", ctx);
    expect(logoutResult).not.toBeNull();

    resetProjectCache();
    const missingResult = typescriptAstResolver.resolve("symbol", "AuthService.nonExistent", ctx);
    expect(missingResult).toBeNull();
  });

  it("returns null for missing symbol", () => {
    const filePath = join(TMP, "src/empty.ts");
    writeFileSync(filePath, `export const unrelated = true;`);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/empty.ts" }]);
    const result = typescriptAstResolver.resolve("interface", "NonExistentInterface", ctx);

    expect(result).toBeNull();
  });

  it("resolves multiple refs from a single file end-to-end", () => {
    const filePath = join(TMP, "src/service.ts");
    writeFileSync(filePath, `
      export interface PaymentService {
        charge(amount: number): Promise<void>;
      }
      export function processPayment() {}
    `);

    const ctx = makeCtx([{ path: filePath, relativePath: "src/service.ts" }]);

    // Found refs
    expect(typescriptAstResolver.resolve("interface", "PaymentService", ctx)).toContain("src/service.ts");
    expect(typescriptAstResolver.resolve("symbol", "processPayment", ctx)).toContain("src/service.ts");

    // Missing ref — resolver returns null (defer) for symbols not found in any file
    expect(typescriptAstResolver.resolve("symbol", "missingFunction", ctx)).toBeNull();
  });
});
