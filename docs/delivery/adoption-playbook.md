---
type: guide
status: current
audience:
  - architect
  - maintainer
  - tech-lead
domain:
  - business
  - delivery
ea-entities:
  - capability:default/manifest-authoring
  - capability:default/discovery
  - capability:default/drift-detection
---

# Adoption Playbook

Use Anchored Spec to improve decision quality, not to create a second backlog.

## Start Small

A strong first slice is:

- one important component
- one API or contract
- one supporting resource
- one architecture document linked to those entities

That is enough to validate the core loop and prove the traceability model.

## Prefer Intentional Manifest Mode

Choose manifest mode when you want the model to be explicit, reviewable, and easy to query as a catalog. Inline mode remains supported, but manifest mode is the clearest operating shape for multi-concern repositories.

## Bootstrap with Discovery

Start with the resolvers that already reflect trusted sources:

- OpenAPI for service contracts
- tree-sitter for source-aware discovery
- markdown for doc-heavy repositories
- Terraform or Kubernetes where infrastructure truth matters

Use dry runs first. Discovery should improve authored truth, not replace human review.

For copy-paste discovery recipes by source stack, see `docs/delivery/bottom-up-discovery.md`.

For the deliberate entity-first path, see `docs/delivery/top-down-authoring.md`.

For a decision table on when to use bottom-up, top-down, or mixed, see `docs/delivery/choosing-a-modeling-approach.md`.

## Add Governance Gradually

Early governance usually means:

- owners on active entities
- docs linked to the model
- semantic diff on contract-sensitive changes
- visible drift results in CI

Do not front-load heavy workflow policy until the model already helps the team.
