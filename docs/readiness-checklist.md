# Readiness Checklist

Use this checklist before calling an Anchored Spec rollout or delivery slice complete.

## Baseline readiness

- Node.js version and package manager expectations are understood
- the repository can build, test, lint, and type-check
- the team has chosen manifest mode or inline mode intentionally
- the public CLI commands needed for the rollout are known

## Modeling readiness

- at least one real architecture slice is authored
- the chosen entities have clear names and meaningful descriptions
- ownership is present where the team expects operational accountability
- relations communicate actual behavior, not adjacency

## Discovery readiness

- the team knows which source types are trustworthy enough to discover from
- discovery is run with `--dry-run` first on large repositories
- discovered drafts are reviewed before being treated as authoritative

## Review readiness

- `validate` is part of the normal local loop
- at least one reviewer-facing artifact is easy to produce
- the team understands when to use `diff`, `impact`, and `constraints`

## Delivery readiness

- a minimum CI strategy is defined
- release or publish steps are known
- maintainers know how to investigate build, test, or validation failures

## AI readiness

- agent-facing instructions reflect the current framework
- AI-generated changes are expected to preserve the entity model
- context assembly is used where an agent needs architecture-aware input

## Exit gate

Do not mark the implementation ready if the repository only has prose and no credible model, or if the model exists but reviewers cannot use it in normal delivery.
