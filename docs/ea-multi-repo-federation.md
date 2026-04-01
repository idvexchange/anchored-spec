# Multi-Repo Federation

Anchored Spec is local-first, but the model can still be used across repository boundaries.

## Default posture

The framework assumes each repository owns and validates its own model locally.

That local-first design keeps the tool lightweight and makes it easy to run in developer workflows and CI without standing up a service.

## Federation use cases

Cross-repo architecture becomes important when:

- one platform publishes APIs consumed by other repositories
- shared data contracts span teams
- governance kinds reference systems outside the current repository
- central documentation needs pointers to bounded contexts maintained elsewhere

## Practical current approach

A good current federation strategy is:

1. keep each repo authoritative for its own entities
2. use stable entity refs and docs for cross-repo references
3. publish generated reports or manifests where other repos can consume them
4. keep strong local validation even if some upstream context is external

## What anchored-spec is good at today

Today the framework is strongest when used to:

- model one repo thoroughly
- make dependencies explicit
- export graphs and reports for cross-team review
- use documentation and CI artifacts to bridge repository boundaries

## What to avoid

Do not design your day-one workflow around an assumed always-on central registry unless you are building one explicitly around the descriptors.

The current framework is optimized for repository-native execution first.
