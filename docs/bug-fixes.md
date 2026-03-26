# Anchored-Spec Bug-Fix List

Following up on the [feature requests](./feature-requests.md) — this is a focused list of bugs and gaps found during post-implementation audit. Items are grouped by severity.

---

## Blockers

### BUG-1: `executionPolicy` missing from requirement JSON schema

**Feature:** #2 — Test Evidence Pipeline

The `executionPolicy` field was added to the `Verification` TypeScript interface but not to the JSON schema. Since the schema's `verification` object sets `additionalProperties: false`, any requirement JSON that includes `executionPolicy` will **fail schema validation**.

The workaround in `evidence.ts` uses an unsafe double-cast to access the field at runtime:

```ts
const policy = (req.verification as Record<string, unknown> | undefined)
  ?.executionPolicy as { requiresEvidence?: boolean; requiredKinds?: string[] } | undefined;
```

**Fix:** Add `executionPolicy` to the `verification` object in `requirement.schema.json`:

```json
"executionPolicy": {
  "type": "object",
  "properties": {
    "requiresEvidence": { "type": "boolean" },
    "requiredKinds": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "additionalProperties": false
}
```

Then remove the unsafe cast in `evidence.ts` — access `req.verification.executionPolicy` directly.

**Acceptance:** A requirement with `executionPolicy.requiresEvidence: true` passes `verify` without schema errors.

---

### BUG-2: Drift resolvers cannot be configured via JSON

**Feature:** #1 — Pluggable Drift Resolver

`config.driftResolvers` is typed as `DriftResolver[]`, which contains a `resolve()` function — not serializable to JSON. Additionally, the CLI drift command never reads `driftResolvers` from config, so even the programmatic path doesn't work end-to-end from config.

**Fix (two parts):**

1. Change the config type to accept string paths (module references) instead of runtime objects:

   ```json
   {
     "driftResolvers": ["./resolvers/ast-resolver.js"]
   }
   ```

2. In the CLI drift command, dynamically import resolvers from the configured paths and pass them to `detectDrift()`.

**Acceptance:** A user can add a drift resolver via `config.json`, and running `anchored-spec drift` loads and invokes it.

---

## High Severity

### BUG-3: Test-linking regex matches too broadly

**Feature:** #3 — Bidirectional Test Linking

The default pattern `/REQ-\d+/g` has no word boundaries. It matches requirement IDs as substrings of larger tokens (e.g., `SOME_REQ-123_OTHER`), inside string literals, comments, or unrelated identifiers. It also accepts `REQ-0` and leading zeros, which the ID schema (`^REQ-[1-9][0-9]*$`) forbids.

**Fix:** Use a pattern with word boundaries and correct digit rules:

```ts
const DEFAULT_REQ_PATTERN = /\bREQ-[1-9][0-9]*\b/g;
```

Or better, require an explicit annotation comment pattern (e.g., `@anchored-spec REQ-1`) to eliminate false positives from incidental mentions.

**Acceptance:** A test file containing `const UNREQ-123 = true` does NOT produce a match. A test file containing `// @anchored-spec REQ-123` does.

---

### BUG-4: `generate --check` does not cover impact map or semantic link map

**Feature:** #5 — Impact Analysis Engine, #10 — Semantic Link Resolution Map

The `generate --check` command validates staleness for 4 markdown artifacts (`requirements.md`, `decisions.md`, `changes.md`, `status.md`) but does not check `impact-map.json` or `semantic-links.json`. There is no single command to verify all generated artifacts are up-to-date.

**Fix:** Add `impact-map.json` and `semantic-links.json` to the artifact list checked by `generate --check`. Alternatively, add `--check` flags to the `drift` and `impact` commands and document the full staleness-check workflow.

**Acceptance:** After modifying a requirement's semantic refs without regenerating, `generate --check` exits non-zero and names the stale artifact.

---

### BUG-5: CLI dry-run silently skips hooks instead of previewing them

**Feature:** #6 — Lifecycle Hooks

The core `runHooks()` function correctly supports `dryRun: true` (logs what would run without executing). However, CLI commands guard hooks with `if (!dryRun && ...)`, skipping the call entirely. Users running `--dry-run` on `create` or `transition` get no indication of which hooks would fire.

**Fix:** In CLI commands, call `runHooks(event, config, env, { dryRun: true })` when `--dry-run` is active, instead of skipping the call.

**Acceptance:** Running `anchored-spec create requirement --dry-run` shows "Would run: ./hooks/notify.sh" for configured hooks.

---

## Medium Severity

### BUG-6: Impact analysis `resolvers` parameter is dead code

**Feature:** #5 — Impact Analysis Engine

`analyzeImpact()` accepts `_options?: { resolvers?: DriftResolver[] }` but the parameter is underscore-prefixed and never referenced in the function body. The function hardcodes its own semantic-ref matching logic.

**Fix:** Either wire resolvers into the semantic-ref matching pipeline (consistent with how `detectDrift` uses them), or remove the parameter to avoid misleading the API consumer.

**Acceptance:** If kept: a custom resolver passed to `analyzeImpact()` is invoked during ref resolution. If removed: the parameter no longer appears in the public API.

---

### BUG-7: Hook events are too coarse-grained

**Feature:** #6 — Lifecycle Hooks

Only two hook events exist: `post-create` and `post-transition`. There is no way to scope a hook to a specific entity type (requirement vs. change vs. decision) in configuration. Users must filter via environment variables (`ANCHORED_SPEC_TYPE`) inside their scripts.

**Fix:** Support compound event names (e.g., `post-create:requirement`, `post-transition:active`). Fall back to the base event when no compound match exists, preserving backward compatibility:

```json
{
  "hooks": [
    { "event": "post-create:requirement", "run": "./hooks/req-created.sh" },
    { "event": "post-transition", "run": "./hooks/any-transition.sh" }
  ]
}
```

**Acceptance:** A hook registered for `post-create:requirement` fires when creating a requirement but not when creating a change.

---

### BUG-8: Semantic link map has zero test coverage

**Feature:** #10 — Semantic Link Resolution Map

`buildSemanticLinkMap()` and the `drift --check-map` staleness check have no tests. Any refactor to the drift module could silently break semantic link generation.

**Fix:** Add tests covering:

1. `buildSemanticLinkMap()` produces correct output for requirements with various `semanticRefs` kinds (symbols, interfaces, error-codes, schemas).
2. `--check-map` detects staleness when a requirement's semantic refs change.
3. `--check-map` passes when the map is current.

**Acceptance:** `pnpm test` includes at least 3 passing tests for semantic link map generation and staleness detection.

---

### BUG-9: Change verification tracking has no dedicated tests

**Feature:** #4 — Per-Change Verification Tracking

`change-verification.schema.json` exists and the `create` command generates change verification stubs, but there are no dedicated tests validating the schema or the verification state machine.

**Fix:** Add tests covering:

1. A change verification JSON file passes schema validation.
2. Invalid verification data (wrong status, missing fields) fails validation.
3. The verification stub generated by `create change` matches the schema.

**Acceptance:** `pnpm test` includes at least 3 passing tests for change verification schema and generation.
