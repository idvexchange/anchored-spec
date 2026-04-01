# Model Health Metrics

A healthy architecture model is current, connected, reviewable, and useful.

## What to measure

Anchored-spec can support practical model-health metrics such as:

- ownership coverage
- trace coverage
- drift finding count and severity
- exception age and expiry profile
- inferred vs declared ratio
- orphan entity count
- relation density for core runtime entities
- report completeness for key domains

## Good leading indicators

### Ownership coverage

If key entities do not have owners, the model will degrade quickly.

### Declared vs inferred balance

A large pile of inferred entities usually means discovery is running ahead of curation.

### Traceability coverage

If important components, APIs, and governance kinds are not linked to docs or source paths, reviewers lose context.

### Drift trend

Watch whether drift is shrinking, stable, or growing. A growing drift heatmap is usually a sign that the model is not being maintained in step with delivery.

### Exception hygiene

Exceptions should be visible, bounded, and aging toward resolution. A high volume of stale exceptions is a model health smell.

## How to use the metrics

Use model metrics for improvement, not vanity dashboards.

Good uses:

- release readiness review
- architecture maintenance planning
- deciding where to add traceability next
- identifying domains that need owner attention

Poor uses:

- maximizing entity count for its own sake
- forcing exhaustive modeling before the model is operationally useful
