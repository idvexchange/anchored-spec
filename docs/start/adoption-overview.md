# Adoption Overview

Anchored Spec is a local-first architecture control plane for repositories.

The framework is most effective when it is used to establish:

- a typed architecture model
- a stable CLI-first query surface
- reviewer-facing outputs such as trace, reports, and diagrams
- a thin handoff into repository-local execution

It is not trying to be:

- a full repository harness
- a full command orchestrator
- a second project-management system
- a remote registry detached from repository truth

## What ships today

Anchored Spec already ships the major control-plane capabilities:

- entity-native architecture modeling
- manifest and inline authoring modes
- validation and schema enforcement
- catalog bootstrap from repository evidence
- discovery from multiple source families
- drift detection
- diagrams, reports, impact, constraints, and context assembly
- optional repository-evidence adapters for repo-local target enrichment

The target posture for adopters is not "use everything at once." The target posture is:

1. create a small credible model
2. validate and trace it
3. bootstrap from reality where that helps
4. let repository-local wrappers own the last mile of execution

## Recommended work packages

### 1. Establish the baseline

- install the package
- run `anchored-spec init`
- choose manifest or inline mode intentionally

### 2. Model the first slice

- create one real component
- create one API, resource, or supporting dependency
- add one linked architecture explanation

### 3. Make the model reviewable

- run `validate`
- produce a graph, diagram, or report
- ensure ownership and descriptions exist on important entities

### 4. Bootstrap from reality where useful

- use `catalog bootstrap --dry-run` before broad discovery in mature repositories
- normalize the synthesized model back down to the smallest correct set of top-level entities

### 5. Add change-aware governance

- use `diff --compat --policy`
- use `impact` and `constraints` where semantic review matters
- keep concrete command execution repo-local

### 6. Operationalize

- add CI checks that match the team’s risk appetite
- keep ownership, lifecycle, and traceability disciplined
- provide clear human and agent guidance

## Delivery bar

An adoption slice is credible when:

- the intended architecture exists as entities
- the storage mode is explicit and stable
- the validation loop is runnable
- reviewers can consume the model in normal delivery
- documentation explains the architecture without competing with the source of truth

## Read next

- [choose-your-path.md](choose-your-path.md)
- [../workflows/model-the-repo.md](../workflows/model-the-repo.md)
- [../workflows/review-and-analysis.md](../workflows/review-and-analysis.md)
