# Anchored Spec Instructions for Copilot

This example repository uses anchored-spec to keep architecture, documentation, and source changes reviewable together.

## Read first

- repository root `SKILL.md`
- `.anchored-spec/config.json`
- the `ea/` fixture set in this example

## How to think about this repo

- the framework is entity-native even when this example stores historical fixture data in `ea/`
- current CLI workflows still revolve around validation, drift, diff, traceability, and reconcile
- architecture changes should be made deliberately, with docs and source kept in sync

## Commands to use most often

```bash
npx anchored-spec --cwd examples/todo-app validate
npx anchored-spec --cwd examples/todo-app drift
npx anchored-spec --cwd examples/todo-app status
npx anchored-spec --cwd examples/todo-app report --view drift-heatmap
```

## Expectations

- preserve meaningful ownership, lifecycle, and relation data
- do not invent removed commands or old migration-only workflows
- prefer current framework language in explanations
- when editing docs, describe the current anchored-spec model accurately even if the example data set is historical
