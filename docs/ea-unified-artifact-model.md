# Entity Model

This document defines the current authored model for anchored-spec repositories.

## Core shape

Anchored Spec uses the Backstage entity envelope as the source-of-truth descriptor format.

```yaml
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: payments-api
  title: Payments API
  description: Public API for creating and querying payments.
  annotations:
    anchored-spec.dev/confidence: declared
spec:
  type: openapi
  lifecycle: production
  owner: group:default/payments-team
  system: billing-platform
```

The authored contract is always:

- `apiVersion`
- `kind`
- `metadata`
- `spec`

## Identity

Anchored Spec uses canonical entity refs in runtime workflows.

Supported ref forms include:

- `payments-api`
- `api:payments-api`
- `default/payments-api`
- `api:default/payments-api`

Use the fully qualified form when writing docs, CI commands, or user-facing guidance.

## Metadata expectations

Common metadata fields:

- `metadata.name` — stable slug used for identity
- `metadata.title` — human-friendly display name
- `metadata.description` — concise architectural summary
- `metadata.annotations` — anchored-spec analysis metadata
- `metadata.tags` — optional classification or discovery hints

## Spec expectations

The exact `spec` fields depend on the kind, but common patterns include:

- `spec.type`
- `spec.lifecycle`
- `spec.owner`
- `spec.system`
- `spec.domain`
- `spec.dependsOn`
- `spec.providesApis`
- `spec.consumesApis`

Anchored-spec custom kinds may additionally use kind-specific fields such as `status`, `decision`, `rationale`, `implementedBy`, or transition metadata.

## Lifecycle

Built-in Backstage kinds typically use `spec.lifecycle`.

Common values in anchored-spec workflows include:

- `draft`
- `planned`
- `production`
- `deprecated`
- `retired`

Custom kinds may use a more explicit `spec.status` field depending on the schema.

## Confidence

Anchored Spec distinguishes between:

- `declared` — authored and trusted
- `observed` — detected from a source or environment
- `inferred` — heuristically discovered and awaiting review

Confidence is usually stored in `anchored-spec.dev/confidence`.

## Traceability

Entities can link back to supporting material through trace references and source annotations.

Typical patterns:

- `anchored-spec.dev/source` points to code or source material
- `spec.traceRefs` links to documents, files, or supporting paths
- `link-docs` and `trace` keep docs and entities connected

## Descriptor substitutions

Descriptor bodies may reference local files through:

- `$text`
- `$json`
- `$yaml`

This is especially useful for embedded API definitions or schema bodies.

## Authoring principles

A good entity is:

- specific enough to be operationally useful
- connected to related entities through meaningful relations
- linked to docs or code when traceability matters
- maintained in the same review flow as the code it describes
