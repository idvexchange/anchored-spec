---
apiVersion: backstage.io/v1alpha1
kind: API
metadata:
  name: payments-api
  description: RESTful API for payment processing.
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

The Payments API provides RESTful endpoints for creating, querying, and managing payments.

<!-- @anchored-spec:endpoints payments-endpoints -->

| Method | Path | Description |
|---|---|---|
| POST | /payments | Create a new payment |
| GET | /payments/{id} | Get payment by ID |
| POST | /payments/{id}/refund | Refund a payment |
| GET | /payments?status={status} | List payments by status |

<!-- @anchored-spec:end -->
