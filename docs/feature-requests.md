# Feature Requests

Individually scoped feature requests for advancing `anchored-spec` toward full spec-driven development parity for advanced workflows. Each is self-contained and AI-implementable.

**Priority order:** Features 1–5 are critical infrastructure. Features 6–10 are quality-of-life improvements that build on the foundation.

---

## 1. Pluggable Drift Resolver Interface

**Problem:** `detectDrift()` uses built-in regex scanning to find semantic refs in source files. This produces false positives (string matches in comments/strings) and false negatives (re-exports, type-only exports, aliased exports). Projects with TypeScript codebases need AST-level accuracy, and other ecosystems (Python, Java, Go) need their own resolution strategies.

**Proposal:** Introduce a `DriftResolver` interface that `detectDrift()` delegates to. Ship the current regex scanner as the default built-in resolver, and allow projects to register custom resolvers via config or the programmatic API.

```typescript
interface DriftResolver {
  name: string;
  /** Which semantic ref kinds this resolver handles */
  supports: SemanticRefKind[];
  /**
   * Resolve a single semantic ref against the codebase.
   * Return file paths where the ref was found, or empty array if missing.
   */
  resolve(ref: string, kind: SemanticRefKind, options: DriftResolveContext): string[];
}

interface DriftResolveContext {
  projectRoot: string;
  sourceRoots: string[];
  sourceGlobs: string[];
}
```

**Configuration:**

```json
{
  "driftResolvers": [
    "./.anchored-spec/resolvers/typescript-ast.js"
  ]
}
```

**Behavior:**

- Custom resolvers take priority over the built-in regex resolver for their declared `supports` kinds
- Fall back to built-in for kinds not covered by any custom resolver
- `detectDrift()` signature unchanged — resolver selection is internal
- Resolvers are loaded the same way plugins are (relative path or npm package)

**Acceptance criteria:**

- [ ] `DriftResolver` interface exported from `anchored-spec`
- [ ] `detectDrift()` accepts optional `resolvers` array in `DriftOptions`
- [ ] Config supports `driftResolvers` array (loaded like plugins)
- [ ] Built-in regex scanner refactored to implement `DriftResolver`
- [ ] `anchored-spec drift` CLI uses configured resolvers
- [ ] Tests: custom resolver overrides built-in for declared kinds, fallback works for uncovered kinds

---

## 2. Test Evidence Pipeline

**Problem:** `coverageStatus` on requirements is a manually-maintained field. There is no way to prove that tests actually pass — a requirement can claim `"coverageStatus": "full"` while its referenced tests are failing. For regulated or high-assurance projects, this gap between declared and demonstrated coverage is unacceptable.

**Proposal:** Add an evidence collection and validation pipeline that ingests test runner output, maps test files to requirements, and produces a machine-verifiable evidence artifact.

### 2a. Evidence Schema

```json
{
  "$schema": "../schemas/evidence.schema.json",
  "generatedAt": "2025-01-15T10:30:00Z",
  "source": "vitest",
  "records": [
    {
      "requirementId": "REQ-1",
      "testFile": "src/__tests__/auth.test.ts",
      "kind": "unit",
      "status": "passed",
      "recordedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### 2b. Evidence Collection CLI

```bash
# Ingest test output and build evidence
anchored-spec evidence collect --from <json-report-path> --format vitest
anchored-spec evidence collect --from <json-report-path> --format jest
anchored-spec evidence collect --from <json-report-path> --format junit

# Validate evidence artifact
anchored-spec evidence validate
```

The collector should:

1. Parse test runner JSON output to extract pass/fail per test file
2. Map test files to requirements using `verification.testRefs[].path`
3. Write `specs/evidence/evidence.json`

### 2c. Execution Policy on Requirements

Add optional `executionPolicy` to the requirement schema:

```json
{
  "verification": {
    "executionPolicy": {
      "requiresEvidence": true,
      "requiredKinds": ["unit", "integration"]
    }
  }
}
```

### 2d. Verify Integration

`anchored-spec verify` should optionally check:

- If evidence file exists and is well-formed
- If requirements with `executionPolicy.requiresEvidence: true` have matching `"passed"` records in the evidence file
- If all test files in evidence are actually referenced by some requirement's `testRefs`

**Acceptance criteria:**

- [ ] `evidence.schema.json` added
- [ ] `evidence collect` CLI command with at least one format (vitest or jest or junit)
- [ ] `evidence validate` CLI command
- [ ] `executionPolicy` field added to requirement schema (optional, backward-compatible)
- [ ] `verify` checks evidence when `--strict` is used
- [ ] Programmatic API: `collectEvidence()`, `validateEvidence()` exported

---

## 3. Bidirectional Test-to-Requirement Linking

**Problem:** Requirements reference test files via `verification.testRefs`, but there is no reverse validation. A requirement can claim a test file covers it without the test file's agreement. If a test file is moved or its scope changes, the requirement's claim becomes stale with no detection mechanism.

**Proposal:** Add a verification check that scans test files for structured metadata comments declaring which requirements they cover, and validates bidirectional consistency.

### Convention

Test files include a metadata comment:

```typescript
// @anchored-spec REQ-1, REQ-5
```

The comment format should be configurable:

```json
{
  "testMetadata": {
    "pattern": "@anchored-spec",
    "fileGlobs": ["**/*.test.ts", "**/*.spec.ts", "**/*.test.js"]
  }
}
```

### Verification Check

A new check in `verify` (or a built-in plugin):

1. For every test file referenced by any requirement's `testRefs`:
   - Read the file and extract the metadata comment
   - Verify the comment contains the requirement ID that references it
2. For every test file with a metadata comment:
   - Verify the declared requirement IDs actually exist
   - Optionally warn if a requirement doesn't list this test file in `testRefs`

**Acceptance criteria:**

- [ ] Default metadata pattern: `@anchored-spec REQ-1, REQ-2` (configurable)
- [ ] New verify check: `bidirectional-test-linking`
- [ ] Errors: test file referenced by REQ but missing metadata, or metadata references non-existent REQ
- [ ] Warnings: test file has metadata but REQ doesn't list it in `testRefs`
- [ ] Config: `testMetadata.pattern` and `testMetadata.fileGlobs` in `.anchored-spec/config.json`
- [ ] Tests: matching, missing, stale, and misconfigured scenarios

---

## 4. Per-Change Verification Tracking

**Problem:** Change records track scope and phase, but there is no structured tracking of what verification is required or completed for a specific change. Different change types need different verification commands (e.g., a schema change needs a schema drift check; an API change needs an API drift check). This is currently implicit — left to human judgment or external tooling.

**Proposal:** Add a `verification.json` sidecar to each change directory, and a verification-completeness gate on the `done` transition.

### Schema

```json
{
  "$schema": "../../schemas/change-verification.schema.json",
  "changeId": "CHG-2025-0001-add-auth",
  "commands": [
    { "name": "verify", "command": "anchored-spec verify --strict", "required": true },
    { "name": "drift", "command": "anchored-spec drift --fail-on-missing", "required": true }
  ],
  "driftChecks": ["semantic"],
  "evidence": {
    "collected": false,
    "collectedAt": null
  }
}
```

### Behavior

- `anchored-spec create change` generates a `verification.json` alongside `change.json` with default commands based on the workflow variant
- `anchored-spec transition <id> --to done` checks that `verification.json` exists and (optionally) that all required commands have been marked as passed
- The `report` command includes verification completeness per change
- Verification JSON is optional and backward-compatible — changes without it still work

**Acceptance criteria:**

- [ ] `change-verification.schema.json` added
- [ ] `create change` generates `verification.json` with defaults from workflow variant
- [ ] `transition --to done` warns if verification.json is missing (error in `--strict`)
- [ ] `report` includes verification completeness
- [ ] Schema: `commands[].required`, `evidence.collected`

---

## 5. Impact Analysis: File-to-Requirement Mapping

**Problem:** The policy engine answers "does this file need a change record?" but not "which requirements are affected by this file?" When a developer modifies a source file, they need to know which requirements they should review, update, or re-verify. This is critical for change impact assessment and agent-driven workflows.

**Proposal:** Add an `impact` command and programmatic API that maps file paths to affected requirements by matching against change scopes and semantic refs.

### CLI

```bash
# Which requirements are affected by these files?
anchored-spec impact src/auth/login.ts src/auth/token.ts

# Generate a full impact map (all governed paths → requirements)
anchored-spec impact --generate

# Machine-readable output
anchored-spec impact --json src/auth/login.ts
```

### Programmatic API

```typescript
interface ImpactResult {
  path: string;
  matchedRequirements: Array<{
    reqId: string;
    matchReason: "scope" | "semanticRef" | "testRef";
    details: string;
  }>;
}

function analyzeImpact(
  paths: string[],
  requirements: Requirement[],
  changes: Change[],
): ImpactResult[];
```

### Matching Strategy

A file impacts a requirement if any of:

1. **Change scope**: An active change covering this path links to the requirement
2. **Semantic refs**: The requirement's `semanticRefs` (routes, symbols, interfaces) match content or exports in the file (using the drift resolver infrastructure from Feature #1)
3. **Test refs**: The file is listed in the requirement's `testRefs`

### Generated Impact Map

`anchored-spec impact --generate` produces `specs/generated/impact-map.json`:

```json
{
  "generatedAt": "2025-01-15T10:30:00Z",
  "entries": [
    {
      "pathPattern": "src/auth/**",
      "requirements": ["REQ-1", "REQ-5"],
      "matchedRules": ["rule-api-source"]
    }
  ]
}
```

**Acceptance criteria:**

- [ ] `impact` CLI command with `--json` and `--generate`
- [ ] `analyzeImpact()` exported from programmatic API
- [ ] Matching: change scope, semantic ref content match, test ref path match
- [ ] Generated impact map with `generate --check` staleness detection
- [ ] Tests: scope matching, semantic ref matching, combined results

---

## 6. Create Command Lifecycle Hooks

**Problem:** `anchored-spec create change` generates a `change.json` but projects often need additional scaffolding — design document templates, implementation plan templates, verification checklists, branch creation, CI configuration. Currently, projects must wrap the CLI in custom scripts to add these artifacts.

**Proposal:** Add a hook system that runs user-defined scripts after `create` commands.

### Configuration

```json
{
  "hooks": {
    "post-create:change": [".anchored-spec/hooks/scaffold-docs.sh"],
    "post-create:requirement": [".anchored-spec/hooks/notify-team.sh"],
    "post-transition": [".anchored-spec/hooks/update-board.sh"]
  }
}
```

### Hook Environment

Hooks receive context as environment variables:

```bash
# Available to all hooks
ANCHORED_SPEC_PROJECT_ROOT=/path/to/project
ANCHORED_SPEC_SPEC_ROOT=/path/to/project/specs

# post-create:change
ANCHORED_SPEC_CHANGE_ID=CHG-2025-0001-add-auth
ANCHORED_SPEC_CHANGE_TYPE=feature
ANCHORED_SPEC_CHANGE_DIR=/path/to/project/specs/changes/CHG-2025-0001-add-auth
ANCHORED_SPEC_CHANGE_SLUG=add-auth
ANCHORED_SPEC_WORKFLOW_VARIANT=feature-behavior-first

# post-create:requirement
ANCHORED_SPEC_REQ_ID=REQ-15
ANCHORED_SPEC_REQ_FILE=/path/to/project/specs/requirements/REQ-15.json

# post-transition
ANCHORED_SPEC_CHANGE_ID=CHG-2025-0001-add-auth
ANCHORED_SPEC_FROM_PHASE=design
ANCHORED_SPEC_TO_PHASE=planned
```

### Behavior

- Hooks run sequentially after the artifact is written
- Hook failure (non-zero exit) prints a warning but does not roll back the created artifact
- `--dry-run` skips hooks (with a message listing what would run)
- `--no-hooks` flag to suppress hooks

**Acceptance criteria:**

- [ ] `hooks` config key in `.anchored-spec/config.json`
- [ ] Hook events: `post-create:change`, `post-create:requirement`, `post-create:decision`, `post-transition`
- [ ] Environment variables passed to hooks
- [ ] `--no-hooks` flag on `create` and `transition` commands
- [ ] `--dry-run` lists hooks that would run without executing
- [ ] Tests: hook execution, failure handling, env var availability

---

## 7. Requirement Quality: Test Coverage Completeness Check

**Problem:** `checkRequirementQuality()` validates EARS notation and semantic refs, but does not validate that `verification.testRefs` actually cover all `verification.requiredTestKinds`. A requirement can declare it needs `["unit", "integration"]` tests while only having unit test refs — this gap is not detected.

**Proposal:** Add a quality check that verifies test ref completeness against declared required test kinds.

### Check Logic

For requirements with status `active` or `shipped`:

1. Collect the set of `requiredTestKinds` (e.g., `["unit", "integration"]`)
2. Collect the set of kinds present in `testRefs` (e.g., `[{ kind: "unit" }]`)
3. If any required kind has no matching `testRef`, emit a warning (or error for `shipped`)

### Example Output

```
REQ-1/verification: Missing testRef for required kind "integration".
  Has: unit. Needs: unit, integration.
  Rule: quality:test-kind-coverage
```

**Acceptance criteria:**

- [ ] New check in `checkRequirementQuality()`: `quality:test-kind-coverage`
- [ ] Warning for `active` requirements, error for `shipped` requirements
- [ ] Only runs when both `requiredTestKinds` and `testRefs` are present
- [ ] Tests: complete, partial, missing, and not-applicable scenarios

---

## 8. Requirement Quality: File Path Existence Validation

**Problem:** Requirements reference file paths in `testRefs[].path`, `traceRefs[].path`, and potentially `testFiles[]`. If files are moved or deleted, these references become stale silently. The current quality checks don't validate that referenced paths exist on disk.

**Proposal:** Add an opt-in quality check that resolves file paths relative to the project root and warns on missing files.

### Check Logic

For each requirement:

1. Resolve each `testRefs[].path` relative to project root
2. Resolve each `traceRefs[].path` relative to project root
3. Resolve each `verification.testFiles[]` relative to project root
4. Warn on any path that does not exist

### Configuration

```json
{
  "quality": {
    "validateFilePaths": true
  }
}
```

Disabled by default to avoid breaking existing setups. Enabled by default in `--strict` mode.

**Acceptance criteria:**

- [ ] New check: `quality:file-path-exists`
- [ ] Checks `testRefs[].path`, `traceRefs[].path`, `verification.testFiles[]`
- [ ] Config flag `quality.validateFilePaths` (default: `false`, forced `true` in `--strict`)
- [ ] Severity: warning (does not block verify unless `--strict`)
- [ ] Tests: existing paths, missing paths, config toggle

---

## 9. Extensible Schema via Custom Fields

**Problem:** All schemas use `"additionalProperties": false`, which means projects cannot add domain-specific fields to requirements, changes, or decisions without forking the schemas. Real projects need custom metadata — product surfaces, compliance tags, compatibility matrices, risk scores — that are domain-specific and shouldn't be in the core schema.

**Proposal:** Add a reserved `extensions` object to each schema that allows arbitrary project-specific fields, plus optional validation of those extensions via plugins.

### Schema Change

Add to `requirement.schema.json`, `change.schema.json`, `decision.schema.json`:

```json
{
  "properties": {
    "extensions": {
      "type": "object",
      "description": "Project-specific custom fields. Not validated by built-in schemas.",
      "additionalProperties": true
    }
  }
}
```

### Plugin Validation

Plugins can validate extensions via the existing plugin system:

```javascript
export default {
  name: "custom-fields",
  checks: [{
    id: "validate-surfaces",
    description: "Validate requirement surfaces field",
    check: (ctx) => {
      return ctx.requirements
        .filter(r => r.extensions?.surfaces && !Array.isArray(r.extensions.surfaces))
        .map(r => ({
          path: `${r.id}/extensions/surfaces`,
          message: "surfaces must be an array",
          severity: "error"
        }));
    }
  }]
};
```

**Acceptance criteria:**

- [ ] `extensions` object added to requirement, change, and decision schemas
- [ ] `extensions` typed as `Record<string, unknown>` in TypeScript types
- [ ] Existing `additionalProperties: false` preserved for all other fields
- [ ] Verify, generate, and report commands pass through extensions without error
- [ ] Tests: extensions round-trip through load/validate/save
- [ ] Documentation: example plugin validating a custom extension field

---

## 10. Semantic Link Resolution Map

**Problem:** `anchored-spec drift` reports whether semantic refs are found or missing, but only as CLI output. There is no persistent artifact that tracks the resolution status of every semantic ref over time. Projects need a machine-readable map of "which refs are resolved, which are missing, and where they were found" for dashboards, CI gates, and agent tooling.

**Proposal:** Add a generated `semantic-links.json` artifact that `drift` can produce, and integrate it with `generate --check` for staleness detection.

### Generated Artifact

```json
{
  "generatedAt": "2025-01-15T10:30:00Z",
  "requirements": [
    {
      "reqId": "REQ-1",
      "refs": [
        { "kind": "interface", "ref": "IAuthService", "status": "found", "foundIn": ["src/auth/types.ts"] },
        { "kind": "route", "ref": "POST /api/v1/auth/login", "status": "found", "foundIn": ["src/auth/routes.ts"] },
        { "kind": "errorCode", "ref": "AUTH_INVALID_CREDENTIALS", "status": "missing" }
      ]
    }
  ],
  "summary": {
    "totalRefs": 42,
    "found": 39,
    "missing": 3,
    "resolutionRate": 0.929
  }
}
```

### CLI

```bash
# Generate semantic link map
anchored-spec drift --generate-map

# Check if map is stale (for CI)
anchored-spec drift --check-map
```

### Programmatic API

Already mostly there via `detectDrift()` return type — just needs a `writeSemanticLinkMap()` and `checkSemanticLinkMapFreshness()`.

**Acceptance criteria:**

- [ ] `anchored-spec drift --generate-map` writes `specs/generated/semantic-links.json`
- [ ] `anchored-spec drift --check-map` exits non-zero if stale
- [ ] `generate --check` includes semantic link map staleness
- [ ] JSON output follows the schema above (per-requirement, per-ref resolution)
- [ ] `summary.resolutionRate` included for dashboards
- [ ] Tests: generation, staleness detection, empty-state handling
