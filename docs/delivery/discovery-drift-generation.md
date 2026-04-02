---
type: architecture
status: current
audience:
  - architect
  - developer
  - operator
domain:
  - delivery
  - systems
ea-entities:
  - component:default/discovery-and-resolvers
  - component:default/drift-and-reconcile
  - component:default/generator-pipeline
  - capability:default/discovery
  - capability:default/drift-detection
  - decision:default/declared-before-observed
---

# Discovery, Drift, and Generation

Anchored Spec becomes valuable when it can compare the authored model to the repository it lives in.

## Discovery Model

Resolvers observe existing material and propose or refine architecture facts. Built-in sources include:

- OpenAPI
- Kubernetes
- Terraform
- SQL DDL
- dbt
- markdown
- anchors
- tree-sitter

Discovery is intentionally non-authoritative. It produces candidate facts that are useful because they pressure-test the declared model.

## Declared vs Observed

The framework distinguishes:

- declared data authored by humans
- observed data extracted from source or infrastructure
- inferred data produced heuristically

The declared model remains primary. Discovery and drift exist to improve authored truth, not to silently replace it.

## Drift and Reconcile

`drift` compares the model against observed reality across multiple domains. `reconcile` composes generation, validation, drift, trace, and doc consistency into one end-to-end quality run.

This repo treats drift and reconcile as maintenance workflows, not one-time setup tasks. They are how teams keep architecture trustworthy after initial adoption.

## Generators

The built-in generator set is intentionally narrow:

- OpenAPI generation
- JSON Schema generation

That narrow scope is deliberate. Anchored Spec focuses on preserving a clean authored contract and deriving a few high-value outputs rather than trying to be a universal code generator.
