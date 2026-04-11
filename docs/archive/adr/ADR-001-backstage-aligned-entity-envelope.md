# ADR-001: Backstage-Aligned Entity Envelope

## Status

Accepted

## Context

Anchored Spec needed one stable authored format that could support validation, relation analysis, discovery matching, governance, and future interoperability.

## Decision

Use the Backstage entity envelope as the primary authored architecture format:

- `apiVersion`
- `kind`
- `metadata`
- `spec`

## Consequences

### Positive

- one typed source of truth
- alignment with an existing ecosystem model
- easier reuse of entity references and relation patterns

### Negative

- some enterprise-architecture concepts need custom kinds
- authoring discipline matters more than in prose-only docs

## Implementation References

- `src/ea/backstage/`
- `src/ea/validate.ts`
- `src/ea/index.ts`
