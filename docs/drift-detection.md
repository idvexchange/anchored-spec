# Drift Detection

Semantic drift detection verifies that code anchors referenced in your requirements actually exist in the codebase. When an interface is renamed, a route is removed, or an error code changes — drift detection catches it.

## How It Works

```bash
anchored-spec drift
```

The drift scanner:

1. Loads all **active** requirements with `semanticRefs`
2. Discovers source files in configured `sourceRoots` (default: `src/`)
3. For each semantic ref, tries custom resolvers first, then falls back to built-in regex scanning
4. Reports `found` or `missing` for each ref

```bash
# Machine-readable output
anchored-spec drift --json

# Fail CI if any refs are missing
anchored-spec drift --fail-on-missing

# Generate a semantic link map
anchored-spec drift --generate-map

# Check if the link map is stale (CI)
anchored-spec drift --check-map

# Watch mode — re-run on spec/source changes
anchored-spec drift --watch
```

## Pluggable Resolvers

The built-in drift scanner uses regex, which works well for simple cases but can produce false positives. For AST-level accuracy or non-JavaScript ecosystems, register custom resolvers.

### Writing a Custom Resolver

```typescript
import type { DriftResolver } from "anchored-spec";

const myResolver: DriftResolver = {
  name: "my-resolver",
  kinds: ["interface", "symbol"],  // Only handle these kinds (omit for all)
  resolve(kind, ref, ctx) {
    // ctx.projectRoot — absolute path to project root
    // ctx.fileIndex — array of { path, relativePath } for source files
    //
    // Return: string[] of relative file paths where ref was found
    // Return: null to defer to the next resolver (or built-in)
    return myLookup(ref, ctx.projectRoot) ?? null;
  },
};
```

### Registering Resolvers

#### Via config (recommended)

```json
{
  "driftResolvers": [
    "anchored-spec/resolvers/typescript-ast",
    "./.anchored-spec/resolvers/my-custom.js"
  ]
}
```

Both **bare specifiers** (npm package exports like `anchored-spec/resolvers/typescript-ast`) and **relative file paths** (`./.anchored-spec/resolvers/my-custom.js`) are supported.

#### Via CLI flag

```bash
anchored-spec drift --resolver ./.anchored-spec/resolvers/my-custom.js
```

#### Via programmatic API

```typescript
import { detectDrift } from "anchored-spec";

const report = detectDrift(requirements, {
  projectRoot: "/path/to/project",
  resolvers: [myResolver],  // Tried before built-in; null = fall through
});
```

### Resolution Order

1. Custom resolvers are tried **in order** — first match wins
2. If a resolver declares `kinds: ["errorCode"]`, it's **automatically skipped** for non-matching kinds (the engine returns `null` on its behalf)
3. If a resolver returns `null`, the next resolver is tried
4. If all resolvers return `null`, the **built-in regex scanner** runs as final fallback (standard kinds only)
5. For custom semantic ref kinds (via `semanticRefs.other`), only custom resolvers are consulted — the built-in scanner ignores them

### Return Value Semantics

The return value of `resolve()` controls the resolver chain:

| Return | Meaning | Chain behavior |
|--------|---------|---------------|
| `["path/to/file.ts"]` | Found at these paths | **Stops chain** — ref reported as `found` |
| `[]` (empty array) | Definitely not found | **Stops chain** — ref reported as `missing` |
| `null` | Don't handle this ref | **Continues chain** — tries next resolver |

⚠️ **Common mistake:** Returning `[]` when you mean `null`. If your resolver doesn't handle a ref kind, return `null` to let the next resolver (or built-in scanner) try. Returning `[]` tells the engine "I looked and it's not there" — no further resolvers will be consulted.

## Built-in TypeScript AST Resolver

Anchored Spec ships a TypeScript AST drift resolver powered by [ts-morph](https://ts-morph.com/) for production-grade symbol resolution. It's added to your config automatically by `init`.

### Setup

```bash
# Init adds the resolver to config by default
anchored-spec init

# Install ts-morph (optional peer dependency)
npm install -D ts-morph

# Or init without AST resolver (regex-only)
anchored-spec init --bare
```

If `ts-morph` is not installed, the resolver is gracefully skipped with a warning — drift detection falls back to regex.

### What It Resolves

| Ref Kind | Strategy |
|----------|----------|
| `interface` / `symbol` | `getExportedDeclarations()` — handles interfaces, classes, types, functions, consts, enums, re-exports via barrel files |
| `symbol` (compound) | `ClassName.methodName` — resolves class methods and properties (e.g., `AuthService.login`) |
| `route` | Call expression analysis on `app`/`router` objects (`.get()`, `.post()`, etc.) with route path matching |
| `errorCode` | Enum members by name, string literals by value, exported const declarations |
| `schema` | Exact string literal matches and type references |

### Features

- **tsconfig.json auto-detection** — Uses your project's path aliases and compiler options
- **Lazy initialization** — The ts-morph `Project` is created once per drift run and reused
- **Export index caching** — Lookup indexes are built once for O(1) symbol resolution
- **Graceful degradation** — If ts-morph isn't installed, warns and falls back to regex
- **File index integration** — Uses the drift scanner's file discovery instead of redundant filesystem scanning

### Programmatic Usage

```typescript
import { typescriptAstResolver, resetProjectCache, detectDrift } from "anchored-spec";

const report = detectDrift(requirements, {
  projectRoot: "/path/to/project",
  resolvers: [typescriptAstResolver],
});

// Reset the cached project between runs (e.g., in tests)
resetProjectCache();
```

## Semantic Link Map

The `--generate-map` flag produces a `semantic-links.json` file that maps every semantic ref to its resolved file locations:

```bash
anchored-spec drift --generate-map
```

Use `--check-map` in CI to ensure the map stays fresh:

```bash
anchored-spec drift --check-map
```
