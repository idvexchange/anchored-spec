---
ea-entities:
  - component:default/anchored-spec-repository-harness
---

# Agent Harness

This repository uses a thin local harness on top of Anchored Spec.

## Intent

Use the harness to do three things well:

1. route quickly to the right framework surface
2. generate a narrow machine-readable task brief
3. run scoped verification without turning Anchored Spec into the full repo harness

Anchored Spec still owns:

- the architecture model
- `search`, `trace`, `context`, `impact`, `validate`, and `drift`
- command-plan suggestions from workflow policy and repository evidence

This repository owns:

- exact task scoping
- the final focused command list
- optional baseline tracking
- explicit execution observability

## Reference Shape

Keep the harness split explicit:

- `.anchored-spec/config.json` is the project config
- `.anchored-spec/policy.json` is the machine-readable routing and verification policy
- `.anchored-spec/query-packs/` holds repo-local discovery enrichment
- `scripts/` holds repo-local helper entrypoints

Docs explain the harness. They are not the machine-readable policy source.

## Public Surface

Use only these repo-local commands:

```bash
pnpm task:start --changed
pnpm task:start <path...>
pnpm task:start --base main
pnpm task:start --ask "fix CLI context output"
pnpm task:verify
pnpm task:verify --broader
pnpm task:verify --update-baseline
pnpm task:check
pnpm task:close
```

## Artifacts

The harness writes:

- `.anchored-spec/task-brief.json`
- `.anchored-spec/verification-report.json`
- `.anchored-spec/verification-baseline.json`
- `.anchored-spec/execution-report.json`

These are local workflow artifacts. Do not treat them as architecture source of truth.

## Expected Loop

1. Start with `pnpm task:start ...`.
2. Read only `readFirst`, then use `lookupCommands` for matched entities.
3. Make the scoped change.
4. Run `pnpm task:verify` for focused checks.
5. If needed, record actual reads and commands with `pnpm task:close`.

For baseline-managed scopes, the verification report will recommend `pnpm task:verify --update-baseline` when no baseline exists yet.

## Maintenance Rules

- Keep the harness thin and repo-specific.
- Prefer extending the existing `task:*` commands over adding new wrappers.
- Keep default verification non-mutating.
- Use `.anchored-spec/policy.json` for read-first rules and harness routing hints.
- Keep `AGENTS.md`, `docs/guides/user-guides/SKILL.md`, `docs/guides/user-guides/llms.txt`, and `docs/guides/user-guides/llms-full.txt` aligned when the workflow changes.
