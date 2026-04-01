---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: payments-api
  description: REST API for creating, querying, and refunding payments.
  annotations:
    anchored-spec.dev/confidence: "0.9"
spec:
  type: openapi
  lifecycle: production
  owner: group:default/payments-team
  system: billing-system
  definition: |
    openapi: "3.1.0"
    info:
      title: Payments API
      version: "2.1.0"
    paths:
      /payments:
        post:
          summary: Create a payment
      /payments/{id}:
        get:
          summary: Get payment status
---

# Payments API

This document represents the API contract in inline mode. The descriptor in frontmatter is the source of truth for the entity, while the body captures human-readable contract notes and fact blocks that anchored-spec can analyze.

## Responsibilities

The API supports:

- payment creation
- payment lookup
- refund initiation
- filtered list views for operational workflows

<!-- @anchored-spec:endpoints payments-endpoints -->
| Method | Path | Description |
|---|---|---|
| POST | /payments | Create a new payment |
| GET | /payments/{id} | Fetch the state of a payment |
| POST | /payments/{id}/refund | Start a refund |
| GET | /payments?status={status} | List payments by status |
<!-- @anchored-spec:end -->

## Usage notes

In a real project, the `definition` field would usually reference a local OpenAPI file through `$text`, or contain a fuller embedded contract body.
