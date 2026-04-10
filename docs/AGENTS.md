# [CONTEXT] Documentation Router

Use this file to load only the docs relevant to the current task. Do not read all of `docs/` by default.

## Default Flow

1. Read [../AGENTS.md](../AGENTS.md).
2. Run `pnpm task:start --changed` for active work, or `pnpm task:start <path...>` for explicit scope.
3. Read only the docs in `.anchored-spec/task-brief.json` under `readFirst`.
4. Use the brief's `lookupCommands` before opening raw architecture files when an entity was matched.
5. Run `pnpm task:verify` after scoped changes when you want machine-readable verification feedback.

## Common Routing

| Task Type | Read First |
| --- | --- |
| CLI command behavior or machine output | `04-component/anchored-spec-cli.md`, `06-api/cli-api.md` |
| EA runtime, graph, model, or loader behavior | `04-component/anchored-spec-library.md`, `05-domain/domain-model.md`, `05-domain/interfaces.md` |
| Discovery, resolvers, or tree-sitter enrichment | `guides/user-guides/bottom-up-discovery.md`, `04-component/anchored-spec-library.md` |
| Traceability, docs scanning, or context assembly | `04-component/anchored-spec-library.md`, `req/REQ-002-traceability-and-context-assembly.md` |
| Reports, impact, constraints, diff, policy, reconcile, or verify | `guides/user-guides/reporting-and-analysis.md`, `06-api/node-api.md`, `req/REQ-004-semantic-change-governance.md` |
| Harness, task briefs, workflow policy, or agent guidance | `guides/developer-guides/agent-harness.md`, `guides/user-guides/repository-harness-pattern.md`, `adr/ADR-007-control-plane-and-repository-harness-boundary.md` |

## Notes

- Treat `.anchored-spec/task-brief.json` as the canonical handoff artifact for repo-local workflow context.
- Treat `.anchored-spec/policy.json` as the canonical machine-readable harness policy.
- Keep `catalog-info.yaml` and linked docs sparse. The harness narrows execution, not the architecture model.
- Prefer `anchored-spec context` and `anchored-spec trace` over manually scanning `catalog-info.yaml` once the brief gives you an entity ref.
