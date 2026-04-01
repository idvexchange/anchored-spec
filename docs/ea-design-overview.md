# Design Overview

Anchored Spec is a repository-native architecture system built around one idea: the architecture model should live next to the code, use a standard entity envelope, and drive validation, discovery, traceability, and change review.

## Design goals

The framework is designed to help teams:

- author architecture in version control
- keep model data close to code and docs
- detect drift between declaration and reality
- reason about change before merge
- preserve traceability across descriptors, docs, and sources
- support both human review and AI-assisted workflows

## High-level architecture

Anchored Spec has five major layers.

### 1. Authoring layer

The authoring layer loads Backstage-aligned entities from either:

- manifest YAML files
- YAML frontmatter inside Markdown docs

This layer is responsible for parsing descriptors, resolving local substitutions, and normalizing entities into the internal runtime shape.

### 2. Modeling layer

The modeling layer provides the canonical entity graph.

It handles:

- kind mapping
- entity ref formatting and parsing
- lifecycle/status accessors
- relation derivation
- trace reference access

This is the layer that lets the rest of the tool operate on a consistent model regardless of whether the entity came from a built-in Backstage kind or an anchored-spec custom kind.

### 3. Analysis layer

The analysis layer powers:

- validation
- verification
- semantic diff
- compatibility assessment
- version policy checks
- impact analysis
- drift detection
- report generation
- trace analysis
- doc fact extraction and consistency checks

This is where anchored-spec becomes more than a static schema validator.

### 4. Discovery and generation layer

Resolvers and generators connect the model to the wider repository.

Resolvers discover or observe information from source material such as:

- OpenAPI
- Kubernetes
- Terraform
- SQL DDL
- dbt
- code symbols and syntax trees
- Markdown documents

Generators turn authored entities into derived outputs. Today the built-in generator set is intentionally small and focused on:

- OpenAPI
- JSON Schema

### 5. Workflow layer

The workflow layer is the CLI that teams use every day.

Typical loops:

- `create` then `validate`
- `discover` then review inferred entities
- `drift` during architecture maintenance
- `diff --compat --policy` in pull request review
- `reconcile` for an end-to-end quality loop
- `trace`, `link-docs`, and `context` for documentation and AI workflows

## Declared, observed, and inferred data

Anchored Spec distinguishes between three classes of truth:

- **declared** — human-authored architecture
- **observed** — facts extracted from running or source systems
- **inferred** — candidate entities or facts created heuristically

The framework is intentionally biased toward declared data. Discovery and drift are useful because they challenge and enrich the authored model, not because they replace it.

## Why the model is entity-first

Using Backstage-style entities as the common authored contract keeps the tool coherent.

It means:

- one descriptor shape for architecture metadata
- one identifier format for commands and reports
- one relation graph shared across validation, drift, and diff
- one path from repository-local tooling to possible future Backstage ingestion

## Repository-local by design

Anchored Spec is designed to work without a server.

A team can:

- commit descriptors to git
- run validation and drift locally or in CI
- review architecture changes in pull requests
- generate docs and reports as artifacts
- assemble context for AI agents directly from the repo

That local-first bias is a core design feature, not a temporary simplification.
