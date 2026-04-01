# Glossary

## Anchored Spec

A repository-native architecture framework built around Backstage-aligned entities, canonical entity refs, drift detection, traceability, and governed change workflows.

## Entity

The fundamental authored unit in anchored-spec. Entities use the Backstage descriptor envelope and are the source of truth for architecture metadata.

## Entity ref

A canonical identifier such as `component:default/orders-service` used in CLI workflows, relations, reports, and traceability.

## Manifest mode

A storage mode where entities are authored in one or more YAML descriptor files, usually centered on `catalog-info.yaml`.

## Inline mode

A storage mode where entities are authored as YAML frontmatter inside Markdown documents.

## Declared

Human-authored and trusted model data.

## Observed

Data extracted from source systems, files, or infrastructure through resolvers.

## Inferred

Heuristically discovered data that still needs human review.

## Drift

A mismatch between the authored model and observed reality.

## Traceability

The explicit link structure between entities, documents, source paths, and other supporting material.

## Reconcile

A compound workflow that can run generation, validation, drift, trace checks, and doc-consistency checks together.

## Semantic diff

A git-aware comparison that classifies architecture changes by meaning instead of only by text.

## Evidence

Supporting records used to back architecture claims such as test coverage, policy verification, deployment state, or inventory results.
