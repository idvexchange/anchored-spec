# Getting Started

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

## Initialize Your Project

```bash
npx anchored-spec init
```

This creates the spec infrastructure in your project:

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

### Init Options

| Flag | Effect |
|------|--------|
| `--bare` | Skip adding the TypeScript AST drift resolver — regex-only scanning |
| `--dry-run` | Preview what would be created without writing anything |
| `--no-examples` | Skip creating the starter REQ-1.json example file |
| `--spec-root <path>` | Use a custom directory instead of `specs/` |

## Your First Requirement

```bash
npx anchored-spec create requirement --title "User can log in"
```

This creates a JSON file like `specs/requirements/REQ-1.json` with EARS-formatted behavior statements:

```json
{
  "id": "REQ-1",
  "title": "User can log in",
  "behaviorStatements": [
    {
      "id": "BS-1",
      "text": "When a user submits valid credentials, the system shall return an auth token.",
      "format": "EARS",
      "trigger": "user submits valid credentials",
      "response": "the system shall return an auth token"
    }
  ]
}
```

## Create a Change Record

```bash
npx anchored-spec create change --title "Add login" --type feature --slug add-login
```

Change records link implementation work to requirements and carry file scope, phase tracking, and a verification sidecar.

## Verify Everything

```bash
npx anchored-spec verify
```

This runs 15+ quality and integrity checks across all your specs — schema validation, cross-reference integrity, EARS compliance, vague language detection, and more.

## Generate Documentation

```bash
npx anchored-spec generate
```

Produces human-readable markdown from your JSON specs into `specs/generated/`.

## Check Project Health

```bash
npx anchored-spec status
```

Shows a dashboard of requirement counts, change status, and overall project health.

## Next Steps

- Read [Core Concepts](concepts.md) to understand requirements, changes, and decisions
- See [Commands Reference](commands.md) for the full CLI
- Set up [CI Integration](ci-integration.md) to enforce specs in your pipeline
