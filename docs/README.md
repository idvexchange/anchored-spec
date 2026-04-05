# Anchored Spec Documentation

Anchored Spec treats a repository as a living architecture model. This repo is the canonical manifest-mode example: one root `catalog-info.yaml` and linked markdown documentation under `docs/`, organized by primary EA domain.

## How To Start

Use this sequence when you are deciding how to model a repository:

1. Read [Choosing a modeling approach](delivery/choosing-a-modeling-approach.md) to decide whether your repo should start bottom up, top down, or mixed.
2. Follow [Bottom-up discovery](delivery/bottom-up-discovery.md) if the repository already contains useful truth in code, contracts, infrastructure, or docs.
3. Follow [Top-down authoring](delivery/top-down-authoring.md) if you already know the intended target model and want to author it deliberately.

The normal long-term pattern is mixed: bootstrap from reality where helpful, normalize into a clean Backstage-first model, then maintain that model intentionally.

## Systems

- [Overview](systems/overview.md) — system context, subsystem map, and repository layout
- [Entity model](systems/entity-model.md) — Backstage alignment, kinds, refs, annotations, and relation conventions
- [Framework internals](systems/framework-internals.md) — internal implementation areas, extension seams, and why they stay out of the top-level catalog
- [Federation and boundaries](systems/federation-and-boundaries.md) — repo boundaries, scaling patterns, and cross-repo concerns
- [Relation cheat sheet](systems/relation-cheat-sheet.md) — quick reference for common relation choices

## Delivery

- [Getting started](delivery/getting-started.md) — install, initialize, author, validate, and trace
- [Bottom-up discovery](delivery/bottom-up-discovery.md) — discover draft entities from code, contracts, infra, and docs with copy-paste recipes per stack
- [Top-down authoring](delivery/top-down-authoring.md) — deliberately author a target model from domains and systems down to runtime entities
- [Choosing a modeling approach](delivery/choosing-a-modeling-approach.md) — decision table for when to use bottom-up, top-down, or mixed adoption
- [Testing and CI](delivery/testing-and-ci.md) — local checks, CI gates, and review-friendly outputs
- [Discovery, drift, and generation](delivery/discovery-drift-generation.md) — resolvers, observed facts, drift analysis, generators, and reconcile
- [Reporting and analysis](delivery/reporting-and-analysis.md) — graph, diagrams, report, impact, constraints, search, status, and AI context workflows
- [Adoption playbook](delivery/adoption-playbook.md) — rollout patterns and operating guidance

## Business

- [Capabilities and operating model](business/capabilities-and-operating-model.md) — ownership, capability map, and how the framework is meant to be operated

## Data

No current document has `data` as its primary domain. When the repo gains data-first guidance, it should live under `docs/data/`.

## Information

- [Docs and traceability](information/docs-and-traceability.md) — linked markdown, trace refs, and source annotations
- [Glossary](information/glossary.md) — shared terms used across the framework

## Transitions

- [Governance and evolution](transitions/governance-and-evolution.md) — validation, diff, transitions, evidence, and workflow policy

## Root Docs

- [LLM guide](../llms.txt) — machine-oriented index for AI agents
- [Contributing](contributing.md) — repository workflow, layout, and contribution expectations

## Working Style

- Author entities in `catalog-info.yaml`.
- Place each document in one authoritative domain folder under `docs/`.
- Use frontmatter `domain:` to record cross-domain membership when a doc spans multiple domains.
- Link docs to entity refs with markdown frontmatter and link entities back with `traceRefs` or `anchored-spec.dev/source`.
- Use `validate`, `trace`, `drift`, `report`, and `reconcile` as the normal maintenance loop.
