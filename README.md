# Anchored Spec

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
│   ├── changes/             # CHG-*/change.json (work tracking)
│   ├── decisions/           # ADR-*.json (architecture decisions)
│   ├── generated/           # Generated markdown (don't edit)
│   └── workflow-policy.json # Governance rules
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
| `anchored-spec create requirement` | Create a new requirement |
| `anchored-spec create change` | Create a new change record |
| `anchored-spec create decision` | Create a new decision (ADR) |
| `anchored-spec verify` | Run all validation checks |
| `anchored-spec verify --strict` | Treat warnings as errors |
| `anchored-spec generate` | Regenerate markdown from JSON |
| `anchored-spec generate --check` | Check if generated files are stale |
| `anchored-spec status` | Show health dashboard |
| `anchored-spec status --json` | Machine-readable status output |

## Verification Checks

`anchored-spec verify` runs these checks:

1. **Schema validation** — All JSON files validate against their schemas
2. **Requirement quality** — No vague language, EARS compliance, semantic ref population
3. **Workflow policy** — Policy structure is valid
4. **Cross-reference integrity** — REQ↔CHG bidirectional links are consistent
5. **Lifecycle rules** — Transition gates are enforced (e.g., shipped requires coverage)

## Comparison with Other Tools

| Feature | Anchored Spec | Kiro | Spec-kit | Tessl |
|---|---|---|---|---|
| Spec persistence | ✅ Living contracts | ❌ Deleted after task | ⚠️ Branch-scoped | ✅ Spec-as-source |
| Machine enforcement | ✅ 5+ lint rules | ❌ None | ❌ Agent-interpreted | ⚠️ Limited |
| Workflow sizes | ✅ feature/fix/chore | ❌ One size | ❌ One size | ❌ One size |
| EARS notation | ✅ Structured | ❌ Freeform | ❌ Freeform | ❌ Freeform |
| Brownfield support | ✅ Drop-in | ⚠️ IDE-specific | ✅ Drop-in | ❌ Greenfield only |
| IDE independence | ✅ Any editor | ❌ VS Code only | ✅ Any editor | ⚠️ Limited |

## Packages

| Package | Description |
|---|---|
| `@anchored-spec/core` | Schemas, validation, policy engine, generators |
| `@anchored-spec/cli` | CLI commands (init, create, verify, generate, status) |

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
