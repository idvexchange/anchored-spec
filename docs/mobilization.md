# Mobilization

This document breaks Anchored Spec adoption into delivery work packages. It is written for teams introducing the framework into a repository, not for maintainers changing the framework itself.

## Work Package 1: Establish the baseline

### Objective

Make the repository runnable with Anchored Spec and agree the initial storage mode.

### Deliverables

- package installed
- `anchored-spec init` run
- initial docs index or baseline architecture page created

### Implementation references

- `src/cli/commands/ea-init.ts`
- `package.json`

## Work Package 2: Model the first slice

### Objective

Create a small but real architecture model that proves the workflow.

### Deliverables

- at least one component
- at least one API or contract
- at least one resource or supporting dependency
- at least one linked architecture explanation

### Implementation references

- `src/cli/commands/ea-create.ts`
- `src/cli/commands/ea-create-doc.ts`
- `src/ea/backstage/`

## Work Package 3: Validate and make reviewable

### Objective

Ensure the model can participate in normal code review.

### Deliverables

- validation passes or produces understood findings
- a graph, diagram, or report is reviewable in markdown
- owners and descriptions exist on important entities

### Implementation references

- `src/cli/commands/ea-validate.ts`
- `src/cli/commands/ea-graph.ts`
- `src/cli/commands/ea-diagrams.ts`
- `src/cli/commands/ea-report.ts`

## Work Package 4: Bootstrap from reality where useful

### Objective

Reduce blank-page modeling by discovering draft entities from trusted sources.

### Deliverables

- selected resolvers identified
- dry-run discovery executed
- discovered drafts normalized into the authored model

### Implementation references

- `src/cli/commands/ea-discover.ts`
- `src/ea/resolvers/`
- `src/ea/discovery.ts`

## Work Package 5: Add change-aware governance

### Objective

Move from static modeling to semantic review.

### Deliverables

- semantic diff in normal review
- optional impact and constraint analysis for sensitive changes
- readiness for reconcile in CI

### Implementation references

- `src/cli/commands/ea-diff.ts`
- `src/cli/commands/ea-impact.ts`
- `src/cli/commands/ea-constraints.ts`
- `src/cli/commands/ea-reconcile.ts`

## Work Package 6: Operationalize and scale

### Objective

Make the model maintainable over time across contributors and repositories.

### Deliverables

- CI workflow aligned with team risk appetite
- ownership and lifecycle discipline in place
- clear guide for maintainers and AI agents

### Implementation references

- `.github/workflows/ci.yml`
- `SKILL.md`
- `llms.txt`
- `llms-full.txt`

## Recommended Sequence

Run these packages in order unless the repository is already mature enough to skip ahead. The framework works best when adoption grows from a narrow credible slice instead of a top-heavy documentation program.
