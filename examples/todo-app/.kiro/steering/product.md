# Product Context

This project uses anchored-spec for enterprise architecture governance.

## Goals
- Maintain a living architecture model as code
- Validate specs against 55 JSON schemas
- Detect drift between declared and observed state
- Track artifact lifecycle from draft to retired

## Workflows
- Spec-first: write the spec before the code
- Discovery: bootstrap specs from existing infrastructure
- Drift detection: continuous validation of spec ↔ reality alignment
- Governed evolution: diff → compat check → reconcile pipeline
