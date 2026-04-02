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
  - component:default/reporting-and-analysis
  - capability:default/ai-context-assembly
  - capability:default/traceability
  - capability:default/governed-evolution
---

# Reporting and Analysis

The reporting layer turns the catalog into something teams can review and act on.

## Primary Outputs

Key analytical outputs include:

- relation graphs
- system-data and capability reports
- drift summaries
- traceability indexes
- impact analysis
- lifecycle and ownership status views
- search and context bundles

These outputs serve different audiences, but they all depend on the same entity graph.

## Reviewer Workflows

The most useful reviewer-facing patterns are:

- `graph --format mermaid` for topology review
- `report --view ...` for focused architecture slices
- `impact <entity-ref>` for downstream effect analysis
- `status` and `search` for catalog navigation
- `context <entity-ref>` for AI or deep human review

The important point is consistency: each command reads the same model instead of inventing its own interpretation of the repo.

## Model Health

Healthy repositories usually show:

- owners on active entities
- descriptions and source docs on important entities
- relations that explain runtime or governance structure
- low-noise drift findings
- docs that stay linked to the model rather than drifting into isolated prose

That is the standard this repo is meant to demonstrate.
