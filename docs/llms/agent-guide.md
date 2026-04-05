# Agent Guide

This guide is the agent-oriented companion to the main Anchored Spec docs.

Use it when an AI agent needs to work with an Anchored Spec repository without inventing its own architecture workflow.

## What An Agent Should Optimize For

- keep the authored entity graph as the single source of truth
- use canonical entity refs consistently
- preserve the repository's existing storage mode
- prefer the smallest correct entity kind
- keep linked docs synchronized with entity changes
- use Anchored Spec analysis commands instead of ad-hoc interpretation

## The Minimal Mental Model

Anchored Spec is not a generic note-taking layer and not a second config format for code.

It is a Backstage-aligned architecture model in version control. The authored entity graph drives:

- validation
- relation analysis
- traceability
- discovery and drift
- generators
- reporting
- AI context assembly

## What To Read First

1. `llms.txt`
2. `llms-full.txt`
3. `SKILL.md`
4. `docs/systems/entity-model.md`
5. `docs/delivery/getting-started.md`

## How To Choose A Workflow

Use this decision pattern:

- when the user wants to add or change intended architecture, edit entities first
- when the user wants to bootstrap from source artifacts, use `discover`
- when the user wants to compare model and reality, use `drift`
- when the user wants reviewable architecture output, use `graph`, `diagrams`, `report`, `impact`, `constraints`, or `context`
- when the user wants confidence after a broader change, use `reconcile`

## Default Commands

```bash
npx anchored-spec validate
npx anchored-spec trace --summary
npx anchored-spec drift
npx anchored-spec diff --base main --compat --policy
npx anchored-spec context component:default/orders-service --tier llm
```

## Modeling Defaults

- prefer `Component`, `API`, `Resource`, `Group`, `System`, and `Domain` before custom kinds
- use custom kinds only for genuinely architectural concepts not modeled by Backstage
- keep `metadata.name` stable
- use `spec.owner` and `metadata.description`
- use `providesApis`, `consumesApis`, and `dependsOn` where they communicate real behavior

## What To Avoid

- creating parallel architecture formats
- using prose-only docs as the primary architecture source
- changing identifiers casually
- treating discovery output as final truth
- documenting commands that the current framework does not support
