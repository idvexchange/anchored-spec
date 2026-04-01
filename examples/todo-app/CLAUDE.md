# CLAUDE.md

This example repository is wired for anchored-spec architecture workflows.

## What matters here

- the application code lives beside a richer architecture fixture set
- the fixture set is useful for current anchored-spec validation, drift, diff, and policy workflows
- the root `SKILL.md` is the main operating guide for architecture-aware changes

## Default workflow

1. inspect the relevant code and architecture files
2. update the app and the architecture material together when the change affects behavior or structure
3. run current anchored-spec checks from the repository root with `--cwd examples/todo-app`
4. explain lifecycle, compatibility, or traceability impacts when relevant

## Useful commands

```bash
npx anchored-spec --cwd examples/todo-app validate
npx anchored-spec --cwd examples/todo-app drift
npx anchored-spec --cwd examples/todo-app diff --base main --compat --policy
npx anchored-spec --cwd examples/todo-app reconcile --include-docs
```
