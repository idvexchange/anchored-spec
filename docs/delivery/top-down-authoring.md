---
type: guide
status: current
audience:
  - developer
  - architect
  - maintainer
domain:
  - delivery
  - business
ea-entities:
  - resource:default/documentation-set
  - component:default/anchored-spec-cli
  - capability:default/manifest-authoring
  - capability:default/traceability
  - capability:default/governed-evolution
---

# Top-Down Authoring

Use this workflow when you already know the intended architecture and want to author the model deliberately rather than discover it from existing artifacts.

Top down means you begin from the target structure, ownership, and boundaries, then fill in runtime detail and documentation beneath that structure.

## Default Loop

```bash
npx anchored-spec init --mode manifest
npx anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform-team
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform-team
npx anchored-spec validate
npx anchored-spec trace --summary
```

Use `npx anchored-spec create --list` whenever you need to see the supported descriptor shapes.

## Domain and System First

```bash
npx anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform-team
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec validate
```

## Runtime Surface First

```bash
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create --kind Component --type website --title "Orders App" --owner group:default/platform-team
npx anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform-team
npx anchored-spec create --kind Resource --type database --schema data-store --title "Orders DB" --owner group:default/platform-team
npx anchored-spec validate
```

## Link Documentation Early

```bash
npx anchored-spec create-doc --type architecture --title "Orders Service Architecture" --entities component:default/orders-service
npx anchored-spec create-doc --type guide --title "Checkout Operating Model" --entities system:default/checkout-platform
npx anchored-spec trace --summary
```

## Add Governance Once the Core Model Exists

```bash
npx anchored-spec validate
npx anchored-spec diff --base main --compat --policy
npx anchored-spec report --view traceability-index
npx anchored-spec reconcile --include-trace --include-docs
```

## Intentional EA Layering

```bash
npx anchored-spec create --kind Capability --title "Order Fulfilment" --owner group:default/platform-team
npx anchored-spec create --kind Decision --title "Repository-Local Architecture Workflow" --owner group:default/platform-team
npx anchored-spec validate
```

Choose top down when:

- you are starting a new repository
- you already know the target boundaries
- ownership and review structure matter early
- you want a clean catalog before discovery

If the repository already has a lot of existing reality but little explicit modeling, start with `docs/delivery/bottom-up-discovery.md` instead.
