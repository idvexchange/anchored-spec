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
| `anchored-spec create change` | Create a new change record |
| `anchored-spec create decision` | Create a new decision (ADR) |
| `anchored-spec create <type> --dry-run` | Preview without writing files |
| `anchored-spec verify` | Run all validation checks |
| `anchored-spec verify --strict` | Treat warnings as errors |
| `anchored-spec generate` | Regenerate markdown from JSON |
| `anchored-spec generate --check` | Check if generated files are stale (CI-friendly) |
| `anchored-spec status` | Show health dashboard |
| `anchored-spec status --json` | Machine-readable status output |

## CI Integration

Add verification to your CI pipeline:

```yaml
# .github/workflows/ci.yml
- run: npx anchored-spec verify --strict
- run: npx anchored-spec generate --check
```

This ensures specs stay valid and generated docs don't go stale.

## Verification Checks

`anchored-spec verify` runs these checks:

1. **Schema validation** — All JSON files validate against their schemas
2. **Requirement quality** — No vague language, EARS compliance, unique BS IDs, semantic ref population
3. **Policy quality** — Unique variant and rule IDs
4. **Cross-reference integrity** — REQ↔CHG bidirectional links are consistent
5. **Lifecycle rules** — Transition gates are enforced (e.g., shipped requires coverage)

## Programmatic API

Anchored Spec also exports its core engine for programmatic use:

```typescript
import { validateRequirement, SpecRoot, evaluatePolicy } from "anchored-spec";

// Validate a requirement
const result = validateRequirement(myReqJson);
console.log(result.valid, result.errors, result.warnings);

// Load all specs from a project
const spec = new SpecRoot("/path/to/project");
const requirements = spec.loadRequirements();
const changes = spec.loadChanges();

// Evaluate policy against changed files
const policy = spec.loadWorkflowPolicy();
const evaluation = evaluatePolicy(changedPaths, policy);
```

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
