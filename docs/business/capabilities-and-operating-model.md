---
type: architecture
status: current
audience:
  - architect
  - maintainer
  - agent
domain:
  - business
  - delivery
ea-entities:
  - group:default/platform-maintainers
  - domain:default/anchored-spec
  - capability:default/manifest-authoring
  - capability:default/discovery
  - capability:default/drift-detection
  - capability:default/derived-output-generation
  - capability:default/traceability
  - capability:default/governed-evolution
  - capability:default/ai-context-assembly
---

# Capabilities and Operating Model

Anchored Spec is not just a parser or validator. At the enterprise-architecture level it is operated as a small, opinionated capability stack with one clear owner and one coherent review workflow.

## Ownership Model

The owning team in this repository is `group:default/platform-maintainers`.

That group is responsible for:

- the public CLI and Node library surfaces
- the canonical entity model and relation vocabulary
- the drift, trace, reporting, and governance workflows
- keeping the manifest and the linked docs aligned as one architecture model

## Capability Stack

The framework’s business-facing architecture is expressed through seven capabilities:

- `capability:default/manifest-authoring` keeps the entity model explicit, reviewable, and local to the repository
- `capability:default/discovery` bootstraps or refines the model from source material such as OpenAPI, Markdown, Kubernetes, Terraform, dbt, and tree-sitter discovery
- `capability:default/drift-detection` compares declared architecture against observed facts and consistency rules
- `capability:default/derived-output-generation` derives a narrow set of reusable outputs, currently OpenAPI and JSON Schema, from the authored model
- `capability:default/traceability` links entities, markdown, and source-aware references into one explainable graph
- `capability:default/governed-evolution` turns architecture review into an operational loop through validation, diff, lifecycle, evidence, and workflow policy
- `capability:default/ai-context-assembly` packages entity-centric context for deep human review or agent workflows

## Operating Principle

These capabilities are designed to compose rather than stand alone.

The intended sequence is:

1. author or update entities
2. link or revise the supporting docs
3. validate and inspect traceability
4. run discovery, drift, diff, report, or reconcile as needed

That is the operating model this repository demonstrates.
