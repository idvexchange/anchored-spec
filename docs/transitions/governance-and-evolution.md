---
type: architecture
status: current
audience:
  - architect
  - maintainer
  - reviewer
domain:
  - transitions
  - delivery
ea-entities:
  - component:governance-and-workflow
  - capability:governed-evolution
  - decision:repository-local-workflow
  - decision:dual-storage-modes
---

# Governance and Evolution

Anchored Spec is designed to make architecture change review operational, not ceremonial.

## Core Governance Workflows

The governance layer owns:

- schema and quality validation
- semantic diff and compatibility assessment
- lifecycle transitions
- evidence ingestion and summarization
- workflow policy evaluation
- full verification runs

These workflows let a repo reason about architecture changes with something closer to semantic intent than plain text diffs.

## Semantic Change Review

`diff --compat --policy` is the central review primitive. It classifies changes by architectural meaning, highlights compatibility risk, and makes policy violations visible before merge.

This is why Anchored Spec models entity kinds, relations, and lifecycle explicitly. Without a typed model there is no stable semantic change review.

## Lifecycle and Evidence

Lifecycle data tracks whether entities are still draft, planned, active, shipped, deprecated, or retired. Evidence workflows let teams attach verification records and quality outputs to those lifecycle states.

Together, they turn architectural governance into something that can be automated and audited.

## Policy Philosophy

The framework prefers lightweight policy with strong defaults:

- active entities need owners
- active entities need descriptions
- contract-sensitive changes should run semantic diff
- doc and trace quality should be visible, not implicit

That keeps governance useful without turning the framework into a ticketing system.
