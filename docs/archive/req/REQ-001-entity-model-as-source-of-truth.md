# REQ-001: Entity Model as Source of Truth

## Requirement

The framework shall treat the authored entity model as the primary architecture source of truth.

## Behavior Statements

- When a repository uses Anchored Spec, the framework shall load architecture from entity descriptors rather than infer it only from prose.
- When downstream workflows run, they shall read the same normalized entity graph.
- When analysis finds conflicting observed data, the framework shall surface the conflict without silently replacing the authored model.

## Rationale

This requirement is the foundation for validation, governance, and trustworthy review automation.

## Implementation References

- `src/ea/loader.ts`
- `src/ea/backstage/`
- `src/ea/discovery.ts`
- `src/ea/drift.ts`
