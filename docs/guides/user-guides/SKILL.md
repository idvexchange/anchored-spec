# Anchored Spec Skill

This file teaches an AI coding agent how to work correctly in an Anchored Spec repository.

## When this skill applies

Use this skill when the repository contains any of these:

- `.anchored-spec/config.json`
- `catalog-info.yaml`
- markdown files with Backstage-style entity frontmatter
- Anchored Spec examples or generated AI scaffolding

If the repository does not use Anchored Spec, do not force these workflows onto the user.

## Core mental model

Anchored Spec is an entity-native architecture control plane.

- The source of truth is the entity model, not prose-only docs.
- The authored format is Backstage-aligned YAML or markdown frontmatter.
- Runtime identifiers are canonical entity refs such as `component:default/orders-service`.
- Docs, traceability, discovery, drift, reporting, and AI context all hang off the same graph.
- The framework owns architecture truth and stable query primitives; repositories still own last-mile task execution.
- In repositories that ship a thin local harness, prefer that harness for fresh-context routing and focused verification rather than rebuilding scope manually.
- In manifest-mode reference setups, keep machine-readable harness collateral in `.anchored-spec/` and repo-local execution helpers in `scripts/`.
- `anchored-spec.dev/code-location` is the preferred primary code linkage for a top-level component.
- File anchors, symbols, tests, and repository-evidence adapter output are supporting context, not the primary architecture boundary.

## Storage modes

### Manifest mode

Entities live in `catalog-info.yaml`, optionally with additional YAML loaded from configured catalog directories.

### Inline mode

Entities live in markdown frontmatter, usually inside `docs/`.

Preserve the repository's current storage mode unless the user explicitly asks to migrate it.

In manifest-mode repositories with meaningful existing code and docs, prefer `catalog bootstrap` as the first-pass modeling workflow before falling back to raw discovery.

## Entity rules

Every entity must be valid Backstage-style YAML:

- `apiVersion`
- `kind`
- `metadata`
- `spec`

Agent expectations:

- keep `metadata.name` stable once it is referenced elsewhere
- use canonical entity refs when ambiguity matters
- preserve `anchored-spec.dev/*` annotations
- prefer Backstage-native fields such as `owner`, `dependsOn`, `providesApis`, `consumesApis`, `system`, and `domain`
- treat derived `relations` output as analysis, not hand-maintained primary source
- prefer one primary `anchored-spec.dev/code-location` before adding lower-level file evidence

## Kind selection

Prefer these built-in kinds first:

- `Component`
- `API`
- `Resource`
- `Group`
- `System`
- `Domain`

Use Anchored Spec custom kinds only when the concept is genuinely architectural and not already covered:

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

### When creating architecture

1. choose the smallest correct kind
2. create the entity in the repository's current storage mode
3. add relations using canonical refs
4. add or update linked docs if the change needs explanation
5. validate immediately

Typical commands:

```bash
npx anchored-spec create --kind Component --type service --title "Orders Service"
npx anchored-spec validate
```

### When updating architecture

1. locate the entity by canonical ref or exact file
2. update the entity and any directly linked docs together
3. keep owner, lifecycle, domain, and relation fields coherent
4. run the smallest useful quality loop afterward

### When bootstrapping from reality

Prefer catalog synthesis first:

```bash
npx anchored-spec catalog bootstrap --dry-run
npx anchored-spec catalog bootstrap --write catalog-info.yaml
npx anchored-spec catalog explain component:default/your-primary-component
```

Use discovery when you need broader resolver-driven extraction or source-specific expansion:

```bash
npx anchored-spec discover
npx anchored-spec discover --resolver openapi --source ./openapi.yaml
```

`catalog bootstrap` produces a curated manifest proposal. `discover` produces draft findings. Neither should be treated as final truth without review.

### When checking declared vs observed truth

Use drift:

```bash
npx anchored-spec drift
npx anchored-spec drift --domain docs
```

### When reviewing change sets

Use semantic review and change-aware analysis:

```bash
npx anchored-spec diff --base main --compat --policy
npx anchored-spec impact --from-diff HEAD~1 --format markdown
npx anchored-spec impact --from-diff HEAD~1 --with-commands --format markdown
npx anchored-spec constraints --from-diff HEAD~1 --format markdown
```

When `--with-commands` is used, treat the result as a handoff into repository-local workflow logic. Prefer the structured `architectureImpact`, `repositoryImpact`, and `suggestions` fields over assuming the framework should own final command orchestration.

If the repository has `task:start` and `task:verify`, use them as the default repo-local wrapper around this control plane.

### When assembling context

Use trace and context workflows:

```bash
npx anchored-spec trace --summary
npx anchored-spec context component:default/orders-service --tier llm
npx anchored-spec link-docs
```

### When running a broader maintenance loop

Use reconcile:

```bash
npx anchored-spec reconcile --include-trace --include-docs
```

## Documentation expectations

Agents should write docs that reflect the current shipped framework.

- describe entities as the primary architecture model
- use current command names only
- keep examples aligned with the actual CLI surface
- prefer short GitHub-friendly sections with clear next actions
- link docs back to canonical entity refs
- make the architecture-control-plane versus repository-harness split explicit when relevant

## Anti-patterns

Do not:

- create a second architecture format alongside the entity model
- switch storage modes without being asked
- use informal IDs as the primary runtime identifier
- treat discovery or inferred facts as final truth without review
- treat Anchored Spec as the full repo harness or canonical command planner
- skip `catalog bootstrap` when the task is to create a repository-specific first-pass manifest from existing repo evidence
- describe unsupported or removed commands as current
- let docs drift away from entity refs

## Safe completion checklist

Before finishing meaningful architecture work, prefer to:

1. run `npx anchored-spec validate`
2. run `npx anchored-spec trace --summary` when docs or links changed
3. run `npx anchored-spec drift` when declared-vs-observed consistency matters
4. run `npx anchored-spec diff --base main --compat --policy` when reviewing a change set
5. summarize lifecycle, relation, traceability, or compatibility impact for the user
