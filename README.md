# Anchored Spec

[![CI](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/anchored-spec)](https://www.npmjs.com/package/anchored-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Spec-driven development framework — specs as living contracts.

**Anchored Spec** is a drop-in framework for brownfield and greenfield repositories that makes specifications the source of truth for your software. Unlike ephemeral spec tools that discard specs after generation, Anchored Spec treats specs as **persistent, machine-validated contracts** that evolve with your codebase.

## Philosophy

| Principle | What it means |
|---|---|
| **Spec-anchored** | Specs persist as living contracts — they evolve with code, never get deleted |
| **JSON-first** | Machine-readable JSON is the source of truth; markdown is generated for humans |
| **EARS notation** | Behavioral statements use structured "When/While/shall" format |
| **Path-based enforcement** | Glob rules automatically detect which changes need formal governance |
| **Progressive adoption** | Start with `init` + `verify`, add requirements and changes incrementally |
| **Three workflow sizes** | `feature` (full ceremony), `fix` (root-cause first), `chore` (lightweight) |

## Installation

```bash
# As a dev dependency (recommended)
npm install --save-dev anchored-spec
# or
pnpm add -D anchored-spec

# Or run directly with npx
npx anchored-spec init
```

Anchored Spec ships as both ESM and CJS — it works with any module system.

## Quick Start

```bash
# Initialize spec infrastructure in your project
npx anchored-spec init

# Create your first requirement
npx anchored-spec create requirement --title "User can log in"

# Create a change record to implement it
npx anchored-spec create change --title "Add login" --type feature --slug add-login

# Verify everything
npx anchored-spec verify

# Generate markdown documentation
npx anchored-spec generate

# Check project health
npx anchored-spec status
```

## What Gets Created

After `anchored-spec init`, your project gets:

```
your-repo/
├── .anchored-spec/
│   └── config.json          # Framework configuration
├── specs/
│   ├── schemas/             # JSON Schema files (reference)
│   ├── requirements/        # REQ-*.json files (behavioral specs)
│   │   └── REQ-1.json       # Starter example (edit or replace)
│   ├── changes/             # CHG-*/change.json (work tracking)
│   ├── decisions/           # ADR-*.json (architecture decisions)
│   ├── generated/           # Generated markdown (gitignored)
│   └── workflow-policy.json # Governance rules
├── .gitignore               # Updated with specs/generated/
└── package.json             # Gets spec:* scripts added
```

## Core Concepts

### Requirements (REQ)

Requirements describe **what** the system does using EARS notation (Easy Approach to Requirements Syntax):

```json
{
  "id": "REQ-1",
  "title": "User Authentication",
  "behaviorStatements": [
    {
      "id": "BS-1",
      "text": "When a user submits valid credentials, the system shall return an auth token.",
      "format": "EARS",
      "trigger": "user submits valid credentials",
      "response": "the system shall return an auth token"
    }
  ],
  "semanticRefs": {
    "interfaces": ["IAuthService"],
    "routes": ["POST /api/v1/auth/login"]
  }
}
```

**Key rule:** Requirements stay functional forever. Technical detail goes in `semanticRefs` (code anchors) and change records.

### Change Records (CHG)

Changes are born technical — they carry file scope, affected symbols, and policy enforcement:

```json
{
  "id": "CHG-2025-0001-add-auth",
  "type": "feature",
  "workflowVariant": "feature-behavior-first",
  "scope": { "include": ["src/auth/**"] },
  "requirements": ["REQ-1"]
}
```

### Decisions (ADR)

Architecture Decision Records capture choices among alternatives:

```json
{
  "id": "ADR-1",
  "title": "Use PostgreSQL for persistence",
  "decision": "We will use PostgreSQL as the primary database.",
  "alternatives": [
    { "name": "MySQL", "verdict": "rejected", "reason": "Fewer features" }
  ],
  "relatedRequirements": ["REQ-1"]
}
```

### Workflow Policy

The workflow policy defines governance rules:

- **Workflow variants** — Different ceremony levels for different change types
- **Path rules** — Glob patterns that trigger change record requirements
- **Trivial exemptions** — Paths that never need governance (README, CI config, etc.)
- **Lifecycle rules** — Gates like "shipped requires test coverage"

## Commands

| Command | Description |
|---|---|
| `anchored-spec init` | Initialize spec infrastructure |
| `anchored-spec init --dry-run` | Preview what init would create |
| `anchored-spec init --no-examples` | Skip creating starter example files |
| `anchored-spec create requirement` | Create a new requirement |
| `anchored-spec create change` | Create a new change record (with verification sidecar) |
| `anchored-spec create decision` | Create a new decision (ADR) |
| `anchored-spec create <type> --dry-run` | Preview without writing files |
| `anchored-spec create --no-hooks` | Skip lifecycle hooks |
| `anchored-spec verify` | Run all validation checks |
| `anchored-spec verify --strict` | Treat warnings as errors |
| `anchored-spec verify --quiet` | Only show errors |
| `anchored-spec verify --watch` | Re-verify on file changes |
| `anchored-spec generate` | Regenerate markdown from JSON |
| `anchored-spec generate --check` | Check if generated files are stale (CI-friendly) |
| `anchored-spec generate --watch` | Regenerate on file changes |
| `anchored-spec status` | Show health dashboard |
| `anchored-spec status --json` | Machine-readable status output |
| `anchored-spec transition <id>` | Advance a change to the next phase |
| `anchored-spec transition <id> --to <phase>` | Move to a specific phase |
| `anchored-spec transition <id> --force` | Skip gate validation |
| `anchored-spec transition <id> --no-hooks` | Skip lifecycle hooks |
| `anchored-spec check` | Git-aware policy enforcement |
| `anchored-spec check --staged` | Check only staged files |
| `anchored-spec check --against <branch>` | Compare against a branch |
| `anchored-spec check --paths <files...>` | Manually specify paths (no git) |
| `anchored-spec check --json` | Machine-readable output |
| `anchored-spec migrate` | Detect and apply schema migrations |
| `anchored-spec drift` | Detect semantic drift between specs and code |
| `anchored-spec drift --json` | Machine-readable drift output |
| `anchored-spec drift --fail-on-missing` | Exit with error if refs are missing (CI) |
| `anchored-spec drift --generate-map` | Write `semantic-links.json` to generated dir |
| `anchored-spec drift --check-map` | Check if `semantic-links.json` is stale (CI) |
| `anchored-spec import <path>` | Import markdown ADRs/requirements to JSON |
| `anchored-spec import <path> --dry-run` | Preview import without writing |
| `anchored-spec report` | Generate traceability matrix and coverage report |
| `anchored-spec report --json` | Machine-readable report output |
| `anchored-spec evidence collect --from <path>` | Ingest test runner output into evidence artifact |
| `anchored-spec evidence collect --format <fmt>` | Specify format: `vitest`, `jest`, `junit` |
| `anchored-spec evidence validate` | Validate evidence against requirements |
| `anchored-spec impact <paths...>` | Show which requirements are affected by files |
| `anchored-spec impact --json` | Machine-readable impact output |
| `anchored-spec impact --generate` | Generate full impact map to generated dir |

## CI Integration

Add verification to your CI pipeline:

```yaml
# .github/workflows/ci.yml
- run: npx anchored-spec verify --strict
- run: npx anchored-spec generate --check
- run: npx anchored-spec drift --fail-on-missing
- run: npx anchored-spec drift --check-map          # Semantic link freshness
- run: npx anchored-spec evidence validate           # Test evidence integrity
```

This ensures specs stay valid, generated docs don't go stale, semantic refs stay connected to code, and test evidence is current.

### Pre-commit Hook

Use `anchored-spec check --staged` as a git pre-commit hook to enforce governance on every commit:

```bash
# With Husky (recommended)
npx husky add .husky/pre-commit "npx anchored-spec check --staged"

# Or manually — add to .git/hooks/pre-commit:
#!/bin/sh
npx anchored-spec check --staged
```

This blocks commits that touch governed paths without an active change record.

## Verification Checks

`anchored-spec verify` runs 15+ quality and integrity checks:

1. **Schema validation** — All JSON files validate against their schemas
2. **Vague language detection** — Flags imprecise wording in behavior statements
3. **EARS compliance** — Verifies "response" field begins with "shall" format
4. **Route format validation** — Catches Express-style `:param` in semantic refs
5. **Semantic ref population** — Active/shipped requirements must have code anchors
6. **Unique ID enforcement** — Duplicate BS, variant, and rule IDs are flagged
7. **Policy quality** — Unique variant and rule IDs across workflow policy
8. **Cross-reference integrity** — REQ↔CHG bidirectional links are consistent
9. **Lifecycle rules** — Transition gates (e.g., shipped requires coverage)
10. **Dependency validation** — Missing references, blocked status derivation
11. **Cycle detection** — Circular requirement dependencies
12. **System name detection** — Flags technology names in behavioral text
13. **Test kind coverage** — Checks `testRefs` against `requiredTestKinds`
14. **File path existence** — Validates that `testRefs`, `traceRefs`, and `testFiles` paths exist on disk
15. **Bidirectional test linking** — Ensures test files reference the requirements that claim them

## Programmatic API

Anchored Spec exports its core engine for programmatic use:

```typescript
import {
  // Validation
  validateRequirement,
  checkRequirementQuality,
  checkFilePaths,

  // Loader
  SpecRoot,
  resolveConfig,

  // Policy
  evaluatePolicy,
  checkPaths,

  // Integrity
  checkCrossReferences,
  checkLifecycleRules,
  checkDependencies,
  detectCycles,

  // Drift detection (pluggable resolvers)
  detectDrift,

  // Test linking
  checkTestLinking,

  // Evidence pipeline
  collectEvidence,
  writeEvidence,
  validateEvidence,
  VitestParser,

  // Impact analysis
  analyzeImpact,
  generateImpactMap,

  // File discovery
  walkDir,
  discoverSourceFiles,

  // Hooks
  runHooks,

  // Plugins
  loadPlugins,
  runPluginChecks,
} from "anchored-spec";

// Validate a requirement
const result = validateRequirement(myReqJson);
console.log(result.valid, result.errors, result.warnings);

// Load all specs from a project
const spec = new SpecRoot("/path/to/project");
const requirements = spec.loadRequirements();
const changes = spec.loadChanges();

// Check changed paths against policy
const policy = spec.loadWorkflowPolicy();
const checkResult = checkPaths(
  ["src/auth.ts", "README.md"],
  policy,
  changes.filter((c) => c.status === "active"),
);
console.log(checkResult.valid, checkResult.uncoveredPaths);

// Run integrity checks
const crossRefErrors = checkCrossReferences(requirements, changes);
const depErrors = checkDependencies(requirements);

// Detect semantic drift with custom resolvers
const drift = detectDrift(requirements, {
  projectRoot: "/path/to/project",
  sourceRoots: ["src"],
  resolvers: [myCustomResolver],  // Optional — falls back to built-in
});
console.log(drift.summary); // { totalRefs, found, missing }

// Analyze file impact on requirements
const impact = analyzeImpact(
  ["src/auth/login.ts"],
  requirements,
  changes,
);
console.log(impact[0].matchedRequirements);

// Collect test evidence
const evidence = collectEvidence("vitest-report.json", "vitest", requirements);
writeEvidence(evidence, "specs/evidence/evidence.json");

// Check bidirectional test linking
const linking = checkTestLinking(requirements, "/path/to/project");
console.log(linking.summary); // { linkedTests, orphanTests, ... }
```

### Key Types

```typescript
import type {
  Requirement, Change, Decision, WorkflowPolicy,
  DriftResolver, DriftResolveContext,
  Evidence, EvidenceRecord, EvidenceParser,
  ImpactResult, ImpactMatch, ImpactMap,
  TestLinkReport, TestLinkFinding,
  HookDefinition, HookEvent,
  TestMetadataConfig,
  ValidationResult, ValidationError,
} from "anchored-spec";
```

## Plugin System

Create custom verification checks by writing a plugin:

```javascript
// .anchored-spec/plugins/no-orphan-tags.js
export default {
  name: "no-orphan-tags",
  checks: [
    {
      id: "unique-tags",
      description: "All tags must be used by at least 2 requirements",
      check: (ctx) => {
        const tagCounts = {};
        for (const req of ctx.requirements) {
          for (const tag of req.tags ?? []) {
            tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
          }
        }
        return Object.entries(tagCounts)
          .filter(([, count]) => count < 2)
          .map(([tag]) => ({
            path: "tags",
            message: `Tag "${tag}" is only used once`,
            severity: "warning",
          }));
      },
    },
  ],
};
```

Register it in `.anchored-spec/config.json`:

```json
{
  "specRoot": "specs",
  "plugins": ["./.anchored-spec/plugins/no-orphan-tags.js"]
}
```

## Pluggable Drift Resolvers

The built-in drift scanner uses regex to find semantic refs in source files. For AST-level accuracy or non-JS ecosystems, register custom resolvers:

```typescript
import type { DriftResolver } from "anchored-spec";

const tsResolver: DriftResolver = {
  name: "typescript-ast",
  kinds: ["interface", "symbol"],  // Only handle these kinds
  resolve(kind, ref, ctx) {
    // Return file paths where ref was found, or null to defer to built-in
    return myAstLookup(ref, ctx.projectRoot) ?? null;
  },
};

const drift = detectDrift(requirements, {
  projectRoot: "/path/to/project",
  resolvers: [tsResolver],  // Tried before built-in; null = fall through
});
```

Or configure via `.anchored-spec/config.json`:

```json
{
  "driftResolvers": ["./.anchored-spec/resolvers/typescript-ast.js"]
}
```

## Lifecycle Hooks

Run scripts after `create` and `transition` commands:

```json
{
  "hooks": [
    { "event": "post-create", "run": ".anchored-spec/hooks/scaffold-docs.sh" },
    { "event": "post-transition", "run": ".anchored-spec/hooks/update-board.sh" }
  ]
}
```

Hooks receive context as environment variables (`ANCHORED_SPEC_EVENT`, `ANCHORED_SPEC_ID`, `ANCHORED_SPEC_TYPE`, `ANCHORED_SPEC_STATUS`). Failing hooks warn but don't block. Use `--no-hooks` to skip.

## Test Evidence Pipeline

Prove that tests actually pass — don't just declare coverage:

```bash
# Run tests and generate a JSON report
npx vitest run --reporter=json --outputFile=vitest-report.json

# Ingest the report into an evidence artifact
npx anchored-spec evidence collect --from vitest-report.json --format vitest

# Validate evidence against requirements
npx anchored-spec evidence validate
```

Requirements can declare execution policy:

```json
{
  "verification": {
    "executionPolicy": { "requiresEvidence": true, "requiredKinds": ["unit"] }
  }
}
```

## Impact Analysis

Find which requirements are affected by file changes:

```bash
# Which requirements does this file affect?
npx anchored-spec impact src/auth/login.ts

# Machine-readable output
npx anchored-spec impact --json src/auth/login.ts

# Generate full impact map
npx anchored-spec impact --generate
```

Matching strategy: change scope patterns → semantic ref content matching → test ref path matching.

## Schema Extensions

All requirement, change, and decision schemas support an `extensions` field for project-specific metadata:

```json
{
  "id": "REQ-1",
  "extensions": {
    "jira": { "issueKey": "PROJ-123" },
    "compliance": { "level": "high" }
  }
}
```

Extensions are preserved through validation and generation. Validate them with plugins.

## Comparison with Other Tools

| Feature | Anchored Spec | Kiro | Spec-kit | Tessl |
|---|---|---|---|---|
| Spec persistence | ✅ Living contracts | ❌ Deleted after task | ⚠️ Branch-scoped | ✅ Spec-as-source |
| Machine enforcement | ✅ 8+ quality rules | ❌ None | ❌ Agent-interpreted | ⚠️ Limited |
| Workflow sizes | ✅ feature/fix/chore | ❌ One size | ❌ One size | ❌ One size |
| EARS notation | ✅ Structured | ❌ Freeform | ❌ Freeform | ❌ Freeform |
| Dual CJS/ESM | ✅ Both | N/A | ❌ ESM only | N/A |
| Brownfield support | ✅ Drop-in | ⚠️ IDE-specific | ✅ Drop-in | ❌ Greenfield only |
| IDE independence | ✅ Any editor | ❌ VS Code only | ✅ Any editor | ⚠️ Limited |
| Dry-run support | ✅ All commands | ❌ | ❌ | ❌ |

## Development

```bash
pnpm install
pnpm build          # Dual CJS + ESM build via tsup
pnpm test           # Run all tests (Vitest)
pnpm check-types    # TypeScript type-check
pnpm lint           # ESLint
pnpm verify         # All of the above
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

## License

[MIT](LICENSE)
