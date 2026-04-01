# Transitions, Evidence, and Reporting

Anchored Spec supports more than static architecture metadata. It also helps teams manage change, validate readiness, and produce views for review.

## Lifecycle transitions

The `transition` command advances entities through lifecycle gates.

Typical use cases:

- move a draft entity into active use
- retire an outdated API or component
- manage custom governance kinds with explicit statuses

Transition checks enforce practical quality expectations such as ownership, description quality, and relationship completeness before promotion.

## Exceptions and controlled deviations

The `Exception` custom kind exists for managed deviations.

Use exceptions when:

- a known drift finding is temporarily acceptable
- a policy violation is intentionally time-boxed
- an architectural gap is approved with an expiry and owner

Exception reporting is part of the built-in report set, so temporary deviations remain visible instead of disappearing into prose.

## Evidence workflows

Anchored Spec ships an `evidence` command group with three core actions:

- `ingest`
- `validate`
- `summary`

Evidence can capture support for architecture claims such as:

- tests
- contracts
- deployments
- inventories
- catalog snapshots
- lineage checks
- policy checks
- security results
- performance verification

Evidence lets teams move beyond “the entity says this is true” and into “the repository has support for why we believe it.”

## Report views

Current report views include:

- `system-data-matrix`
- `classification-coverage`
- `capability-map`
- `gap-analysis`
- `exceptions`
- `drift-heatmap`
- `traceability-index`

Examples:

```bash
npx anchored-spec report --view drift-heatmap
npx anchored-spec report --view exceptions
npx anchored-spec report --all --format markdown --output-dir ea/generated
```

## Gap analysis

Gap analysis reports compare a baseline, a target, and an optional transition plan.

This is useful when teams want to model planned architecture change explicitly instead of treating change as an unstructured narrative.

## Recommended operating pattern

A strong workflow for change-heavy teams is:

1. author or update entities
2. link the change to docs and evidence
3. run `validate`, `drift`, and `diff`
4. review report views for exceptions, traceability, and drift heat
5. use transitions to promote or retire entities deliberately
