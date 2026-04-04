---
type: guide
status: current
audience:
  - developer
  - architect
domain:
  - systems
ea-entities:
  - component:default/anchored-spec-library
  - capability:default/manifest-authoring
---

# Relation Cheat Sheet

Use the smallest relation that captures the architectural fact.

| Use case | Preferred field | Typical source | Typical target |
| --- | --- | --- | --- |
| Runtime or build dependency | `dependsOn` | `Component` | `Component` or `Resource` |
| API exposure | `providesApis` | `Component` | `API` |
| API consumption | `consumesApis` | `Component` | `API` |
| Capability realization | `supports` | `Component` | `Capability` |
| Decision dependency | `dependsOn` | `Decision` | `Decision`, `Capability`, or `Requirement` |

## Rules of Thumb

- Use `dependsOn` for things that must exist for the source to function.
- Use `providesApis` or `consumesApis` instead of hiding API relationships inside descriptions.
- Use capability links sparingly; they should explain why a subsystem exists, not restate every code dependency.
- If the relation would not change any review or analysis workflow, it may not be worth authoring.
