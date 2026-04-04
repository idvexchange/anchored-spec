---
type: guide
status: current
audience:
  - architect
  - developer
  - maintainer
domain:
  - delivery
  - business
ea-entities:
  - resource:default/documentation-set
  - component:default/anchored-spec-cli
  - capability:default/manifest-authoring
  - capability:default/discovery
  - capability:default/traceability
  - capability:default/governed-evolution
---

# Choosing A Modeling Approach

Use this guide when you need to decide whether to start bottom up, top down, or with a mixed approach.

The short version is:

- choose bottom up when reality already exists and the model is missing
- choose top down when the target architecture is already known
- choose mixed when both are true and you need convergence rather than purity

## Decision Table

| Situation | Recommended approach | Why |
| --- | --- | --- |
| Existing codebase, little explicit architecture | Bottom up | Discovery gives you a fast draft from reality |
| New repository or greenfield system | Top down | You can author the target model cleanly before drift accumulates |
| Existing contracts and infra, but boundaries are still being redesigned | Mixed | Discover reality, then deliberately reshape it |
| Strong docs exist, weak catalog exists | Bottom up from docs, then mixed | Frontmatter and markdown discovery can recover structure quickly |
| Team needs ownership, review, and governance early | Top down | Explicit entities and linked docs are more stable than inferred drafts |
| Team needs a bootstrap in a messy monorepo | Bottom up first | Discovery reduces blank-page effort |
| Platform team standardizing many repos | Top down with selective bottom-up validation | Standards should be authored intentionally, then checked against reality |

## Bottom-Up

Use bottom up when the repository already contains meaningful truth in:

- source code
- OpenAPI contracts
- Kubernetes manifests
- Terraform state
- SQL DDL
- dbt artifacts
- markdown docs

Start here when the hardest problem is extracting an initial model.

Typical sequence:

```bash
npx anchored-spec discover --dry-run
npx anchored-spec discover
npx anchored-spec validate
npx anchored-spec drift
```

Strengths:

- fastest bootstrap from existing reality
- reduces blank-page modeling effort
- works well in legacy or partially understood repos

Tradeoffs:

- discovery creates drafts, not final truth
- names and boundaries often need cleanup
- ownership and rationale usually need manual authoring afterward

See `docs/delivery/bottom-up-discovery.md` for stack-specific recipes.

## Top-Down

Use top down when the repository should reflect an intended architecture rather than merely describe today’s implementation.

Start here when the hardest problem is not extraction, but intentional structure.

Typical sequence:

```bash
npx anchored-spec init --mode manifest
npx anchored-spec create --kind Domain --title "Commerce" --owner group:default/platform-team
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec validate
npx anchored-spec trace --summary
```

Strengths:

- clean ownership and boundaries from the start
- stable entity naming
- easier governance and review setup

Tradeoffs:

- slower if the repo already contains a lot of undocumented reality
- requires stronger architectural intent up front
- may miss operational truth until drift and discovery are added

See `docs/delivery/top-down-authoring.md` for authoring recipes.

## Mixed

Use the mixed approach when you want both:

- a quick draft from reality
- a clean target model with deliberate boundaries

This is usually the strongest enterprise workflow.

Typical sequence:

```bash
npx anchored-spec discover --resolver openapi --source ./openapi.yaml --dry-run
npx anchored-spec discover --resolver tree-sitter --source ./src --dry-run
npx anchored-spec discover
npx anchored-spec validate
npx anchored-spec create --kind System --title "Checkout Platform" --owner group:default/platform-team
npx anchored-spec create-doc --type architecture --title "Checkout Platform Architecture" --entities system:default/checkout-platform
npx anchored-spec trace --summary
npx anchored-spec drift
npx anchored-spec reconcile --include-trace --include-docs
```

Strengths:

- fastest path to useful coverage
- still allows deliberate cleanup and target shaping
- best fit for real-world modernization work

Tradeoffs:

- requires discipline to merge drafts into a clean catalog
- can create noise if discovery runs before naming conventions are agreed

## Practical Recommendation

For most mature repositories:

1. start bottom up to avoid blank-page modeling
2. normalize the discovered drafts into a clean Backstage-first model
3. switch to top-down maintenance for new architectural intent
4. keep discovery and drift as validation pressure, not as the primary authoring loop

That pattern usually gives the best balance between realism and architecture quality.
