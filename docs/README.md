# Anchored Spec Documentation

Anchored Spec treats a repository as a living architecture model. This repo is the canonical manifest-mode example: one root `catalog-info.yaml` and linked markdown documentation under `docs/`, organized by primary EA domain.

## Systems

- [Overview](systems/overview.md) — system context, subsystem map, and repository layout
- [Entity model](systems/entity-model.md) — Backstage alignment, kinds, refs, annotations, and relation conventions
- [Federation and boundaries](systems/federation-and-boundaries.md) — repo boundaries, scaling patterns, and cross-repo concerns
- [Relation cheat sheet](systems/relation-cheat-sheet.md) — quick reference for common relation choices

## Delivery

- [Getting started](delivery/getting-started.md) — install, initialize, author, validate, and trace
- [Testing and CI](delivery/testing-and-ci.md) — local checks, CI gates, and review-friendly outputs
- [Discovery, drift, and generation](delivery/discovery-drift-generation.md) — resolvers, observed facts, drift analysis, generators, and reconcile
- [Reporting and analysis](delivery/reporting-and-analysis.md) — graph, report, impact, search, status, and AI context workflows
- [Adoption playbook](delivery/adoption-playbook.md) — rollout patterns and operating guidance

## Business

No current document has `business` as its primary domain. Secondary business concerns are carried in frontmatter on the relevant delivery or systems documents.

## Data

No current document has `data` as its primary domain. When the repo gains data-first guidance, it should live under `docs/data/`.

## Information

- [Docs and traceability](information/docs-and-traceability.md) — linked markdown, trace refs, and source annotations
- [Glossary](information/glossary.md) — shared terms used across the framework

## Transitions

- [Governance and evolution](transitions/governance-and-evolution.md) — validation, diff, transitions, evidence, and workflow policy

## Root Docs

- [Contributing](contributing.md) — repository workflow, layout, and contribution expectations

## Working Style

- Author entities in `catalog-info.yaml`.
- Place each document in one authoritative domain folder under `docs/`.
- Use frontmatter `domain:` to record cross-domain membership when a doc spans multiple domains.
- Link docs to entity refs with markdown frontmatter and link entities back with `traceRefs` or `anchored-spec.dev/source`.
- Use `validate`, `trace`, `drift`, `report`, and `reconcile` as the normal maintenance loop.
