---
type: guide
status: current
audience:
  - developer
  - architect
  - maintainer
domain:
  - delivery
ea-artifacts:
  - capability:manifest-authoring
  - capability:traceability
  - capability:governed-evolution
  - api:cli-command-surface
---

# Getting Started

This guide shows the preferred manifest-mode workflow.

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
npx anchored-spec create application --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create api-contract --title "Orders API" --owner group:default/platform-team
```

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
