# Relationship Model

Relationships are how anchored-spec turns a set of descriptors into an architecture graph.

## Two kinds of relationships

Anchored Spec works with two relationship categories.

### Authored relationships

These are stored directly in entity `spec` fields when Backstage already provides a place for them.

Examples:

- `spec.dependsOn`
- `spec.providesApis`
- `spec.consumesApis`
- `spec.owner`
- `spec.system`
- `spec.domain`

### Derived relationships

These are computed by anchored-spec at runtime for graphing and analysis.

Examples include relationships inferred from:

- ownership
- API provision and consumption
- system and domain membership
- custom-kind fields such as `implementedBy`
- traceability and documentation links

Derived relationships are what power `graph`, `impact`, `diff`, `report`, and `drift` without forcing authors to duplicate that information in a large manual relation array.

## Practical relation semantics

Common meanings in the current framework:

| Authored field | Runtime relation meaning |
|---|---|
| `spec.dependsOn` | this entity relies on another one |
| `spec.providesApis` | a component provides an API |
| `spec.consumesApis` | a component or consumer uses an API |
| `spec.owner` | a group owns the entity |
| `spec.system` | the entity is part of a system |
| `spec.domain` | the system is part of a domain |

## Choosing the right relationship

Prefer the most semantically specific field that already exists.

Examples:

- use `providesApis` instead of a vague custom “exposes” idea
- use `dependsOn` for operational dependencies
- use `system` and `domain` for topology and organizational structure
- use custom-kind schema fields only when the concept is not covered by built-in Backstage semantics

## Relations in docs and commands

Entity refs in relationships should use canonical refs when clarity matters.

Example:

```yaml
spec:
  providesApis:
    - api:default/payments-api
  dependsOn:
    - resource:default/ledger-db
```

## Why derived relationships matter

Derived relationships let the same authored data drive multiple workflows:

- graph visualization
- impact analysis
- semantic diff
- drift rules
- traceability reports
- compatibility and policy review

That keeps the authored descriptors simpler while still producing a rich runtime graph.
