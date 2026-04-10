---
ea-entities:
  - domain:default/anchored-spec
---

# Business Architecture

This document describes the business intent of the Anchored Spec framework rather than the technical implementation details.

## Problem Statement

Teams often know that architecture matters, but the artifacts they create are hard to trust:

- diagrams drift away from code
- documentation becomes descriptive rather than operational
- architecture review happens outside the pull request
- automation cannot consume the same architectural truth humans discuss

Anchored Spec addresses that by moving architecture into the repository and giving it a typed command surface.

## Primary Stakeholders

| Stakeholder | Need                                   | What Anchored Spec gives them                              |
| ----------- | -------------------------------------- | ---------------------------------------------------------- |
| Architects  | A stable model of the intended system  | Entity-native authoring, diagrams, reports, and decisions  |
| Developers  | Architecture that survives code review | Local CLI workflows and repo-native docs                   |
| Maintainers | Governance without heavy ceremony      | Validation, diff, impact, constraints, evidence, reconcile |
| Reviewers   | Better change context                  | Semantic review outputs and traceable docs                 |
| AI agents   | Trusted architecture context           | CLI context assembly and machine-readable documentation    |

## Capability Stack

The framework is built around these business capabilities:

- explicit architecture authoring
- bootstrap from existing repository truth
- detect drift between intended and observed architecture
- derive a narrow set of useful downstream artifacts
- make documentation and implementation reviewable together
- enforce semantic change governance
- assemble architecture-aware context for people and agents

## Value Proposition

Anchored Spec is valuable when a team wants:

- one architecture source of truth in version control
- low-friction adoption inside an existing engineering workflow
- architecture review that can be automated without becoming a separate system

It is intentionally less valuable for teams looking for:

- a central enterprise registry before repository truth exists
- a remote modeling tool disconnected from code
- broad model-driven code generation as the primary outcome

## Business Outcome

The target business outcome is simple: architecture becomes part of delivery instead of a separate documentation exercise.
