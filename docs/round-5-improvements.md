# Improvement Suggestions — Round 5

Detailed improvement proposals from real-world adoption in a production monorepo (14 apps/packages, 51 requirements, 19 changes, 22 decisions, ~3,000 LOC custom SDD tooling replaced). Organized by adoption impact.

---

## Critical — Blocks strict-mode adoption

### 1. `verify --json` output

**Problem:** Every major command (`status`, `drift`, `check`, `report`, `impact`) supports `--json` for machine-readable output. `verify` is the single most important command for CI pipelines, yet it only produces `chalk`-formatted console text.

**Impact:** CI systems that parse structured output (GitHub Actions annotations, SARIF viewers, custom dashboards) cannot consume verify results. Projects must parse colored terminal output or treat verify as a black-box pass/fail gate, losing all granularity.

**Proposed interface:**

```bash
anchored-spec verify --json
```

```json
{
  "summary": {
    "totalChecks": 98,
    "passed": 94,
    "warnings": 17,
    "errors": 1,
    "artifacts": { "requirements": 51, "changes": 19, "decisions": 22 }
  },
  "findings": [
    {
      "path": "REQ-1",
      "rule": "lifecycle:active-requires-change",
      "severity": "error",
      "message": "Active requirement has no active change record",
      "suggestion": "Run 'anchored-spec create change' and link it to REQ-1"
    }
  ]
}
```

**Bonus:** SARIF output (`--format sarif`) would enable direct GitHub code scanning integration.

**Acceptance criteria:**
- `anchored-spec verify --json` produces valid JSON to stdout with the structure above
- Non-JSON diagnostic output (progress, chalk) goes to stderr only when `--json` is active
- Exit code behavior is unchanged (0 = pass, 1 = fail)

---

### 2. Rule severity configuration

**Problem:** All rule severities are hardcoded in source. `lifecycle:active-requires-change` is always `"error"`, `quality:no-vague-language` is always `"warning"`. There is no way to promote, demote, or disable individual rules per project.

**Impact:** Projects adopting anchored-spec incrementally cannot suppress pre-existing violations during migration. The only escape hatch is wrapping `verify` in `|| true` at the shell level, which loses all granularity — a single unrelated error silently passes. This is the #1 reason adopters run verify in advisory mode.

**Proposed config:**

```json
{
  "quality": {
    "rules": {
      "lifecycle:active-requires-change": "warn",
      "quality:no-vague-language": "off",
      "quality:semantic-refs-populated": "error",
      "quality:test-linking": "warn"
    }
  }
}
```

Severity values: `"error"` (default per rule), `"warn"`, `"off"`.

**Behavior:**
- Rules set to `"off"` are skipped entirely (not computed, not reported)
- Rules set to `"warn"` produce findings with `severity: "warning"` regardless of the hardcoded default
- Rules set to `"error"` produce findings with `severity: "error"` regardless of the hardcoded default
- `--strict` still promotes all warnings to errors (applied after config overrides)
- Unconfigured rules use their built-in default severity

**Acceptance criteria:**
- Config `quality.rules` object is read and applied to all findings before output
- `verify --json` (proposal #1) reflects the overridden severity, not the hardcoded one
- Unknown rule IDs in config produce a startup warning (not a hard error — forward compatibility)

---

### 3. File exclusion patterns per artifact directory

**Problem:** The loader auto-discovers all `.json` files in `requirementsDir`, `changesDir`, and `decisionsDir`. There is no exclusion mechanism. Projects that maintain their own index files, generated manifests, or metadata files in spec directories must rename them with a dot-prefix or `.bak` extension to prevent validation failures.

**Impact:** Renaming files breaks other tooling that expects them. It's a destructive workaround that forces a choice between anchored-spec and existing infrastructure.

**Proposed config:**

```json
{
  "exclude": ["**/index.json", "**/_*.json", "**/.*"]
}
```

A single top-level `exclude` glob array applied to all artifact directory scans. Follows `.gitignore`-style glob syntax.

**Alternatives considered:**
- Per-directory excludes (`requirementsExclude`, `changesExclude`) — more granular but verbose
- File naming convention (e.g., only load `REQ-*.json`, `CHG-*/change.json`) — too restrictive for new projects

**Acceptance criteria:**
- Files matching any `exclude` glob are skipped during artifact loading
- Excluded files do not appear in `status`, `verify`, or `generate` output
- Default excludes: `["**/.*"]` (dot-files are always excluded)
- The `exclude` config is documented in the configuration guide

---

### 4. Allow `alternatives: []` on decisions (minItems: 0)

**Problem:** `decision.schema.json` enforces `"minItems": 1` on the `alternatives` array. Decisions in early drafting stages often have no alternatives documented yet — the decision itself may be the exploration of whether alternatives exist.

**Impact:** Projects migrating existing ADRs must fabricate dummy alternative entries (e.g., `{ "name": "Status quo", "verdict": "rejected", "reason": "Placeholder for migration" }`) to pass validation. This pollutes decision records with non-real data.

**Fix:** Change `decision.schema.json`:

```diff
 "alternatives": {
   "type": "array",
-  "minItems": 1,
+  "minItems": 0,
   "items": { ... }
 }
```

**Acceptance criteria:**
- `alternatives: []` is valid on decisions in any status
- Quality checks may still warn about empty alternatives on non-draft decisions (as a `quality:` rule, not a schema error)
- Existing decisions with alternatives remain valid

---

## High — Significantly improves adoption experience

### 5. Add `label` to `traceRefs` items and `notes` to `testRefs` items

**Problem:** `traceRefs` items only have `source` and `target` (or `path`). There's no place for a human-readable label explaining what the trace link means. Similarly, `testRefs` items have `path` and `kind` but no `notes` field for coverage status explanations.

**Impact:** Projects that annotate their trace and test references must maintain a parallel map in `extensions` keyed by path — e.g., `extensions.traceRefLabels: { "docs/api.md#section": "Documents the REST contract" }`. This is fragile (keys must stay in sync with refs), lossy (two refs with the same path collide), and unergonomic.

**Proposed schema change:**

```json
{
  "traceRefs": [{
    "source": "docs/specs/api-contracts.md",
    "target": "REQ-1",
    "label": "Documents the REST contract for verification endpoints"
  }],
  "testRefs": [{
    "path": "apps/api/src/__tests__/auth.test.ts",
    "kind": "integration",
    "required": true,
    "notes": "Covers bearer token validation flow"
  }]
}
```

Both fields are optional strings, no validation beyond type.

**Acceptance criteria:**
- `label` is accepted on `traceRefs` items without validation error
- `notes` is accepted on `testRefs` items without validation error
- Both appear in generated markdown output when present
- Existing specs without these fields remain valid

---

### 6. Allow `supersedes` as `string | string[] | null`

**Problem:** The `supersedes` field on requirements only accepts `string | null`. Requirements that supersede multiple predecessors (common when consolidating overlapping requirements) must pick one and lose the others.

**Impact:** Migration from systems that track multi-predecessor relationships is lossy. The extra predecessors must be shoved into `extensions` or comments.

**Proposed schema change:**

```diff
 "supersedes": {
-  "type": ["string", "null"]
+  "oneOf": [
+    { "type": "string" },
+    { "type": "array", "items": { "type": "string" }, "minItems": 1 },
+    { "type": "null" }
+  ]
 }
```

**Acceptance criteria:**
- `supersedes: "REQ-5"` remains valid (string)
- `supersedes: ["REQ-5", "REQ-6"]` is now valid (array)
- `supersedes: null` remains valid (null)
- Cross-reference checks validate all entries in the array
- Generated markdown lists all superseded requirements

---

### 7. Extensible change type enum

**Problem:** The change type enum is fixed to `feature | fix | refactor | chore`. Common change types in real projects — `infrastructure`, `schema`, `docs`, `security`, `performance`, `deprecation` — must be force-mapped to one of the four, losing semantic precision.

**Impact:** Projects must preserve the original type in `extensions.originalType` and accept that all queries/filters/reports will group these changes incorrectly. A schema migration (`schema`) is semantically distinct from a feature, but gets bucketed as one.

**Proposed solution — config-level custom types:**

```json
{
  "customChangeTypes": ["infrastructure", "schema", "docs", "security", "performance"]
}
```

**Schema change:**

```diff
 "type": {
-  "enum": ["feature", "fix", "refactor", "chore"]
+  "type": "string",
+  "pattern": "^[a-z][a-z0-9-]*$"
 }
```

With the built-in types (`feature`, `fix`, `refactor`, `chore`) remaining as defaults that the CLI suggests.

**Acceptance criteria:**
- `customChangeTypes` in config extends the set of accepted types
- Built-in types are always accepted regardless of config
- `anchored-spec create change --type infrastructure` works when configured
- Workflow policy `defaultTypes` accepts custom types
- `status` and `report` commands group by actual types

---

### 8. Extensible semantic ref kinds

**Problem:** `SemanticRefKind` is a closed union type: `"interface" | "route" | "errorCode" | "symbol" | "schema"`. The `semanticRefs` object has exactly 5 fixed properties with `additionalProperties: false`. Projects with domain-specific reference types (GraphQL queries, event names, config keys, feature flags, markdown sections) cannot express them.

**Impact:** Custom ref types must be tracked outside the drift system entirely, losing the automated resolution and staleness detection that makes drift detection valuable.

**Proposed solution:**

Add an `other` map to `semanticRefs`:

```json
{
  "semanticRefs": {
    "interfaces": ["IFoo"],
    "symbols": ["Bar.baz"],
    "other": {
      "graphqlQuery": ["GetUser", "ListOrders"],
      "eventName": ["user.created", "order.completed"],
      "featureFlag": ["ENABLE_V2_CHECKOUT"]
    }
  }
}
```

Schema:

```json
{
  "other": {
    "type": "object",
    "additionalProperties": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

**Drift resolver integration:** Custom resolvers declare `kinds: ["graphqlQuery"]` — the drift engine passes `other` entries to resolvers whose `kinds` include the custom kind name.

**Acceptance criteria:**
- `semanticRefs.other` is accepted on requirements
- Drift resolvers receive custom kinds via the same `resolve(kind, ref, ctx)` interface
- `drift --json` output includes custom-kind findings
- Built-in scanner ignores custom kinds (no false "missing" reports)
- `verify` quality check for `semantic-refs-populated` counts `other` entries

---

### 9. `runAllChecks()` programmatic API

**Problem:** The `verify` CLI command orchestrates 10 separate check functions (schema validation, quality, lifecycle, cross-refs, dependencies, cycles, file paths, test linking, policy quality, workflow policy validation). Library consumers must manually call each function and aggregate results.

**Impact:** Every project that uses anchored-spec as a library (IDE extensions, custom CI scripts, pre-commit hooks) must duplicate the orchestration logic from `verify.ts`. If a new check is added, all consumers must update.

**Proposed API:**

```typescript
import { SpecRoot, resolveConfig, runAllChecks, type VerificationResult } from 'anchored-spec';

const config = resolveConfig(process.cwd());
const spec = new SpecRoot(process.cwd(), config);

const result: VerificationResult = await runAllChecks(spec, {
  strict: false,
  ruleOverrides: { "lifecycle:active-requires-change": "warn" }
});

console.log(result.summary);    // { totalChecks, passed, warnings, errors }
console.log(result.findings);   // ValidationError[]
console.log(result.passed);     // boolean
```

**Acceptance criteria:**
- `runAllChecks` is exported from the package root
- It runs the same checks in the same order as the CLI `verify` command
- `ruleOverrides` applies per-rule severity (same as config proposal #2)
- Return type includes `summary`, `findings`, and `passed` boolean
- No `process.exit()` or `chalk` output — pure library function

---

## Medium — Quality of life

### 10. `ValidationError.suggestion` field

**Problem:** Error and warning messages describe the problem but rarely suggest how to fix it. Messages like "Active requirement has no active change record" are diagnostic but not prescriptive — the user must know the fix themselves.

**Impact:** New adopters and AI agents working with anchored-spec waste time diagnosing the remediation path for each error type. This is especially costly in automated workflows where actionability directly affects throughput.

**Proposed type change:**

```typescript
interface ValidationError {
  path: string;
  message: string;
  severity: "error" | "warning";
  rule: string;
  suggestion?: string;  // NEW — actionable remediation hint
}
```

**Example suggestions:**

| Rule | Current message | Proposed suggestion |
|------|----------------|-------------------|
| `lifecycle:active-requires-change` | "Active requirement has no active change record" | "Run `anchored-spec create change --type feature` and add this requirement's ID to it" |
| `lifecycle:shipped-requires-coverage` | "Shipped requirement has no test coverage" | "Set verification.coverageStatus to 'partial' or 'full', or add testRefs" |
| `quality:no-vague-language` | "Vague language detected: 'should handle'" | "Replace with precise, observable behavior using EARS keywords (When/While/If/Where)" |
| `cross-ref:bidirectional-consistency` | "CHG references REQ-5 but REQ-5 doesn't list CHG" | "Add this change ID to REQ-5's implementation.activeChanges array" |

**Acceptance criteria:**
- `suggestion` is an optional string on `ValidationError`
- At least 80% of error-severity rules include a suggestion
- `verify` CLI appends suggestion in dim/grey text below the error message
- `verify --json` includes the suggestion field
- Programmatic API (`runAllChecks`) surfaces suggestions

---

### 11. Surface `reqsMissingTests` as warnings in verify

**Problem:** The test-linking check computes `reqsMissingTests` — requirements that have zero test references of any kind. However, `verify` only surfaces `orphan` findings (bidirectional link mismatches). Requirements with no tests at all are silently ignored.

**Impact:** A shipped requirement with no test coverage at all generates no warning, while a requirement with partial coverage that's slightly mislinked does. The more dangerous state (zero coverage) is invisible.

**Proposed behavior:**

```
⚠ REQ-19: Active/shipped requirement has no test references (testRefs or testFiles).
    Rule: quality:missing-test-refs
```

**Acceptance criteria:**
- Active and shipped requirements with empty `testRefs` and `testFiles` produce a warning
- Draft and deprecated requirements are excluded
- The rule ID is `quality:missing-test-refs` (configurable via proposal #2)
- Requirements with `coverageStatus: "not-applicable"` are excluded

---

### 12. Support multiple `requirementPattern` values

**Problem:** Only one `testMetadata.requirementPattern` can be configured. Projects transitioning between naming conventions, or that use different patterns in different test frameworks, need multiple patterns.

**Impact:** Projects must choose a single lowest-common-denominator pattern (e.g., bare `REQ-[0-9]+`) that may produce false positives, or lose coverage visibility for tests using the non-configured pattern.

**Proposed config:**

```json
{
  "testMetadata": {
    "requirementPattern": [
      "REQ-METADATA:\\s*(REQ-[1-9][0-9]*)",
      "@covers\\s+(REQ-[1-9][0-9]*)",
      "\\bREQ-[1-9][0-9]*\\b"
    ]
  }
}
```

Accept both `string` (current) and `string[]` (new). When an array, each pattern is tried against each test file. Results from all patterns are unioned.

**Acceptance criteria:**
- `requirementPattern` accepts `string | string[]`
- Multiple patterns are applied independently; results are deduplicated
- Capture group 1 is used when present (existing behavior, per each pattern)
- Single-string config remains backward compatible

---

### 13. Watch mode should include source files

**Problem:** `verify --watch` and `generate --watch` only watch the `specRoot` directory (e.g., `docs/specs/`). Changes to source files (renaming a TypeScript symbol, deleting a route handler, modifying an error code enum) break drift and semantic ref resolution but don't trigger a re-run.

**Impact:** Developers must manually re-run `anchored-spec drift` after source changes to discover broken references. The watch mode gives a false sense of continuous validation.

**Proposed behavior:**

When `sourceRoots` is configured, `--watch` also watches those directories for changes. A source file change triggers the same re-run as a spec file change.

```bash
anchored-spec verify --watch   # watches specRoot + sourceRoots
anchored-spec drift --watch    # NEW: watches specRoot + sourceRoots
```

**Acceptance criteria:**
- `--watch` watches both `specRoot` and `sourceRoots` (if configured)
- Source file changes trigger re-runs with the same debounce (300ms)
- `drift --watch` is a new supported flag
- If `sourceRoots` is not configured, behavior is unchanged (only watches specRoot)

---

### 14. Generation plugin hooks

**Problem:** `generate` produces 4 hardcoded markdown artifacts (`requirements.md`, `decisions.md`, `changes.md`, `status.md`). There is no way to register custom generators for project-specific artifacts (HTML reports, PDF exports, OpenAPI fragments, SARIF files, custom dashboards, agent context manifests).

**Impact:** Projects with custom generation needs must maintain a separate generation pipeline that duplicates artifact loading and spec parsing logic.

**Proposed hook:**

```typescript
// In a plugin file
export default {
  name: "my-generators",
  hooks: {
    onGenerate: async (context) => {
      const { requirements, changes, decisions, generatedDir } = context;
      // Write custom artifacts to generatedDir
      await writeFile(join(generatedDir, "coverage-matrix.html"), renderMatrix(requirements));
    }
  }
};
```

```json
{
  "plugins": ["./scripts/plugins/my-generators.mjs"]
}
```

**Acceptance criteria:**
- `onGenerate` hook receives loaded spec data and the `generatedDir` path
- Hooks run after built-in generators
- `generate --check` validates custom artifacts too (via a `checkGenerate` companion hook)
- Plugin errors are reported but don't prevent built-in generation
- Hook context includes the `SpecRoot` instance for full API access

---

### 15. Document resolver return semantics (`[]` vs `null`)

**Problem:** `DriftResolver.resolve()` can return `string[]` (found), `null` (defer to next resolver), or `[]` (empty array). The distinction between `null` and `[]` is semantically significant but not documented:

- `null` = "I don't handle this ref, try the next resolver"
- `[]` = "I looked and it's not there" — **this short-circuits the resolver chain**

A resolver author returning `[]` when they meant `null` will silently prevent the built-in scanner from finding the ref.

**Impact:** Subtle bugs in custom resolvers that are difficult to diagnose. A resolver for error codes that returns `[]` for an interface ref (instead of `null`) will mark the interface as missing even though the AST resolver would have found it.

**Proposed fix:**

1. **Document prominently** in `drift-detection.md` and in the `DriftResolver` JSDoc:

```typescript
interface DriftResolver {
  /**
   * Resolve a semantic ref to source file paths.
   *
   * @returns File paths where the ref is defined — OR:
   *   - `null` to defer to the next resolver in the chain
   *   - `[]` (empty array) to mark as "definitely not found" (stops the chain)
   *
   * ⚠️ Return `null`, not `[]`, when your resolver doesn't handle this ref kind.
   */
  resolve(kind: SemanticRefKind, ref: string, ctx: DriftResolveContext): string[] | null;
}
```

2. **Add a `kinds` filter check in the engine**: If a resolver declares `kinds: ["errorCode"]` and receives `kind: "interface"`, the engine should skip it automatically (return `null` on its behalf) rather than calling `resolve()`. This prevents accidental `[]` returns for unhandled kinds.

**Acceptance criteria:**
- JSDoc on `DriftResolver.resolve` documents the `null` vs `[]` distinction
- `drift-detection.md` includes a "Writing Custom Resolvers" section with this guidance
- The drift engine skips resolvers whose `kinds` array doesn't include the current kind (defensive check)
- A debug/verbose log line is emitted when a resolver short-circuits with `[]`
