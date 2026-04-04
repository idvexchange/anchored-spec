---
type: guide
status: current
audience:
  - developer
  - architect
  - maintainer
domain:
  - delivery
ea-entities:
  - capability:default/manifest-authoring
  - capability:default/traceability
  - capability:default/governed-evolution
  - api:default/anchored-spec-cli-api
  - component:default/anchored-spec-cli
---

# Getting Started

This guide shows the preferred manifest-mode workflow.

For a more opinionated path, use `docs/delivery/top-down-authoring.md` when you want to author the target model intentionally, `docs/delivery/bottom-up-discovery.md` when you want to bootstrap from code, contracts, or infrastructure, and `docs/delivery/choosing-a-modeling-approach.md` when you need to decide between the two.

## 1. Install

```bash
pnpm add -D anchored-spec
```

## 2. Initialize the repo

```bash
npx anchored-spec init --mode manifest
```

Manifest mode creates one root `catalog-info.yaml` and linked markdown under `docs/`. In this repo, documents are grouped by primary EA domain, with cross-domain membership kept in frontmatter.

## 3. Create the first entities

```bash
npx anchored-spec create --kind Component --type website --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform-team
```

The `create` command now takes an explicit Backstage descriptor selection. Use `--kind` for the real entity kind, `--type` for `spec.type`, and `--schema` only when a kind/type pair is ambiguous across multiple schema profiles.

Then validate immediately:

```bash
npx anchored-spec validate
```

## 4. Add architecture documentation

Create linked architecture material for the important entities:

```bash
npx anchored-spec create-doc --type architecture --title "Orders Service Architecture" --entities component:orders-service
```

For human-authored docs, keep the frontmatter and the linked entity refs current.

## 5. Run the operating loop

```bash
npx anchored-spec validate
npx anchored-spec trace --summary
npx anchored-spec drift
npx anchored-spec report --view traceability-index
```

When a change affects contracts or lifecycle, add:

```bash
npx anchored-spec diff --base main --compat --policy
npx anchored-spec reconcile --include-trace --include-docs
```
