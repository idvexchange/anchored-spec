# Anchored Spec Skill

This file teaches an AI coding agent how to work correctly in an anchored-spec repository.

## When this skill applies

Use this skill when the repository contains any of these:

- `.anchored-spec/config.json`
- `catalog-info.yaml`
- Markdown files with Backstage entity frontmatter
- anchored-spec examples or generated AI scaffolding

If the repository does not use anchored-spec, do not force these workflows onto the user.

## What the framework expects

Anchored Spec is an entity-native architecture framework.

- Architecture is authored as Backstage-aligned entities.
- The source of truth is descriptor YAML or Markdown frontmatter, not ad-hoc prose.
- Runtime identifiers are canonical entity refs such as `component:default/orders-service`.
- Built-in Backstage kinds should be preferred over custom kinds whenever possible.
- Docs, relations, drift checks, and generation all hang off the authored entity graph.

## Storage modes

### Manifest mode

Entities live in `catalog-info.yaml`, optionally with extra YAML files loaded from `catalogDir`.

### Inline mode

Entities live in Markdown frontmatter inside configured doc directories such as `docs/`.

The agent must preserve the repository's existing storage mode unless the user explicitly asks to migrate it.

## Entity rules

Every entity must be valid Backstage-style YAML:

- `apiVersion`
- `kind`
- `metadata`
- `spec`

Agent expectations:

- keep `metadata.name` stable once referenced elsewhere
- use full entity refs in docs and commands when ambiguity matters
- preserve `anchored-spec.dev/*` annotations
- use Backstage-authored spec fields where they exist, such as `owner`, `dependsOn`, `providesApis`, `consumesApis`, `system`, and `domain`
- treat derived runtime `relations` as analysis output, not authored source

## Kinds

Prefer these built-in kinds first:

- `Component`
- `API`
- `Resource`
- `Group`
- `System`
- `Domain`

Use custom kinds only when the concept is genuinely architectural and not covered by Backstage:

- `Requirement`
- `Decision`
- `CanonicalEntity`
- `Exchange`
- `Capability`
- `ValueStream`
- `Mission`
- `Technology`
- `SystemInterface`
- `Control`
- `TransitionPlan`
- `Exception`

## Default workflows

### Create

When the user asks for a new architectural element:

1. choose the best fitting kind
2. create the entity in the repository's storage mode
3. add relations using current entity refs
4. update linked docs if the change needs documentation
5. validate immediately

Typical commands:

```bash
npx anchored-spec create application --title "Orders Service"
npx anchored-spec validate
```

### Update

When editing an existing model:

1. locate the entity by canonical ref or exact file
2. update the entity and any directly linked docs together
3. keep lifecycle, owner, and relation fields coherent
4. re-run validation or drift checks appropriate to the change

### Discover

Use discovery when the user wants to bootstrap from reality:

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml
npx anchored-spec discover
```

Discovered entities are drafts until a human reviews and promotes them.

### Drift

Use drift when the user wants to compare declaration to observation:

```bash
npx anchored-spec drift
npx anchored-spec drift --domain docs
```

Docs drift includes fact extraction from tables, code blocks, lists, Mermaid diagrams, and frontmatter.

### Diff and reconcile

Use semantic diff for change review:

```bash
npx anchored-spec diff --base main --compat --policy
```

Use reconcile for a project-wide loop:

```bash
npx anchored-spec reconcile --include-trace --include-docs
```

### Traceability

Use trace and context when the user needs the full connected picture:

```bash
npx anchored-spec trace --summary
npx anchored-spec context component:default/orders-service
npx anchored-spec link-docs --sync
```

## Documentation expectations

Agents should write documentation that reflects the current shipped framework.

- describe entities, not “entities” unless referring to older historical examples
- use current command names only
- do not describe removed migration commands as available
- do not invent unsupported storage modes or generators
- keep examples aligned with manifest or inline entity authoring

## Evidence, reports, and generation

Current framework capabilities to keep in mind:

- evidence ingest, validate, and summary commands exist
- reports include system/data, classification, capability, gap, exception, drift heatmap, and traceability views
- generators currently cover OpenAPI and JSON Schema
- semantic diff and version policy enforcement are first-class workflows

## Anti-patterns

Do not:

- create a second architecture format alongside the entity model
- switch between inline and manifest storage without being asked
- use old entity IDs like `SVC-foo` as the main runtime identifier
- claim remote descriptor substitution support by default
- describe removed commands like `migrate-config`, `migrate-previous`, `enrich`, or `move` as current

## Safe completion checklist

Before finishing meaningful architecture changes, prefer to:

1. run `npx anchored-spec validate`
2. run `npx anchored-spec drift` when source-of-truth consistency matters
3. run `npx anchored-spec trace` or `link-docs` when docs were involved
4. summarize lifecycle, relation, or compatibility impacts for the user
