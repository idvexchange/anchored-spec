---
type: architecture
status: current
audience:
  - architect
  - developer
  - agent
domain:
  - systems
  - information
ea-entities:
  - resource:default/descriptor-schema-pack
  - component:default/anchored-spec-library
  - api:default/anchored-spec-node-api
  - capability:default/manifest-authoring
  - decision:default/backstage-aligned-entity-envelope
  - decision:default/dual-storage-modes
---

# Entity Model

Anchored Spec standardizes on the Backstage entity envelope:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: anchored-spec-cli
  title: Anchored Spec CLI
  description: Shipped command-line workflow surface for the framework.
spec:
  type: service
  lifecycle: production
  owner: group:default/platform-maintainers
  system: system:default/anchored-spec-framework
```

That decision gives the framework one authored format for CLI workflows, validation, graph analysis, traceability, and future Backstage interoperability.

## Kinds in Practice

Anchored Spec supports both Backstage built-ins and anchored-spec custom kinds.

Common built-ins:

- `Component` for executable subsystems and major code slices
- `API` for CLI or library-facing contracts
- `Resource` for documentation sets, schema collections, or package outputs
- `System`, `Domain`, and `Group` for ownership and context

Common custom kinds:

- `Capability` for what the framework enables
- `Decision` for long-lived architectural reasoning
- `Requirement`, `Control`, `TransitionPlan`, and the other custom kinds when a repo needs deeper EA modeling

This repo uses built-ins for the shipped framework structure and custom kinds for the business and architectural rationale layered above it.

## Canonical References

Every workflow uses canonical entity refs such as:

- `component:default/anchored-spec-cli`
- `component:default/anchored-spec-library`
- `api:default/anchored-spec-node-api`
- `capability:default/traceability`
- `decision:default/repository-local-workflow`

Use canonical refs consistently in docs, commands, traces, and relations. That keeps every downstream workflow aligned on one identifier format.

## Authored Metadata

High-signal metadata conventions in this repo:

- `metadata.description` explains the production intent of the entity
- `spec.owner` points to a real owner entity ref
- `metadata.annotations.anchored-spec.dev/source` points to the primary architecture doc
- `spec.traceRefs` can list additional linked docs when one source path is not enough

Those conventions matter because quality checks, traceability workflows, and AI context assembly all build on them.

## Relation Conventions

Prefer the smallest relation that communicates the architectural fact:

- `dependsOn` when one component needs another component or resource to function
- `providesApis` and `consumesApis` for API exposure and consumption
- `supports` on runtime components when they explain why a shipped surface exists
- `dependsOn` on `Decision` entities for the decisions or constraints they build on

Do not use relations as a generic dumping ground. They should encode behaviorally useful structure, not just adjacency.
