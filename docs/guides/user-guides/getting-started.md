# Getting Started

This guide shows the shortest path to using Anchored Spec on a repository.

## 1. Install

```bash
pnpm add -D anchored-spec
```

## 2. Initialize

```bash
npx anchored-spec init --mode manifest
```

Use inline mode only if the repository is intentionally docs-first.

## 3. Inspect the supported descriptor shapes

```bash
npx anchored-spec create --list
```

## 4. Create the first model slice

```bash
npx anchored-spec create --kind Component --type service --title "Orders Service" --owner group:default/platform-team
npx anchored-spec create --kind API --type openapi --title "Orders API" --owner group:default/platform-team
```

## 5. Validate immediately

```bash
npx anchored-spec validate
```

## 6. Add reviewer-facing outputs

```bash
npx anchored-spec graph --format mermaid
npx anchored-spec report --view traceability-index
```

## 7. Add broader workflows when useful

```bash
npx anchored-spec discover --dry-run
npx anchored-spec drift
npx anchored-spec diff --base main --compat --policy
```

## Read Next

- [choosing-a-modeling-approach.md](choosing-a-modeling-approach.md)
- [top-down-authoring.md](top-down-authoring.md)
- [bottom-up-discovery.md](bottom-up-discovery.md)
