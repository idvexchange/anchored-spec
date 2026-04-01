# Visualization

Anchored Spec can render the entity graph in formats that are useful for review, debugging, and documentation.

## Graph output

Use the `graph` command to export the architecture graph.

```bash
npx anchored-spec graph --format mermaid
npx anchored-spec graph --format dot
npx anchored-spec graph --format json
```

## When to use each format

- **Mermaid** — quick human-readable diagrams in docs and pull requests
- **DOT** — more advanced graph tooling and rendering pipelines
- **JSON** — programmatic analysis and custom visualization work

## Good visualization habits

The most useful architecture graphs are focused.

Good graphing patterns:

- center on a specific entity before graphing the whole repo
- slice by domain when the full graph is noisy
- use graph output to accompany semantic diffs or impact analysis
- pair graph views with trace and report views during review

## Visualization as review support

Graph output is especially helpful when:

- onboarding a new engineer to a subsystem
- explaining the blast radius of a change
- showing how a component, API, and resource fit together
- reviewing transition plans and dependency chains
