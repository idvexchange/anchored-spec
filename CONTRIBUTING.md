# Contributing

Thanks for considering a contribution to Anchored Spec. This file is the single landing page for everyone working *on this repository*. People using the `anchored-spec` package should start with the [README](README.md) and the [documentation portal](docs/README.md) instead.

Deeper repository conventions, architecture ownership, and documentation standards live in [docs/maintainers/contributing.md](docs/maintainers/contributing.md). This file gives you the practical entry points; that one gives you the full rules of the road.

## Repository layout

```text
.
├── .anchored-spec/
│   └── config.json
├── catalog-info.yaml
├── docs/
│   ├── start/
│   ├── workflows/
│   ├── maintainers/
│   ├── archive/
│   ├── 01-business/
│   ├── 02-system-context/
│   ├── 03-container/
│   ├── 04-component/
│   ├── 05-domain/
│   ├── 06-api/
│   ├── 07-data/
│   ├── 08-security/
│   ├── 09-infrastructure/
│   ├── 10-testing/
│   ├── README.md
│   └── glossary.md
├── scripts/
├── src/
│   ├── cli/
│   ├── ea/
│   ├── resolvers/
│   └── test-helpers/
└── package.json
```

`docs/` is an architecture-first documentation set organized into `start/`, `workflows/`, `maintainers/`, `archive/`, and the numbered architecture reference views. The implementation lives primarily under `src/cli/` and `src/ea/`, with supporting resolver helpers under `src/resolvers/`. Repo-local task routing and verification helpers live under `scripts/`.

## Working on this repo

This repository uses a thin repo-local harness on top of Anchored Spec itself. For non-trivial work, start there — it routes you to the right entities and docs before you touch implementation files:

```bash
pnpm task:start --changed
pnpm task:start <path...>
pnpm task:verify
pnpm task:check
```

Use `task:start` for fresh context, then follow the brief's `readFirst` and `lookupCommands` before broader file scanning. The harness is repo-local workflow glue; the framework still owns the architecture model and CLI primitives.

Reference layout for this repo:

- `catalog-info.yaml` keeps the top-level architecture model sparse and reviewable
- `.anchored-spec/config.json` and `.anchored-spec/policy.json` hold machine-readable framework and harness collateral
- `.anchored-spec/query-packs/` holds repo-local discovery enrichment
- `scripts/` holds repo-local task routing and verification helpers

## Development commands

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run verify
```

Do not run `pnpm vitest run` and `pnpm build` in parallel — some CLI tests read `dist/`, and concurrent build output can cause false failures.

## Before opening a pull request

- Update tests alongside any framework behavior change.
- Update docs alongside any public behavior change.
- Run `pnpm exec anchored-spec validate` when you change docs, entities, or architecture-affecting behavior.
- Add a `CHANGELOG.md` entry under `## [Unreleased]` for user-visible changes.

## Further reading

The deeper maintainer guide covers repository ownership, documentation and catalog update expectations, and manifest-mode standards for this repo:

- [docs/maintainers/contributing.md](docs/maintainers/contributing.md)
- [AGENTS.md](AGENTS.md) — operating conventions for AI agents and contributors working in this repo
