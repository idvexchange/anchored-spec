# Glossary

## Anchored Spec

A local-first architecture framework that treats a repository as a living architecture model.

## Backstage entity envelope

The authored structure used by the framework: `apiVersion`, `kind`, `metadata`, and `spec`.

## Canonical entity ref

A stable identifier such as `component:default/orders-service` used across commands, relations, and analysis.

## Manifest mode

A storage mode where entities are authored in YAML catalog files such as `catalog-info.yaml`.

## Inline mode

A storage mode where entities are authored in markdown frontmatter.

## Declared data

Architecture facts authored directly by humans and treated as the primary source of truth.

## Observed data

Facts extracted from code, contracts, infrastructure, or documents by discovery and analysis workflows.

## Inferred data

Facts proposed heuristically by the framework rather than authored directly.

## Drift

A mismatch between the declared architecture model and observed repository reality.

## Reconcile

A composed control loop that can run generation, validation, drift, and optional doc or trace checks.

## Traversal profile

A named relation subset used by impact and constraint analysis. The shipped profiles are `strict`, `broad`, and `contract` in `src/ea/relation-registry.ts`.

## Evidence

A time-stamped record linked to an entity, used for policy, verification, and review workflows.

## Resolver

A source adapter that observes external material and turns it into draft entities or observed state.

## Generator

A derived-output adapter that renders artifacts such as OpenAPI or JSON Schema from the authored model.
