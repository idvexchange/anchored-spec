---
type: guide
status: current
audience:
  - developer
  - architect
  - reviewer
domain:
  - information
ea-entities:
  - capability:manifest-authoring
  - capability:traceability
  - capability:governed-evolution
---

# Glossary

## Anchored Spec

A repository-native enterprise architecture framework that uses Backstage-aligned entities as the authored source of truth.

## Manifest Mode

A storage mode where entities live in one or more YAML catalog files, typically centered on `catalog-info.yaml`.

## Inline Mode

A storage mode where entities are authored as YAML frontmatter inside markdown files.

## Canonical Entity Ref

The stable identifier format used across commands and docs, such as `component:cli-surface` or `decision:repository-local-workflow`.

## Declared Data

Human-authored architecture facts that the framework treats as the primary source of truth.

## Observed Data

Facts extracted from code, infrastructure, or documents by resolvers and analysis workflows.

## Inferred Data

Candidate facts proposed heuristically rather than declared directly.

## Traceability

The bidirectional link between entities, markdown docs, and source material.

## Drift

A mismatch between the authored architecture model and observed reality.

## Reconcile

A composed workflow that can run generation, validation, drift, and documentation checks together.
