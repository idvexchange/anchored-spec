---
ea-entities:
  - component:default/anchored-spec-repository-harness
---

# Repository Harness

Use this pattern when you want Anchored Spec to stay sparse and architecture-first while the repository keeps control of last-mile verification and follow-up actions.

## The split

Anchored Spec owns:

- top-level architecture truth
- stable CLI lookup for humans and agents
- validate, trace, drift, impact, context, and diff primitives
- suggestion-oriented handoff structures

The repository owns:

- exact task scoping
- exact filtered command plans
- focused versus broader verification choices
- baseline comparison
- mutating follow-up actions such as generators or migrations

## This repository's reference shape

This repository uses a thin local harness on top of Anchored Spec.

Keep the split explicit:

- `.anchored-spec/config.json` is project config
- `.anchored-spec/policy.json` is machine-readable routing and verification policy
- `.anchored-spec/query-packs/` holds repo-local discovery enrichment
- `scripts/` holds repo-local helper entrypoints

Docs explain the harness. They are not the machine-readable policy source.

## Public repo-local commands

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

## Recommended loop

1. start with `search` or a repo-local `task:start` wrapper
2. inspect direct relationships with `trace`
3. expand blast radius with `impact --with-commands`
4. inspect structured suggestions and adapter-derived targets
5. let the repository wrapper decide what to run next

Humans and agents should use the same control plane before the repo-local wrapper makes execution decisions.

## Why this boundary works

Field usage showed Anchored Spec is strongest when it stays:

- sparse
- typed
- queryable
- local

It becomes weaker when it is pushed toward:

- being the full task router
- being the full verification engine
- owning every practical workflow decision

The strongest outcome came from combining:

- Anchored Spec for stable architecture facts and query primitives
- repository scripts for task scoping and focused verification
- the CLI as the common human and agent surface

## Default rules

- keep the catalog at architectural boundaries such as apps, packages, major APIs, and major adapters
- use `trace` as the normal way to inspect dependencies and dependents
- treat discovery as optional pressure, not as the source of truth
- keep mutating actions separate from default verification
- do not duplicate top-level structural relationships in local policy files
- prefer one primary code location per top-level component

## Anti-patterns

Do not:

- treat Anchored Spec as the full task router
- treat tree-sitter as the primary routing control plane
- encode every low-level dependency in the catalog
- mix mutating follow-up actions into default verification
- let local policy become a second architecture graph
