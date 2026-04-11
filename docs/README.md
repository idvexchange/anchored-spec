# Anchored Spec Documentation

This docs set is organized around four jobs:

- `start/` for adoption framing and first-step guidance
- `workflows/` for day-to-day framework usage
- `maintainers/` for contributors to Anchored Spec itself
- `archive/` for ADRs and requirement records that explain why the framework looks the way it does

The numbered architecture docs remain the sparse reference layer for the framework model itself.

## Start Here

If you are new to Anchored Spec, read in this order:

1. [start/adoption-overview.md](start/adoption-overview.md)
2. [start/choose-your-path.md](start/choose-your-path.md)
3. [01-business/business-architecture.md](01-business/business-architecture.md)
4. [02-system-context/system-context.md](02-system-context/system-context.md)
5. [04-component/anchored-spec-cli.md](04-component/anchored-spec-cli.md)
6. [05-domain/domain-model.md](05-domain/domain-model.md)
7. [workflows/model-the-repo.md](workflows/model-the-repo.md)
8. [workflows/review-and-analysis.md](workflows/review-and-analysis.md)

## Navigation

### Start

- [start/adoption-overview.md](start/adoption-overview.md)
- [start/choose-your-path.md](start/choose-your-path.md)

### Workflows

- [workflows/model-the-repo.md](workflows/model-the-repo.md)
- [workflows/review-and-analysis.md](workflows/review-and-analysis.md)
- [workflows/repository-harness.md](workflows/repository-harness.md)
- [workflows/agent-guide.md](workflows/agent-guide.md)
- [workflows/obsidian.md](workflows/obsidian.md)

### Maintainers

- [maintainers/contributing.md](maintainers/contributing.md)
- [maintainers/architecture.md](maintainers/architecture.md)
- [maintainers/scaffold-strategy.md](maintainers/scaffold-strategy.md)

### Architecture Reference

- [01-business/business-architecture.md](01-business/business-architecture.md)
- [01-business/anchored-spec-maintainers.md](01-business/anchored-spec-maintainers.md)
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
- [glossary.md](glossary.md)

### Archive

- [archive/adr/ADR-001-backstage-aligned-entity-envelope.md](archive/adr/ADR-001-backstage-aligned-entity-envelope.md)
- [archive/adr/ADR-002-dual-storage-modes.md](archive/adr/ADR-002-dual-storage-modes.md)
- [archive/adr/ADR-003-declared-before-observed.md](archive/adr/ADR-003-declared-before-observed.md)
- [archive/adr/ADR-004-repository-local-workflow.md](archive/adr/ADR-004-repository-local-workflow.md)
- [archive/adr/ADR-005-flexible-document-structure.md](archive/adr/ADR-005-flexible-document-structure.md)
- [archive/adr/ADR-006-catalog-bootstrap-and-synthesis.md](archive/adr/ADR-006-catalog-bootstrap-and-synthesis.md)
- [archive/adr/ADR-007-control-plane-and-repository-harness-boundary.md](archive/adr/ADR-007-control-plane-and-repository-harness-boundary.md)
- [archive/req/REQ-001-entity-model-as-source-of-truth.md](archive/req/REQ-001-entity-model-as-source-of-truth.md)
- [archive/req/REQ-002-traceability-and-context-assembly.md](archive/req/REQ-002-traceability-and-context-assembly.md)
- [archive/req/REQ-003-discovery-and-drift-control-loop.md](archive/req/REQ-003-discovery-and-drift-control-loop.md)
- [archive/req/REQ-004-semantic-change-governance.md](archive/req/REQ-004-semantic-change-governance.md)

## Operating Position

Anchored Spec is a local-first architecture control plane for repositories.

Use it for:

- typed architecture modeling
- stable CLI-native query and review workflows
- traceability, impact analysis, and semantic change review
- a thin handoff into repository-local execution

Do not treat it as:

- the full repository harness
- the final command orchestrator
- a replacement for repository-specific execution policy

The normal operating loop is:

1. find the top-level entity with `search`
2. inspect direct relationships with `trace`
3. assemble focused context with `context`
4. inspect downstream blast radius with `impact --with-commands`
5. let a repository-local wrapper decide exact verification and follow-up commands
