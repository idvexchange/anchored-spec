# Anchored Spec

[![CI](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/idvexchange/anchored-spec/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/anchored-spec)](https://www.npmjs.com/package/anchored-spec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Spec-as-source enterprise architecture framework — architecture models as living code.

**Anchored Spec** turns your repository into a living architecture model. Define services, APIs, deployments, data stores, and business capabilities as machine-validated JSON/YAML artifacts. The framework validates schemas, detects drift between specs and reality, discovers infrastructure and doc/prose facts via resolvers, and generates documentation — all from the spec files in your repo.

## Key Features

| Feature | Description |
|---|---|
| **48 artifact kinds** | Services, APIs, deployments, data stores, business capabilities, and more across 6 domains |
| **27 typed relations** | `dependsOn`, `implementedBy`, `consumesApi`, `deployedTo`, etc. with graph visualization |
| **8 resolvers** | Auto-discover from OpenAPI, Kubernetes, Terraform, SQL DDL, dbt, Tree-sitter (code analysis), Markdown (prose facts), and Anchors (code symbols) |
| **52 drift rules** | Domain-specific drift detection between declared specs and observed reality |
| **Transition planning** | Baselines, targets, migration waves, and gap analysis |
| **Evidence pipeline** | Link test results to artifacts via Vitest/Jest/JUnit adapters |
| **Schema validation** | 55 JSON Schemas with quality rules and confidence tracking |
| **Graph & reports** | Mermaid, DOT, and JSON graph output; 6 built-in report views |
| **IDE integration** | VS Code autocomplete, validation, and snippets via `init --ide`; AI config with reusable slash commands for Copilot and Claude, event-driven hooks for Kiro, and Spec-Kit extension via `init --ai` |
| **Document traceability** | Bidirectional trace links between markdown docs and artifacts; context assembly for AI agents; auto-sync via `link-docs` |
| **Doc consistency** | Extract facts from markdown tables, code blocks, and Mermaid diagrams — detect cross-document contradictions |
| **SchemaStore integration** | Catalog entries for config, workflow-policy, and EA artifact schemas — automatic validation in any editor that supports [SchemaStore](https://www.schemastore.org/) |

## Quick Start

```bash
# Install
npm install --save-dev anchored-spec

# Initialize EA project
npx anchored-spec init

# Set up VS Code autocomplete, snippets, and validation
npx anchored-spec init --ide

# Generate AI assistant config files (Copilot, Claude, Kiro, Spec-Kit)
npx anchored-spec init --ai all

# Generate CI workflow and pre-commit hook
npx anchored-spec init --ci

# Create your first artifact
npx anchored-spec create --kind service --id SVC-auth-api

# Or use the interactive wizard
npx anchored-spec create --interactive

# Validate all artifacts
npx anchored-spec validate

# View architecture graph
npx anchored-spec graph --format mermaid

# Run drift detection
npx anchored-spec drift

# Show traceability between artifacts and docs
npx anchored-spec trace --summary

# Assemble AI context for an artifact
npx anchored-spec context SVC-auth-api

# Check project status
npx anchored-spec status
```

## Project Structure

```
your-repo/
├── .anchored-spec/
│   └── config.json          # v1.0 configuration
├── ea/
│   ├── systems/             # Services, applications, APIs, integrations
│   ├── delivery/            # Deployments, platforms, cloud resources
│   ├── data/                # Data stores, models, lineage
│   ├── information/         # Entities, classifications, exchanges
│   ├── business/            # Capabilities, processes, controls
│   ├── transitions/         # Baselines, targets, migration plans
│   └── legacy/              # Migrated REQ/CHG/ADR artifacts
└── package.json
```

## CLI Commands

| Command | Description |
|---|---|
| `init` | Initialize project with v1.0 config (`--ide`, `--ai`, `--ci`) |
| `create` | Create a new EA artifact (`--interactive` / `-i` for step-by-step wizard) |
| `validate` | Validate artifacts against schemas and quality rules |
| `graph` | Generate architecture dependency graph |
| `report` | Generate architecture reports |
| `drift` | Detect drift between specs and source |
| `discover` | Auto-discover artifacts from resolvers (including markdown prose) |
| `generate` | Run code generators from specs |
| `evidence` | Manage test evidence and traceability |
| `impact` | Analyze impact of changes across dependencies |
| `status` | Show artifact lifecycle status |
| `transition` | Manage artifact status transitions |
| `diff` | Semantic spec diff with compatibility and policy checks |
| `reconcile` | Full SDD pipeline: generate → validate → drift |
| `trace` | Show traceability web between artifacts and docs |
| `link-docs` | Auto-sync trace links between docs and artifacts |
| `context` | Assemble AI context package from trace graph |
| `link` | Create a relation between two artifacts (`--type`, `--dry-run`) |
| `search` | Search artifacts by ID, name, kind, summary, tags (`--kind`, `--domain`, `--json`) |
| `create-doc` | Create markdown doc pre-linked to artifacts |

## Documentation

Full documentation is in the [`docs/`](docs/) directory:

### Getting Started
- **[Design Overview](docs/ea-design-overview.md)** — Architecture, key concepts, and module layout
- **[Adoption Playbook](docs/ea-adoption-playbook.md)** — Practical brownfield adoption guide
- **[Implementation Guide](docs/ea-implementation-guide.md)** — Step-by-step implementation reference

### Core Model
- **[Unified Artifact Model](docs/ea-unified-artifact-model.md)** — 48 artifact kinds across 6 domains
- **[Relationship Model](docs/ea-relationship-model.md)** — 27 typed relations between artifacts
- **[Transitions & Evidence](docs/ea-transitions-evidence-reporting.md)** — Baselines, targets, and migration planning

### Tooling
- **[Drift, Resolvers & Generators](docs/ea-drift-resolvers-generators.md)** — Drift detection, resolvers, and code generation
- **[Visualization](docs/ea-visualization.md)** — Architecture graph rendering and export
- **[CI Integration](docs/ea-ci-integration.md)** — CI pipeline setup for validation and drift
- **[Governed Evolution](docs/ea-governed-evolution.md)** — Spec diffing, compatibility checks, reconcile pipeline, version policies

### Reference
- **[Schema Evolution](docs/ea-schema-evolution.md)** — Schema versioning and migration
- **[Glossary](docs/ea-glossary.md)** — NIST/TOGAF term mapping and definitions
- **[Migration from v0.x](docs/migration-from-v0.md)** — Upgrading from legacy spec-anchored model
- **[Contributing](docs/contributing.md)** — Development setup and guidelines

## AI Agent Skill

Anchored Spec ships with **[SKILL.md](SKILL.md)** — an agent-agnostic instruction set (27 sections, 16 workflows) that teaches AI coding agents to work with the EA framework. It works with GitHub Copilot, Cursor, Cline, Windsurf, Aider, and any agent that reads project-root markdown.

```
Read and follow the rules in SKILL.md for all code changes in this repository.
```

**Day-to-day workflow prompts** you can use with any AI agent:

```
# Spec-first implementation
Add a new payment gateway service. Follow the spec-first workflow in SKILL.md.

# Explain changes before merging
What changed in this branch compared to main? Walk me through the impact.

# Pre-implementation audit
I need to modify the order entity. Audit the relevant specs before I start coding.

# Architecture onboarding
I'm new to this codebase. Give me an architecture overview using the EA model.

# Confidence audit
Run a confidence audit — find artifacts that are decaying or missing coverage.

# Impact assessment
What would break if we retired SVC-legacy-auth? Show me the full dependency chain.

# Compatibility check
Is this PR safe to merge? Check for breaking changes against main.
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
