# Relation Cheat Sheet

Use this sheet when you know two things are connected but want the most appropriate current relation expression.

## Common choices

| You mean | Prefer authoring as |
|---|---|
| a component uses another runtime dependency | `spec.dependsOn` |
| a component serves an API | `spec.providesApis` |
| a consumer or component uses an API | `spec.consumesApis` |
| an entity belongs to a system | `spec.system` |
| a system belongs to a domain | `spec.domain` |
| a group owns an entity | `spec.owner` |

## Example

```yaml
spec:
  owner: group:default/platform-team
  system: commerce-platform
  dependsOn:
    - resource:default/orders-db
  providesApis:
    - api:default/orders-api
```

## Custom-kind guidance

When using anchored-spec custom kinds, prefer the schema's named field over inventing a generic relation.

For example:

- use `implementedBy` for requirements
- use explicit transition references for plans and baselines
- use exception fields for bounded deviations

## Decision rule

If Backstage already has a standard place for the relationship, use it.

If not, use the specific anchored-spec custom-kind field defined by the schema.
