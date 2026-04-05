# Domain Types

This document highlights the most important TypeScript types that shape the framework domain.

## Shared EA Types

Defined in `src/ea/types.ts`:

- `EaDomain`
- `EntityStatus`
- `EntityConfidence`
- `EaRelation`
- `EaTraceRef`
- `TransitionMilestone`
- `TransitionRisk`
- `EaBehaviorStatement`

These types define the shared vocabulary for domains, lifecycle, confidence, traceability, and requirements-style behavior statements.

## Public Runtime Types

Re-exported through `src/ea/index.ts`:

- validation result and error types
- loader result types
- graph node and edge types
- impact report types
- drift finding and report types
- discovery report types
- evidence record types
- generator and resolver interfaces

## Why These Types Matter

The framework is not just a CLI. The exported types define the programmatic contract for:

- custom integrations
- test fixtures
- extension seams
- downstream automation

## Implementation References

- `src/ea/types.ts`
- `src/ea/index.ts`
- `src/ea/validate.ts`
- `src/ea/discovery.ts`
- `src/ea/evidence.ts`
