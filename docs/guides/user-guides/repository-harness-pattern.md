# Repository Harness Pattern

Use this pattern when you want Anchored Spec to stay sparse and architecture-first, while the repository keeps control of last-mile verification and follow-up actions.

## The split

Anchored Spec owns:

- top-level architecture truth
- stable CLI lookup for humans and agents
- validate, trace, drift, impact, and context primitives

The repository owns:

- exact filtered command plans
- local verification policy
- baseline comparison
- mutating follow-up actions such as generators or migrations

## Recommended loop

1. Find the top-level entity with `search` or an explicit ref.
2. Inspect direct relationships with `trace`.
3. Expand blast radius with `impact --with-commands`.
4. Inspect structured suggestions and any adapter-derived repository targets.
5. Let the repository wrapper decide what to run next.

## Human and AI usage

Humans and agents should use the same control plane:

- route to a top-level entity with `search`
- inspect direct dependencies and dependents with `trace`
- load focused docs with `context`
- hand suggested commands to a repo-local wrapper

That shared loop keeps architecture review, AI assistance, and local execution aligned on the same model.

Typical exploration flow:

```bash
npx anchored-spec search payments
npx anchored-spec trace component:default/payments-app
npx anchored-spec impact component:default/payments-app --with-commands --format json
npx anchored-spec context component:default/payments-app --focus-path src/domain/interfaces/user.ts --json
```

## Thin wrapper example

This is the intended shape: Anchored Spec suggests, the repository chooses.

```bash
#!/usr/bin/env bash
set -euo pipefail

target="${1:?entity ref required}"
plan_json="$(npx anchored-spec impact "$target" --with-commands --format json)"

echo "$plan_json" | jq -r '.commandPlan.architectureImpact.impactedEntityRefs[]?'
echo "$plan_json" | jq -r '.commandPlan.repositoryImpact.targets[]? | "\(.adapterId): \(.name) \(.path)"'
echo "$plan_json" | jq -r '.commandPlan.suggestions[]? | "\(.tier) \(.kind) \(.command)"'
echo "$plan_json" | jq -r '.commandPlan.commands[]?'
echo "$plan_json" | jq -r '.commandPlan.broaderCommands[]?'
echo "$plan_json" | jq -r '.commandPlan.actionCommands[]?'
```

That wrapper can then:

- use `suggestions` as the stable intent-level interface
- drop commands that are too broad for the current task
- prefer focused `typecheck` commands over tests by default
- require human approval before running `actionCommands`
- compare results to local baselines

If the repository uses a package manager, build tool, or internal execution system, keep that rendering logic in the repository layer or a repository-evidence adapter rather than in the architecture model itself.

If the repository needs to route from a component into code, start from the component's `anchored-spec.dev/code-location`. Treat extra file anchors, symbols, and tests as secondary evidence for narrowing or enrichment.

`context --focus-path` is optional. Use it when the repository keeps policy-based read-first rules that narrow which supporting docs matter for a particular changed path.

## Default rules

- Keep the catalog at architectural boundaries such as apps, packages, major APIs, and major adapters.
- Use `trace` as the normal way to inspect dependencies and dependents.
- Treat discovery as optional pressure, not as the source of truth.
- Keep mutating actions separate from focused verification.
- Do not duplicate top-level structural relationships in local policy files.

## Do and do not

Do:

- keep the entity graph sparse and reviewable
- use the CLI as the default fresh-context interface
- let repositories own the exact execution plan
- reserve repo-local hints for operational or non-structural adjacency
- prefer one primary code location per top-level component

Do not:

- treat Anchored Spec as the full task router
- treat tree-sitter as the primary control plane
- encode every low-level dependency in the catalog
- mix mutating follow-up actions into default verification
- let secondary file evidence replace explicit component boundaries
