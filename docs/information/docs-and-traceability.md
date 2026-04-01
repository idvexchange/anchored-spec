---
type: architecture
status: current
audience:
  - architect
  - developer
  - agent
domain:
  - information
  - delivery
ea-artifacts:
  - component:docs-and-traceability
  - resource:documentation-set
  - capability:traceability
  - capability:ai-context-assembly
---

# Docs and Traceability

Anchored Spec separates architecture data from architecture explanation without disconnecting them.

## Manifest-Mode Structure

In manifest mode:

- `catalog-info.yaml` stores the entities
- `docs/<domain>/*.md` stores linked markdown in the folder that matches each document's primary EA domain
- frontmatter `domain:` lists every domain the document belongs to, including secondary domains

That layout keeps the model machine-readable while still giving reviewers and implementers human-oriented documentation without duplicating the same file across multiple folders.

## Doc Frontmatter

Architecture and guide documents should carry frontmatter that links them to entity refs:

```yaml
---
type: architecture
status: current
audience: [architect, developer, agent]
ea-artifacts:
  - component:docs-and-traceability
  - capability:traceability
---
```

This is what lets `trace`, `link-docs`, `discover --resolver markdown`, and AI context workflows treat markdown as structured architecture material rather than loose prose.

## Entity-to-Doc Linking

The reverse link lives on the entity:

- `anchored-spec.dev/source` for the primary authored document
- `spec.traceRefs` for additional linked material with roles such as `specification`, `context`, or `rationale`

Use one primary source path and then add trace refs only when an entity truly spans multiple documents.

## Source-Aware Workflows

The traceability subsystem powers several core workflows:

- `create-doc` for pre-linked markdown
- `link-docs` for synchronization and annotation suggestions
- `trace` for reviewer-friendly trace summaries
- `context` for assembling entity-centric bundles for humans or agents

The framework is opinionated here: documentation is not secondary evidence. It is part of the authored architecture surface and must stay in sync with the model.
