---
ea-entities:
  - system:default/anchored-spec-framework
---

# System Context

This document describes the external actors and systems around Anchored Spec.

## Scope

The system in scope is the Anchored Spec framework package as implemented in this repository.

## Context Diagram

```mermaid
flowchart LR
  Architect[Architect]
  Developer[Developer]
  Reviewer[Reviewer]
  Agent[AI Agent]
  CI[CI Runner]
  Repo[Repository Files]
  Sources[Code / OpenAPI / Kubernetes / Terraform / SQL / dbt / Markdown]
  AS[Anchored Spec Framework]
  NPM[npm Registry]

  Architect -->|authors model and docs| AS
  Developer -->|runs CLI and library workflows| AS
  Reviewer -->|consumes reports and diffs| AS
  Agent -->|assembles context and proposes changes| AS
  CI -->|builds, tests, validates, publishes| AS
  Repo -->|provides entities, docs, config, diffs| AS
  Sources -->|provide observed inputs| AS
  AS -->|reads and updates local repository artifacts| Repo
  AS -->|publishes package artifacts| NPM
```

## External Relationships

### Repository files

The repository is the primary integration boundary. Anchored Spec reads and writes local artifacts rather than depending on a service backend.

### Source material for discovery

Discovery integrates with existing technical truth such as:

- OpenAPI
- Kubernetes manifests
- Terraform state
- SQL DDL
- dbt manifests
- markdown
- source code through tree-sitter

### CI and release infrastructure

The framework is exercised in GitHub Actions and published to npm. The shipped workflow is defined in `.github/workflows/ci.yml`.

### Human and AI consumers

The same architecture model is intended to serve architects, implementers, reviewers, and agents. That is a core design constraint, not a side effect.
