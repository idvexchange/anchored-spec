# AGENTS.md

## Purpose

Working conventions for AI agents and contributors in this repository.

This repository builds Anchored Spec itself. Agents must use the framework while working here.

## Source Of Truth

- The primary architecture model lives in [`catalog-info.yaml`](./catalog-info.yaml).
- Architecture and implementation guidance live under [`docs/`](./docs/README.md).
- Agent-specific operating guidance for framework users lives in [`docs/guides/user-guides/SKILL.md`](./docs/guides/user-guides/SKILL.md), [`docs/guides/user-guides/llms.txt`](./docs/guides/user-guides/llms.txt), and [`docs/guides/user-guides/llms-full.txt`](./docs/guides/user-guides/llms-full.txt).
- Machine-readable framework collateral for this repo lives under [`.anchored-spec/`](./.anchored-spec/), especially [`.anchored-spec/config.json`](./.anchored-spec/config.json) and [`.anchored-spec/policy.json`](./.anchored-spec/policy.json).

## Non-Negotiable Rule

- **Use Anchored Spec as the first routing and reasoning surface for any non-trivial task in this repo.**
- Do not start by scanning source files blindly when the framework can give you the owning entity, docs, trace links, or impact surface.
- For planning, code changes, docs changes, and reviews, prefer the CLI over ad-hoc repo guessing.
- Exception: trivial single-file edits with obviously local scope, such as typo fixes or comment wording, may skip the CLI.

## Fresh Context

Start with the smallest Anchored Spec lookup loop that fits the task:

```bash
pnpm task:start --changed
pnpm task:start <path...>
pnpm task:start --ask "<task>"
```

Use these rules:

- For non-trivial work in this repository, use `pnpm task:start` before broad file scanning.
- Treat [`.anchored-spec/task-brief.json`](./.anchored-spec/task-brief.json) as the canonical repo-local handoff artifact.
- Use `lookupCommands` from the task brief before opening raw architecture files when the brief already matched entities.
- If the task mentions a component, system, API, resource, decision, or requirement, resolve it to a canonical entity ref first.
- If the owning entity is unclear, run `search` before opening implementation files.
- If the task may affect relationships, docs, or downstream behavior, run `trace` or `impact` before editing.
- If the task changes docs, behavior, or architecture framing, use `context` to load the smallest relevant slice of repo guidance.

After scoped changes, prefer:

```bash
pnpm task:verify
pnpm task:verify --broader
pnpm task:close
```

## Repo-Specific Expectations

- Package manager: `pnpm`
- Build output: `dist/`
- Repo-local helper entrypoints live in `scripts/`
- Main implementation areas:
  - `src/cli/`
  - `src/ea/`
  - `src/resolvers/`
  - `src/test-helpers/`
- Primary architecture docs and guides live in `docs/`

This repo is not a normal product monorepo. It is the framework repo. That means:

- when changing framework behavior, update tests with the change
- when changing public behavior, update docs with the change
- when changing agent-facing guidance, keep `AGENTS.md`, `docs/guides/user-guides/SKILL.md`, `docs/guides/user-guides/llms.txt`, and `docs/guides/user-guides/llms-full.txt` aligned

## Reading Discipline

- Prefer `pnpm task:start` over ad-hoc repo scanning for fresh context.
- Prefer `anchored-spec search`, `trace`, `context`, and `impact` before opening raw files.
- Read the smallest relevant slice of [`docs/`](./docs/README.md). Do not read the whole docs tree by default.
- Read [`catalog-info.yaml`](./catalog-info.yaml) directly when editing the architecture model or when exact entity metadata matters.
- Treat [`.anchored-spec/policy.json`](./.anchored-spec/policy.json) as the canonical machine-readable harness policy.
- Prefer focused file reads over broad repo scans.
- Avoid exploring generated or heavy directories unless the task requires them:
  - `dist/`
  - `coverage/`
  - `node_modules/`
  - `.obsidian/`
  - `.anchored-spec/cache/`

## Mandatory Workflows

### For architecture or docs changes

Use the framework directly:

```bash
pnpm exec anchored-spec validate
pnpm exec anchored-spec trace --summary
```

If the change affects architecture meaning or review guidance, also use:

```bash
pnpm exec anchored-spec context <entity-ref> --tier llm
pnpm exec anchored-spec diff --base main --compat --policy
```

### For behavior changes

- identify the owning entity first
- inspect direct relationships with `trace`
- inspect downstream blast radius with `impact --with-commands`
- then edit code

Treat `architectureImpact`, `repositoryImpact`, and `suggestions` as the structured handoff. Do not invent a parallel routing model.

### For bootstrap or modeling tasks

Prefer:

```bash
pnpm exec anchored-spec catalog bootstrap --dry-run
```

Do not jump straight to broad discovery unless the task is explicitly about discovery behavior.

## Validation

Use the smallest credible validation first, then the full repo checks when needed.

Typical repo checks:

```bash
pnpm task:check
pnpm task:verify
pnpm vitest run
pnpm exec tsc --noEmit
pnpm build
```

Additional framework checks when relevant:

```bash
pnpm exec anchored-spec validate
pnpm exec anchored-spec drift
pnpm exec anchored-spec diff --base main --compat --policy
```

Important:

- Do not run `pnpm vitest run` and `pnpm build` in parallel in this repo. Some CLI tests read `dist/`, and concurrent build output can create false failures.
- Treat `actionCommands` from task briefs or verification reports as intentional follow-up mutations, not default verification.

## Editing Guidelines

- Keep changes minimal and aligned with the existing architecture direction.
- Do not introduce a second architecture source of truth beside Anchored Spec entities and linked docs.
- Prefer Backstage-native modeling first. Use Anchored Spec-specific constructs only when needed.
- Prefer `anchored-spec.dev/code-location` as the primary code link for a top-level component.
- Keep machine-readable harness collateral in `.anchored-spec/` and repo-local execution helpers in `scripts/`.
- Treat file anchors, symbols, tests, and repository-evidence adapters as supporting evidence.

## Anti-Patterns

Do not:

- treat this repo like a plain codebase with no architecture layer
- bypass Anchored Spec for fresh-context planning on non-trivial tasks
- treat discovery or tree-sitter findings as primary architecture truth
- turn Anchored Spec into the full repo harness in docs or code
- add Node- or package-manager-specific assumptions to generic core behavior unless they are isolated behind adapters

## Completion Checklist

Before finishing meaningful work, prefer to:

1. run the relevant Anchored Spec lookup flow again and confirm the change still aligns with the entity model
2. run `pnpm exec anchored-spec validate` when docs, entities, or architecture behavior changed
3. run targeted tests or the full verification loop as appropriate
4. update docs when public behavior or framework positioning changed
5. report what changed, how it was validated, and any remaining limits clearly
