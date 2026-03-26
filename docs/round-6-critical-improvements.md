# Critical Improvements — Round 6

Three proposals addressing the remaining structural gaps between anchored-spec's generic model and real-world monorepo adoption. These are the only blockers preventing full alignment — everything else works natively or through the existing extensions mechanism.

---

## 1. Workflow policy `defaultTypes` should accept custom change types

**Problem:** The `change.schema.json` accepts any kebab-case string as a type (via `customChangeTypes` config), but `workflow-policy.schema.json` still enforces a fixed `enum: ["feature", "fix", "refactor", "chore"]` on `workflowVariants[].defaultTypes`.

This means a project that declares `customChangeTypes: ["infrastructure", "schema", "workflow"]` can create changes with those types, but cannot assign them to workflow variants. The chore variant should govern `workflow` and `repo-workflow` changes, but the WP schema rejects them.

**Current schema** (`workflow-policy.schema.json` lines 26-33):

```json
"defaultTypes": {
  "type": "array",
  "items": {
    "type": "string",
    "enum": ["feature", "fix", "refactor", "chore"]
  }
}
```

**Proposed fix:** Match the change schema's open pattern:

```json
"defaultTypes": {
  "type": "array",
  "items": {
    "type": "string",
    "pattern": "^[a-z][a-z0-9-]*$"
  }
}
```

This is a one-line schema change. The built-in types remain the defaults that the CLI suggests, but projects with custom types can assign them to variants.

**Impact:** Without this, every project using `customChangeTypes` has a workflow policy that's a simplified, lossy view of reality. A "chore" variant that should also govern "workflow" and "infrastructure" changes can only declare `["chore"]`, and the other types silently have no variant assignment.

**Acceptance criteria:**
- `defaultTypes` accepts any `^[a-z][a-z0-9-]*$` string, not just the 4 built-in types
- `anchored-spec create change --type infrastructure` auto-selects the correct variant
- `transition` respects custom-type variant assignment
- Existing policies with only built-in types remain valid

---

## 2. Workflow policy `extensions` field

**Problem:** The workflow policy schema has `"additionalProperties": false` with no `extensions` field, unlike requirements, changes, and decisions which all have `extensions: Record<string, unknown>`. This forces projects with policy-adjacent metadata to maintain a sidecar file.

**Real-world case:** Our monorepo's workflow policy originally contained:

- **`commonRequestRouting`** (5 entries) — maps generic agent requests ("add endpoint", "fix bug") to workflow variants with clarification rules, scope seeds, and documentation routes
- **`impactRules`** (6 entries) — maps file-change globs to required documentation updates, drift checks, and generated outputs

These had to be extracted to `workflow-policy-extensions.json` (363 lines) because the WP schema has no escape hatch. This creates a split-brain where two files must stay in sync and custom scripts must know to read both.

**Proposed fix:** Add `extensions` to the workflow policy schema, matching the pattern used by all other entity schemas:

```json
"extensions": {
  "type": "object",
  "additionalProperties": true,
  "description": "Project-specific policy metadata. Not validated by built-in schemas."
}
```

Add to `WorkflowPolicy` type:

```typescript
extensions?: Record<string, unknown>;
```

Pass `policy.extensions` through to `PluginContext` so plugins and custom checks can read it.

**Impact:** Projects can keep all policy-related configuration in one file. The sidecar pattern works but is a code smell that signals the framework is artificially constraining the policy model.

**Acceptance criteria:**
- `workflow-policy.json` accepts an `extensions` object at the top level
- `extensions` is carried through to `PluginContext.policy`
- Existing policies without `extensions` remain valid
- `verify` does not validate the contents of `extensions`

---

## 3. Plugin `onVerify` hook for custom verification checks with access to config

**Problem:** The plugin system has `checks: PluginCheck[]` for custom verification, but `PluginContext` only provides `requirements`, `changes`, `decisions`, `policy`, and `projectRoot`. It does **not** include:

- The `AnchoredSpecConfig` (no access to `sourceRoots`, `customChangeTypes`, `extensions` sidecar paths, or any config-level metadata)
- The workflow policy `extensions` (blocked by proposal #2, but even with it, the context would need updating)
- The results of built-in checks (plugins can't react to or augment existing findings)
- File-change context (which files were modified — needed for impact-driven checks)

This means a plugin that needs to validate agent routing rules against the policy, or check that custom change types match variant assignments, or verify that impact rules reference valid file paths — can't do any of these.

**Proposed enhancement to `PluginContext`:**

```typescript
export interface PluginContext {
  requirements: Requirement[];
  changes: Change[];
  decisions: Decision[];
  policy: WorkflowPolicy | null;
  projectRoot: string;
  config: AnchoredSpecConfig;        // NEW — full resolved config
  builtinFindings?: ValidationError[]; // NEW — results from built-in checks (onVerify only)
}
```

And a new `onVerify` hook:

```typescript
export interface PluginHooks {
  onGenerate?: (context: GenerateHookContext) => void | Promise<void>;
  onVerify?: (context: VerifyHookContext) => ValidationError[];  // NEW
}

export interface VerifyHookContext {
  spec: PluginContext;
  builtinFindings: ValidationError[];
}
```

**How it works:**
1. Built-in checks run first (schema, quality, lifecycle, cross-refs, test-linking, drift)
2. `onVerify` hooks run after, receiving all spec data + the built-in findings
3. Plugin findings are merged into the final result
4. Rule severity config (`quality.rules`) applies to plugin findings too

This replaces the existing `checks: PluginCheck[]` with a more capable hook — or the two can coexist, with `checks` being the simple "pure function" path and `onVerify` being the full-context path.

**Impact:** This is the key to collapsing the sidecar + custom script pattern. A plugin could:
- Read `policy.extensions.commonRequestRouting` and validate it against change records
- Read `policy.extensions.impactRules` and verify glob patterns resolve to real files
- Check that all `customChangeTypes` appear in at least one variant's `defaultTypes`
- Validate agent-specific metadata in requirement/change extensions
- React to built-in findings (e.g., augment a lifecycle warning with project-specific context)

**Acceptance criteria:**
- `PluginContext` includes `config: AnchoredSpecConfig`
- `onVerify` hook exists and receives built-in findings
- Plugin-produced `ValidationError` findings appear in `verify` output and `--json`
- Rule severity config applies to plugin findings (using plugin check `id` as the rule name)
- Existing `checks: PluginCheck[]` continues to work unchanged
