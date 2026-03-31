---
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: payment-service
  description: Processes payments via Stripe and internal ledger.
  annotations:
    anchored-spec.dev/confidence: "0.85"
    anchored-spec.dev/source: src/payments/
    anchored-spec.dev/expect-anchors: code-symbols,endpoints
  tags:
    - typescript
    - stripe
spec:
  type: service
  lifecycle: production
  owner: group:default/payments-team
  system: billing-system
  providesApis:
    - api:default/payments-api
  dependsOn:
    - resource:default/ledger-db
---

# Payment Service

The payment service handles all monetary transactions for the platform.

## Architecture

```mermaid
graph LR
    Client --> PaymentAPI
    PaymentAPI --> StripeSDK
    PaymentAPI --> LedgerDB
    PaymentAPI --> NotificationService
```

## Key Flows

### Charge Flow

1. Client submits payment intent
2. Service validates amount and currency
3. Stripe charge created
4. Ledger entry written
5. Confirmation sent via notification service

<!-- @anchored-spec:events payment-events -->

| Event | Payload | Description |
|---|---|---|
| payment.created | PaymentIntent | New payment initiated |
| payment.succeeded | PaymentResult | Payment completed successfully |
| payment.failed | PaymentError | Payment processing failed |
| payment.refunded | RefundResult | Payment refunded |

<!-- @anchored-spec:end -->

## API Contract

See [Payments API](./payments-api.md) for the full OpenAPI specification.
