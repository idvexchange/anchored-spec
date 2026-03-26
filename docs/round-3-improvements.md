# Anchored-Spec — Round 3 Improvements

Following up on [feature-requests.md](./feature-requests.md) and [bug-fixes.md](./bug-fixes.md). All 9 previously reported bugs are confirmed fixed — nice work. This list covers the 2 remaining functional gaps and 2 minor quality items found during re-audit.

---

## Functional Gaps

### GAP-1: Integrate evidence validation into the `verify` pipeline

**Feature:** #2 — Test Evidence Pipeline

`validateEvidence()` works correctly as a standalone function and via `anchored-spec evidence validate`, but the main `verify` command (9 check categories) never calls it. Users must remember to run evidence validation as a separate step, which breaks the "single command gate" principle.

**Current state:** `src/cli/commands/verify.ts` has zero references to `evidence` or `validateEvidence`.

**Fix:** Add evidence validation as step 10 in the verify pipeline, gated on the presence of an evidence file:

```ts
// Step 10: Evidence validation (if evidence file exists)
if (existsSync(join(specRoot, "generated", "evidence.json"))) {
  const evidence = loadEvidence(join(specRoot, "generated", "evidence.json"));
  const evidenceErrors = validateEvidence(evidence, requirements);
  results.push(...evidenceErrors);
}
```

**Acceptance:** After collecting evidence with `evidence collect`, running `anchored-spec verify` reports evidence violations (missing evidence for requirements with `executionPolicy.requiresEvidence: true`) without needing a separate command.

---

### GAP-2: Add `ChangeVerification` TypeScript type and runtime support

**Feature:** #4 — Per-Change Verification Tracking

The schema (`change-verification.schema.json`) and sidecar generation work correctly, but there is no corresponding TypeScript type, no runtime logic to read/aggregate verification sidecars, and the `report` command doesn't include change verification status.

**Fix (three parts):**

1. Add a `ChangeVerification` type to `types.ts` matching the schema:

   ```ts
   export interface ChangeVerification {
     $schema?: string;
     changeId: string;
     commands: Array<{
       name: string;
       command: string;
       required: boolean;
       status: "pending" | "passed" | "failed" | "skipped";
       ranAt?: string;
     }>;
     driftChecks?: Array<{ name: string; status: string }>;
     evidence?: { collected: boolean; path?: string };
   }
   ```

2. Add a loader function (e.g., `loadChangeVerification(changePath)`) that reads and validates sidecar files.

3. Include verification summary in the `report` command output — show how many changes have all commands passing vs. pending/failed.

**Acceptance:** `anchored-spec report` includes a "Change Verification" section showing per-change command status. The `ChangeVerification` type is exported from the package's public API.

---

## Minor Quality Items

### MINOR-1: Add decision extension test

**Feature:** #9 — Extensible Schema

Requirement and change extensions both have dedicated tests, but decision extensions do not. The schema and type support it — just missing the test case.

**Fix:** Add one test to `validate.test.ts`:

```ts
it("accepts decision with extensions", () => {
  const decision = makeDecision({
    extensions: { customField: "value", nested: { deep: true } },
  });
  const errors = validateSchema(decision, "decision");
  expect(errors).toHaveLength(0);
});
```

**Acceptance:** Test suite includes a passing test for decision extensions.

---

### MINOR-2: Add vitest coverage thresholds

The test suite is strong (246 tests, 1.4:1 test-to-source ratio) but `vitest.config.ts` has no coverage thresholds configured. Regressions could reduce coverage without CI catching it.

**Fix:** Add coverage configuration to `vitest.config.ts`:

```ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

**Acceptance:** `pnpm test --coverage` enforces minimum thresholds and fails CI if coverage drops below them.
