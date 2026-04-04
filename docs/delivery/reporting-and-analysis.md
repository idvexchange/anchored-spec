---
type: architecture
status: current
audience:
  - architect
  - reviewer
  - maintainer
domain:
  - delivery
  - information
ea-entities:
  - component:default/anchored-spec-library
  - component:default/anchored-spec-cli
  - capability:default/ai-context-assembly
  - capability:default/traceability
  - capability:default/governed-evolution
---

# Reporting and Analysis

The reporting layer turns the catalog into something teams can review, gate, and act on during normal delivery.

Like discovery and governance, reporting is treated as behavior of the shipped library and CLI surfaces rather than as a standalone catalog component.

The internal implementation split behind those reporting surfaces is documented in `docs/systems/framework-internals.md`.

## Primary Outputs

Key analytical outputs include:

- relation graphs
- system-data and capability reports
- drift summaries
- traceability indexes
- impact analysis
- governing constraints and decisions
- lifecycle and ownership status views
- search views and context bundles

These outputs serve different audiences, but they all depend on the same entity graph.

## Reviewer Workflows

The most useful reviewer-facing patterns are:

- `graph --format mermaid` for raw relation topology review
- `diagrams render backstage --focus system:default/payments --depth 1` for semantic Backstage system views
- `report --view ...` for focused architecture slices
- `impact <entity-ref>` or `impact --from-diff <ref>` for downstream effect analysis
- `constraints <entity-ref>` or `constraints --from-diff <ref>` for governance checks
- `status` and `search` for catalog navigation
- `context <entity-ref> --tier llm` for AI review packages
- `context <entity-ref> --tier deep --why-included` for deep human review

## Change-Aware Analysis

Impact, constraints, and context workflows all benefit from the same reverse-resolution path from files or diffs back to entity refs. That keeps review automation tied to changed source paths instead of forcing CI jobs or bots to guess the right entity identifiers up front.

The important point is consistency: each command reads the same model instead of inventing its own interpretation of the repo.

## Model Health

Healthy repositories usually show:

- owners on active entities
- descriptions and source docs on important entities
- relations that explain runtime or governance structure
- low-noise drift findings
- docs that stay linked to the model rather than drifting into isolated prose

That is the standard this repo is meant to demonstrate.
