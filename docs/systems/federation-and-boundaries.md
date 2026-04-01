---
type: architecture
status: current
audience:
  - architect
  - maintainer
domain:
  - systems
  - business
ea-artifacts:
  - system:anchored-spec-framework
  - resource:documentation-set
  - capability:manifest-authoring
  - capability:traceability
---

# Federation and Boundaries

Anchored Spec is intentionally local-first, but it is not limited to single-repo thinking.

## Repository Boundary

This repo models the framework itself as one system. That means the catalog focuses on:

- internal framework subsystems
- the public CLI and Node library surfaces
- the documentation set that explains those surfaces
- the architectural decisions that constrain future work

It does not pretend that every command is a separate deployable service.

## Scaling Out

When teams move beyond one repo, the recommended pattern is:

- keep entity ownership close to the code that owns the concern
- use canonical refs across repos
- federate catalogs or ingest them into a broader catalog later
- preserve the same doc traceability rules in every repo

That lets teams scale the model without giving up local version-control workflows.

## Why This Matters Here

This repo is a framework package, so its architecture is primarily logical and workflow-oriented rather than made of independently deployed services. Modeling those boundaries honestly is part of the example: a credible architecture model should describe the system that exists, not the one a template wishes existed.
