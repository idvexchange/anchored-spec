/**
 * Anchored Spec — TypeScript AST Drift Resolver
 *
 * Uses ts-morph for AST-level accurate resolution of semantic refs.
 * Handles exported declarations, re-exports, barrel files, enum members,
 * route handler calls, and string literal matching.
 *
 * ts-morph is an optional peer dependency. If not installed, this resolver
 * throws a helpful error on first use.
 */

// ─── Types (inlined after src/core removal) ─────────────────────────────────

/** Kind of semantic reference being resolved. */
type SemanticRefKind = "interface" | "route" | "errorCode" | "symbol" | "schema" | (string & {});

/** Context passed to a drift resolver's `resolve()` method. */
interface DriftResolveContext {
  projectRoot: string;
  fileIndex?: ReadonlyArray<{ path: string; relativePath: string }>;
}

/** A pluggable drift resolver that maps semantic refs to source files. */
interface DriftResolver {
  name: string;
  kinds?: SemanticRefKind[];
  resolve(kind: SemanticRefKind, ref: string, ctx: DriftResolveContext): string[] | null;
}
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

// Lazy-loaded ts-morph types
type Project = import("ts-morph").Project;

// HTTP methods used in route detection
const HTTP_METHODS = new Set([
  "get", "post", "put", "patch", "delete", "head", "options", "all",
]);

// Common router variable names
const ROUTER_NAMES = new Set([
  "app", "router", "server", "api", "route", "routes",
]);

let tsMorphModule: typeof import("ts-morph") | null = null;
let cachedProject: Project | null = null;
let cachedProjectRoot: string | null = null;

// Cached lookup indexes — built once per project, invalidated with resetProjectCache()
let exportIndex: Map<string, string[]> | null = null;
let classMethodIndex: Map<string, string[]> | null = null;

function loadTsMorph(): typeof import("ts-morph") {
  if (tsMorphModule) return tsMorphModule;
  try {
    const esmRequire = createRequire(import.meta.url);
    tsMorphModule = esmRequire("ts-morph");
    return tsMorphModule!;
  } catch {
    throw new Error(
      "ts-morph is required for the TypeScript AST drift resolver. " +
      "Install it: npm install -D ts-morph",
    );
  }
}

function getProject(ctx: DriftResolveContext): Project {
  const projectRoot = ctx.projectRoot;

  // Reuse project if same root
  if (cachedProject && cachedProjectRoot === projectRoot) {
    return cachedProject;
  }

  const { Project } = loadTsMorph();

  const tsconfigPath = join(projectRoot, "tsconfig.json");
  const hasTsconfig = existsSync(tsconfigPath);

  cachedProject = new Project({
    ...(hasTsconfig ? { tsConfigFilePath: tsconfigPath } : {}),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: hasTsconfig ? undefined : {
      allowJs: true,
      target: 99, // ESNext
      module: 99, // ESNext
    },
  });

  // Add source files from the file index
  if (ctx.fileIndex) {
    for (const entry of ctx.fileIndex) {
      if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry.path) && !/\.d\.(ts|cts|mts)$/.test(entry.path)) {
        try {
          cachedProject.addSourceFileAtPath(entry.path);
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
  }

  cachedProjectRoot = projectRoot;
  return cachedProject;
}

// ─── Lookup indexes ─────────────────────────────────────────────────────────────

function getExportIndex(project: Project, ctx: DriftResolveContext): Map<string, string[]> {
  if (exportIndex) return exportIndex;
  exportIndex = new Map();
  for (const sf of project.getSourceFiles()) {
    const relPath = relative(ctx.projectRoot, sf.getFilePath());
    for (const [name] of sf.getExportedDeclarations()) {
      const paths = exportIndex.get(name) ?? [];
      paths.push(relPath);
      exportIndex.set(name, paths);
    }
  }
  return exportIndex;
}

function getClassMethodIndex(project: Project, ctx: DriftResolveContext): Map<string, string[]> {
  if (classMethodIndex) return classMethodIndex;
  const { SyntaxKind } = loadTsMorph();
  classMethodIndex = new Map();
  for (const sf of project.getSourceFiles()) {
    const relPath = relative(ctx.projectRoot, sf.getFilePath());
    for (const [name, decls] of sf.getExportedDeclarations()) {
      for (const decl of decls) {
        if (decl.isKind(SyntaxKind.ClassDeclaration)) {
          for (const method of decl.getMethods()) {
            const key = `${name}.${method.getName()}`;
            const paths = classMethodIndex.get(key) ?? [];
            paths.push(relPath);
            classMethodIndex.set(key, paths);
          }
          for (const prop of decl.getProperties()) {
            const key = `${name}.${prop.getName()}`;
            const paths = classMethodIndex.get(key) ?? [];
            paths.push(relPath);
            classMethodIndex.set(key, paths);
          }
        }
      }
    }
  }
  return classMethodIndex;
}

// ─── Per-kind resolution ────────────────────────────────────────────────────────

function resolveExportedDeclaration(
  ref: string,
  project: Project,
  ctx: DriftResolveContext,
): string[] | null {
  // AST-3: Support compound Class.method symbols
  if (ref.includes(".")) {
    const idx = getClassMethodIndex(project, ctx);
    const files = idx.get(ref);
    return files && files.length > 0 ? [...files] : null;
  }

  // Use cached export index for O(1) lookups
  const idx = getExportIndex(project, ctx);
  const files = idx.get(ref);
  return files && files.length > 0 ? [...files] : null;
}

function resolveRoute(
  ref: string,
  project: Project,
  ctx: DriftResolveContext,
): string[] | null {
  const { SyntaxKind } = loadTsMorph();

  // Extract path from route ref (strip HTTP method prefix if present)
  const routeMatch = ref.match(/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+(.+)$/i);
  const routePath = routeMatch?.[1]?.trim() ?? ref;

  const foundFiles: string[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
      const expr = call.getExpression();

      // Match patterns: app.get("/path"), router.post("/path")
      if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
        if (!propAccess) continue;

        const methodName = propAccess.getName().toLowerCase();
        if (!HTTP_METHODS.has(methodName)) continue;

        // Check if the object is a known router name
        const objExpr = propAccess.getExpression();
        const objText = objExpr.getText();
        const isRouter = ROUTER_NAMES.has(objText) ||
          objText.endsWith("Router") ||
          objText.endsWith("router") ||
          objText.endsWith("app");

        if (!isRouter) continue;

        // Check first argument for route path
        const args = call.getArguments();
        const firstArg = args[0];
        if (firstArg && firstArg.getKind() === SyntaxKind.StringLiteral) {
          const literal = firstArg.asKind(SyntaxKind.StringLiteral);
          if (literal && literal.getLiteralValue() === routePath) {
            foundFiles.push(relative(ctx.projectRoot, sourceFile.getFilePath()));
            break;
          }
        }
      }
    }
  }

  // Fallback: search for the path string in file content
  if (foundFiles.length === 0) {
    for (const sourceFile of project.getSourceFiles()) {
      if (sourceFile.getFullText().includes(routePath)) {
        foundFiles.push(relative(ctx.projectRoot, sourceFile.getFilePath()));
      }
    }
  }

  return foundFiles.length > 0 ? foundFiles : null;
}

function resolveErrorCode(
  ref: string,
  project: Project,
  ctx: DriftResolveContext,
): string[] | null {
  const { SyntaxKind } = loadTsMorph();
  const foundFiles: string[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    let found = false;

    // Check enum members by name
    for (const enumDecl of sourceFile.getEnums()) {
      for (const member of enumDecl.getMembers()) {
        if (member.getName() === ref) {
          found = true;
          break;
        }
        // Also check initializer value
        const init = member.getInitializer();
        if (init?.getKind() === SyntaxKind.StringLiteral) {
          const literal = init.asKind(SyntaxKind.StringLiteral);
          if (literal?.getLiteralValue() === ref) {
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }

    // Check string literals
    if (!found) {
      const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
      for (const lit of stringLiterals) {
        if (lit.getLiteralValue() === ref) {
          found = true;
          break;
        }
      }
    }

    // Check const variable declarations (const ERR_FOO = "ERR_FOO")
    if (!found) {
      for (const varStmt of sourceFile.getVariableStatements()) {
        if (!varStmt.isExported()) continue;
        for (const decl of varStmt.getDeclarations()) {
          if (decl.getName() === ref) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    if (found) {
      foundFiles.push(relative(ctx.projectRoot, sourceFile.getFilePath()));
    }
  }

  return foundFiles.length > 0 ? foundFiles : null;
}

function resolveSchema(
  ref: string,
  project: Project,
  ctx: DriftResolveContext,
): string[] | null {
  const { SyntaxKind } = loadTsMorph();
  const foundFiles: string[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    let found = false;

    // Check string literals matching the schema name exactly
    const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
    for (const lit of stringLiterals) {
      if (lit.getLiteralValue() === ref) {
        found = true;
        break;
      }
    }

    // Check type references and import specifiers
    if (!found) {
      const typeRefs = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference);
      for (const typeRef of typeRefs) {
        if (typeRef.getText() === ref) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      foundFiles.push(relative(ctx.projectRoot, sourceFile.getFilePath()));
    }
  }

  return foundFiles.length > 0 ? foundFiles : null;
}

// ─── Resolver ──────────────────────────────────────────────────────────────────

/**
 * TypeScript AST drift resolver using ts-morph.
 *
 * Provides accurate symbol resolution for TypeScript codebases:
 * - Interfaces, classes, types, functions, consts via exported declarations
 * - Routes via Express/Fastify/Hono call expression analysis
 * - Error codes via enum members, string literals, const declarations
 * - Schema refs via string literals and type references
 */
const typescriptAstResolver: DriftResolver = {
  name: "typescript-ast",

  resolve(kind: SemanticRefKind, ref: string, ctx: DriftResolveContext): string[] | null {
    const project = getProject(ctx);

    switch (kind) {
      case "interface":
      case "symbol":
        return resolveExportedDeclaration(ref, project, ctx);
      case "route":
        return resolveRoute(ref, project, ctx);
      case "errorCode":
        return resolveErrorCode(ref, project, ctx);
      case "schema":
        return resolveSchema(ref, project, ctx);
      default:
        return null;
    }
  },
};

export default typescriptAstResolver;

/** Reset the cached project and lookup indexes (useful for testing). */
export function resetProjectCache(): void {
  cachedProject = null;
  cachedProjectRoot = null;
  exportIndex = null;
  classMethodIndex = null;
}
