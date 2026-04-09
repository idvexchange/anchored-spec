# Anchored Spec Documentation

This documentation set describes the framework as it exists in this repository today. It is architecture-first, implementation-referenced, and organized to support solution framing, delivery planning, and day-to-day engineering use.

## What Anchored Spec Is

Anchored Spec is a local-first architecture control plane for repositories. It gives teams:

- a typed architecture model based on Backstage-style entities
- a CLI-first query and review surface for authoring, validation, discovery, drift, reporting, and governance
- a Node API that exposes the same runtime used by the CLI
- a documentation and review workflow that stays in version control

The framework is implemented primarily in:

- `src/cli/` for the public command surface
- `src/ea/` for the architecture runtime
- `src/ea/resolvers/` for discovery sources
- `src/ea/generators/` for derived outputs
- `src/ea/schemas/` for schema contracts

## Reading Order

If you are new to the framework, read in this order:

1. [delivery-baseline.md](delivery-baseline.md)
2. [01-business/business-architecture.md](01-business/business-architecture.md)
3. [02-system-context/system-context.md](02-system-context/system-context.md)
4. [03-container/container-architecture.md](03-container/container-architecture.md)
5. [05-domain/domain-model.md](05-domain/domain-model.md)
6. [guides/user-guides/getting-started.md](guides/user-guides/getting-started.md)

## Navigation Index

### Core framing

- [glossary.md](glossary.md)
- [delivery-baseline.md](delivery-baseline.md)
- [mobilization.md](mobilization.md)
- [current-vs-target.md](current-vs-target.md)
- [readiness-checklist.md](readiness-checklist.md)

### Architecture outputs

- [01-business/business-architecture.md](01-business/business-architecture.md)
- [02-system-context/system-context.md](02-system-context/system-context.md)
- [03-container/container-architecture.md](03-container/container-architecture.md)
- [04-component/anchored-spec-cli.md](04-component/anchored-spec-cli.md)
- [04-component/anchored-spec-library.md](04-component/anchored-spec-library.md)
- [05-domain/domain-model.md](05-domain/domain-model.md)
- [05-domain/state-machines.md](05-domain/state-machines.md)
- [05-domain/domain-types.md](05-domain/domain-types.md)
- [05-domain/interfaces.md](05-domain/interfaces.md)
- [06-api/cli-api.md](06-api/cli-api.md)
- [06-api/node-api.md](06-api/node-api.md)
- [06-api/error-codes.md](06-api/error-codes.md)
- [07-data/data-model.md](07-data/data-model.md)
- [08-security/security-architecture.md](08-security/security-architecture.md)
- [09-infrastructure/infrastructure.md](09-infrastructure/infrastructure.md)
- [09-infrastructure/ci-cd.md](09-infrastructure/ci-cd.md)
- [09-infrastructure/environments.md](09-infrastructure/environments.md)
- [09-infrastructure/runbook.md](09-infrastructure/runbook.md)
- [10-testing/test-strategy.md](10-testing/test-strategy.md)

### Decision records

- [adr/ADR-001-backstage-aligned-entity-envelope.md](adr/ADR-001-backstage-aligned-entity-envelope.md)
- [adr/ADR-002-dual-storage-modes.md](adr/ADR-002-dual-storage-modes.md)
- [adr/ADR-003-declared-before-observed.md](adr/ADR-003-declared-before-observed.md)
- [adr/ADR-004-repository-local-workflow.md](adr/ADR-004-repository-local-workflow.md)
- [adr/ADR-005-flexible-document-structure.md](adr/ADR-005-flexible-document-structure.md)
- [adr/ADR-006-catalog-bootstrap-and-synthesis.md](adr/ADR-006-catalog-bootstrap-and-synthesis.md)

### Requirements

- [req/REQ-001-entity-model-as-source-of-truth.md](req/REQ-001-entity-model-as-source-of-truth.md)
- [req/REQ-002-traceability-and-context-assembly.md](req/REQ-002-traceability-and-context-assembly.md)
- [req/REQ-003-discovery-and-drift-control-loop.md](req/REQ-003-discovery-and-drift-control-loop.md)
- [req/REQ-004-semantic-change-governance.md](req/REQ-004-semantic-change-governance.md)

### Guides

- [guides/user-guides/getting-started.md](guides/user-guides/getting-started.md)
- [guides/user-guides/catalog-bootstrap.md](guides/user-guides/catalog-bootstrap.md)
- [guides/user-guides/obsidian-and-anchored-spec.md](guides/user-guides/obsidian-and-anchored-spec.md)
- [guides/user-guides/choosing-a-modeling-approach.md](guides/user-guides/choosing-a-modeling-approach.md)
- [guides/user-guides/bottom-up-discovery.md](guides/user-guides/bottom-up-discovery.md)
- [guides/user-guides/top-down-authoring.md](guides/user-guides/top-down-authoring.md)
- [guides/user-guides/reporting-and-analysis.md](guides/user-guides/reporting-and-analysis.md)
- [guides/user-guides/adoption-playbook.md](guides/user-guides/adoption-playbook.md)
- [guides/user-guides/repository-harness-pattern.md](guides/user-guides/repository-harness-pattern.md)
- [guides/developer-guides/contributing.md](guides/developer-guides/contributing.md)
- [guides/developer-guides/testing-and-ci.md](guides/developer-guides/testing-and-ci.md)
- [guides/developer-guides/framework-internals.md](guides/developer-guides/framework-internals.md)
- [guides/developer-guides/repository-harness-feedback.md](guides/developer-guides/repository-harness-feedback.md)

## Solution Framing

Anchored Spec is most useful when a team needs architecture to be:

- close to the code that implements it
- typed enough for automation
- reviewable enough for humans
- stable enough for AI-assisted analysis

It is not trying to be:

- a remote architecture registry
- a full repository harness
- a full verification orchestrator
- a generic model-driven code generation platform
- a documentation wiki with no typed source of truth

The rest of the docs explain how that position maps to the current implementation.
