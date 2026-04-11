# Agent Guide

This guide teaches an AI coding agent how to work correctly in an Anchored Spec repository.

## Core mental model

Anchored Spec is an entity-native architecture control plane.

- the source of truth is the entity model, not prose-only docs
- the authored format is Backstage-aligned YAML or markdown frontmatter
- runtime identifiers are canonical refs such as `component:default/orders-service`
- validation, traceability, discovery, drift, reporting, and AI context all hang off the same graph
- the framework owns architecture truth and stable query primitives
- repositories still own last-mile task execution

When a repository ships a thin local harness, prefer that harness for fresh-context routing and focused verification rather than rebuilding scope manually.

## Storage modes

### Manifest mode

Entities live in `catalog-info.yaml`, optionally with more YAML in configured catalog directories.

### Inline mode

Entities live in markdown frontmatter, usually inside `docs/`.

Preserve the repository’s current storage mode unless the user explicitly asks to migrate it.

## Modeling rules

- keep `metadata.name` stable once it is referenced elsewhere
- use canonical entity refs when ambiguity matters
- preserve `anchored-spec.dev/*` annotations
- prefer Backstage-native fields such as `owner`, `dependsOn`, `providesApis`, `consumesApis`, `system`, and `domain`
- treat derived `relations` output as analysis, not hand-maintained primary source
- prefer one primary `anchored-spec.dev/code-location` before adding lower-level file evidence

Prefer these built-in kinds first:

- `Component`
- `API`
- `Resource`
- `Group`
- `System`
- `Domain`

Use Anchored Spec custom kinds only when Backstage does not capture the concept well enough.

## Default workflows

### When creating architecture

1. choose the smallest correct kind
2. create the entity in the repository’s current storage mode
3. add relations using canonical refs
4. add or update linked docs if the change needs explanation
5. validate immediately

### When bootstrapping from reality

Prefer catalog synthesis first:

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --write catalog-info.yaml
npx anchored-spec catalog explain component:default/your-primary-component
```

Use discovery when you need broader resolver-driven extraction or source-specific expansion.

`catalog bootstrap` is planner-first and curated. `discover` is resolver-first and broad. Neither should be treated as final truth without review.

### When checking declared vs observed truth

Use drift:

```bash
npx anchored-spec drift
```

### When reviewing change sets

Use semantic review and change-aware analysis:

```bash
npx anchored-spec diff --base main --compat --policy
npx anchored-spec impact --with-commands --format json
npx anchored-spec constraints --format markdown
```

Treat `impact --with-commands` as a control-plane handoff. Prefer `architectureImpact`, `repositoryImpact`, and `suggestions` over assuming the framework should own final command orchestration.

### When assembling context

Use trace and context:

```bash
npx anchored-spec trace --summary
npx anchored-spec context component:default/orders-service --tier llm
```

## Documentation expectations

- describe entities as the primary architecture model
- use current command names only
- keep examples aligned with the actual CLI surface
- link docs back to canonical entity refs
- make the architecture-control-plane versus repository-harness split explicit when relevant

## Anti-patterns

Do not:

- create a second architecture format alongside the entity model
- switch storage modes without being asked
- use informal IDs as the primary runtime identifier
- treat discovery or inferred facts as final truth without review
- treat Anchored Spec as the full repo harness or canonical command planner
- document unsupported or removed commands as current

## Safe completion checklist

Before finishing meaningful architecture work, prefer to:

1. run `npx anchored-spec validate`
2. run `npx anchored-spec trace --summary` when docs or links changed
3. run `npx anchored-spec drift` when consistency matters
4. run `npx anchored-spec diff --base main --compat --policy` when reviewing a change set
