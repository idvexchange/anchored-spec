# CLAUDE.md — Anchored Spec Project

Spec-as-source EA framework. Architecture = validated YAML/JSON artifacts, not docs.

## Read First
- `SKILL.md` — Complete AI agent instruction set (26 sections, 15 workflows). READ THIS.
- `.anchored-spec/config.json` — Project configuration

## Structure
`ea/` contains EA artifacts across domains:
- `ea/systems/` — systems
- `ea/delivery/` — delivery
- `ea/data/` — data
- `ea/information/` — information
- `ea/business/` — business
- `ea/transitions/` — transitions

## Commands
- `npx anchored-spec validate` — Validate artifacts
- `npx anchored-spec create --kind <kind> --title "Name"` — Create artifact
- `npx anchored-spec discover` — Discover from code/infra
- `npx anchored-spec drift` — Check drift
- `npx anchored-spec diff --base main` — Semantic diff
- `npx anchored-spec reconcile` — Full SDD pipeline

## Key Rules
- Always validate after changes
- Artifacts use `id: {PREFIX}-{slug}` format (e.g., APP-todo-web, API-v1)
- Relations reference artifact IDs, not paths
- Discovered artifacts are `draft` + `inferred` — never auto-promote
