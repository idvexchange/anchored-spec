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

## Quick Start

```bash
# Install
npm install --save-dev anchored-spec

# Initialize spec infrastructure
npx anchored-spec init

# Install AST resolver dependency (optional, for accurate drift detection)
npm install -D ts-morph

# Create your first requirement
npx anchored-spec create requirement --title "User can log in"

# Create a change record
npx anchored-spec create change --title "Add login" --type feature --slug add-login

# Verify everything
npx anchored-spec verify

# Generate markdown docs
npx anchored-spec generate

# Check project health
npx anchored-spec status
```

## What Gets Created

```
your-repo/
├── .anchored-spec/
│   └── config.json          # Framework configuration
├── specs/
│   ├── schemas/             # JSON Schema files (reference)
│   ├── requirements/        # REQ-*.json (behavioral specs)
│   ├── changes/             # CHG-*/change.json (work tracking)
│   ├── decisions/           # ADR-*.json (architecture decisions)
│   ├── generated/           # Generated markdown (gitignored)
│   └── workflow-policy.json # Governance rules
└── package.json             # Gets spec:* scripts added
```

## Documentation

Full documentation is in the [`docs/`](docs/) directory:

- **[Getting Started](docs/getting-started.md)** — Installation, initialization, and your first requirement
- **[Core Concepts](docs/concepts.md)** — Requirements, Change Records, Decisions, and Workflow Policy
- **[Commands Reference](docs/commands.md)** — Complete CLI command reference
- **[Configuration](docs/configuration.md)** — Config file, workflow policy, and schema extensions
- **[Drift Detection](docs/drift-detection.md)** — Semantic drift scanning, custom resolvers, and the TypeScript AST resolver
- **[Plugins & Hooks](docs/plugins-and-hooks.md)** — Custom verification plugins and lifecycle hooks
- **[Evidence & Impact](docs/evidence-pipeline.md)** — Test evidence pipeline, impact analysis, and traceability reports
- **[CI Integration](docs/ci-integration.md)** — GitHub Actions setup and pre-commit hooks
- **[Programmatic API](docs/programmatic-api.md)** — TypeScript library API for programmatic use
- **[Contributing](docs/contributing.md)** — Development setup, project structure, and guidelines

## Comparison with Other Tools

| Feature | Anchored Spec | Kiro | Spec-kit | Tessl |
|---|---|---|---|---|
| Spec persistence | ✅ Living contracts | ❌ Deleted after task | ⚠️ Branch-scoped | ✅ Spec-as-source |
| Machine enforcement | ✅ 15+ quality rules | ❌ None | ❌ Agent-interpreted | ⚠️ Limited |
| Workflow sizes | ✅ feature/fix/chore | ❌ One size | ❌ One size | ❌ One size |
| EARS notation | ✅ Structured | ❌ Freeform | ❌ Freeform | ❌ Freeform |
| Dual CJS/ESM | ✅ Both | N/A | ❌ ESM only | N/A |
| Brownfield support | ✅ Drop-in | ⚠️ IDE-specific | ✅ Drop-in | ❌ Greenfield only |
| IDE independence | ✅ Any editor | ❌ VS Code only | ✅ Any editor | ⚠️ Limited |
| AST drift detection | ✅ ts-morph resolver | ❌ | ❌ | ❌ |
| Evidence pipeline | ✅ Vitest/Jest/JUnit | ❌ | ❌ | ❌ |

## AI Agent Skill

Anchored Spec ships with **[SKILL.md](SKILL.md)** — an agent-agnostic instruction set that teaches AI coding agents to enforce SDD workflows. It works with GitHub Copilot, Cursor, Cline, Windsurf, Aider, and any other agent that reads project-root markdown.

To activate, add one line to your agent's configuration (e.g., `.github/copilot-instructions.md`, `.cursorrules`, `.clinerules`):

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

## Development

```bash
pnpm install
pnpm build          # Dual CJS + ESM build via tsup
pnpm test           # Run all tests (Vitest)
pnpm check-types    # TypeScript type-check
pnpm lint           # ESLint
pnpm verify         # All of the above
```

See [Contributing](docs/contributing.md) for the full development guide.

## License

[MIT](LICENSE)
