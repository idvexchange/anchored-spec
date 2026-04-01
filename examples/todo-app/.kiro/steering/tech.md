# Technical Steering

This example uses anchored-spec as the architecture workflow layer around a modern web application.

## Technical expectations

- use the current anchored-spec command surface
- prefer entity-native terminology in explanations
- keep docs truthful to the shipped framework
- treat historical fixture data as example input, not as the default recommendation for new projects

## Common workflows

```bash
npx anchored-spec --cwd examples/todo-app validate
npx anchored-spec --cwd examples/todo-app drift
npx anchored-spec --cwd examples/todo-app report --view traceability-index
```
