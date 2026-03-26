# Anchored-Spec — Round 4 Improvements

Following up on [bug-fixes.md](./bug-fixes.md) and [round-3-improvements.md](./round-3-improvements.md). All previous items confirmed fixed. This list covers issues found in the new TypeScript AST drift resolver and one remaining verify pipeline gap.

---

## AST Resolver

### AST-1: Schema resolution uses `.includes()` — causes false positives

**File:** `src/resolvers/typescript-ast.ts`, `resolveSchema()`

String literal matching for `schema` semantic refs uses `.includes(ref)` instead of exact comparison. A ref like `"User"` matches any string literal containing that substring — `"UserCreateRequest"`, `"UserService"`, `"PowerUser"`, etc.

**Fix:** Use exact match for string literal comparison:

```ts
// Before
if (literal.getLiteralText().includes(ref)) { ... }

// After
if (literal.getLiteralText() === ref) { ... }
```

If partial matching is intentional (e.g., matching `"UserSchema"` for ref `"User"`), document the behavior and add an option to toggle between exact and partial modes.

**Acceptance:** A project containing `loadSchema("UserCreateRequest")` does NOT resolve a semantic ref for `"User"`. A project containing `loadSchema("User")` does.

---

### AST-2: No export index caching — O(refs × files) per drift check

**File:** `src/resolvers/typescript-ast.ts`, `resolveExportedDeclaration()`, `resolveRoute()`, `resolveErrorCode()`, `resolveSchema()`

Every `resolve()` call iterates all source files and walks their AST. For a project with R semantic refs across F files, this is O(R × F × AST nodes). The ts-morph `Project` is cached, but the export map is rebuilt on every call.

**Fix:** Build lookup indexes once during the first `resolve()` call (or lazily per kind), then reuse them:

```ts
let exportIndex: Map<string, string[]> | null = null;

function getExportIndex(project: Project): Map<string, string[]> {
  if (exportIndex) return exportIndex;
  exportIndex = new Map();
  for (const sf of project.getSourceFiles()) {
    for (const [name] of sf.getExportedDeclarations()) {
      const paths = exportIndex.get(name) ?? [];
      paths.push(sf.getFilePath());
      exportIndex.set(name, paths);
    }
  }
  return exportIndex;
}
```

Invalidate the index when `resetProjectCache()` is called.

**Acceptance:** Drift checking a project with 100+ semantic refs completes in comparable time to checking one with 5 refs (index built once, lookups are O(1)).

---

### AST-3: No support for class method compound symbols

**File:** `src/resolvers/typescript-ast.ts`, `resolveExportedDeclaration()`

The resolver uses `getExportedDeclarations()` which returns top-level export names. It does not resolve compound `ClassName.methodName` symbols (e.g., `AuthService.login`). Projects that reference class methods as semantic refs will get false drift warnings.

**Fix:** When the ref contains a `.`, split into class name and member name, then resolve both:

```ts
if (ref.includes(".")) {
  const [className, memberName] = ref.split(".", 2);
  for (const sf of project.getSourceFiles()) {
    const decls = sf.getExportedDeclarations().get(className);
    if (decls?.some(d => d.isKind(SyntaxKind.ClassDeclaration) &&
        d.getMethod(memberName))) {
      found.push(sf.getFilePath());
    }
  }
}
```

**Acceptance:** A semantic ref `"AuthService.login"` resolves to the file containing `export class AuthService { login() {} }`.

---

## Verify Pipeline

### VERIFY-1: No CLI-level integration test for evidence validation in verify

**File:** `src/cli/__tests__/commands.test.ts`

Evidence validation was added as step 10 in the verify pipeline, but `commands.test.ts` has zero references to "evidence". There is no test proving `anchored-spec verify` actually invokes evidence validation end-to-end when an `evidence.json` file exists.

**Fix:** Add a CLI integration test that:

1. Initializes a spec project with a requirement that has `executionPolicy.requiresEvidence: true`
2. Places a valid `evidence.json` in the generated directory
3. Runs `anchored-spec verify`
4. Asserts the output includes evidence validation results (pass or fail)

**Acceptance:** `commands.test.ts` includes a test exercising the verify → evidence validation path.
